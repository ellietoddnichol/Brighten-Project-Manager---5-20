import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DRIVE_FOLDER_MAPPING_RULES,
  ScannedDriveFolder,
} from '../models/drive-folder-mapping.types';
import { FolderLinkStatus, Project, ProjectFolder } from '../models/types';
import { driveFolderUrl, matchFoldersToRules } from '../utils/drive-folder-matcher';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { DriveService } from './drive.service';

export type DiscoveryResult = {
  projectId: string;
  scannedCount: number;
  linkedCount: number;
  missingCount: number;
  needsReviewCount: number;
  skippedManual: number;
  authRequired: boolean;
  error?: string;
};

@Injectable({ providedIn: 'root' })
export class DriveFolderDiscoveryService {
  private data = inject(DataService);
  private drive = inject(DriveService);
  private auth = inject(AuthService);

  /** Create Firestore folder-link rows without calling Drive. */
  async initializeFolderLinks(projectId: string, projectRootId?: string): Promise<void> {
    const existing = this.data.projectFoldersSnapshot().filter(f => f.projectId === projectId);
    const now = new Date().toISOString();

    for (const rule of DRIVE_FOLDER_MAPPING_RULES) {
      const row = existing.find(f => f.folderKey === rule.key);
      if (row) continue;

      const isRoot = rule.key === 'PROJECT_ROOT';
      await firstValueFrom(this.data.createProjectFolder({
        projectId,
        folderKey: rule.key,
        folderName: rule.displayName,
        folderId: isRoot ? projectRootId : undefined,
        folderUrl: isRoot && projectRootId ? driveFolderUrl(projectRootId) : undefined,
        drivePath: isRoot ? '(project folder)' : undefined,
        sortOrder: rule.sortOrder,
        isRequired: rule.isSystemRequired,
        matchedBy: isRoot && projectRootId ? 'manual' : 'missing',
        confidence: isRoot && projectRootId ? 'high' : 'missing',
        linkStatus: isRoot && projectRootId ? 'Linked' : 'Missing',
        lastScannedAt: isRoot && projectRootId ? now : undefined,
      }));
    }
  }

  async scanFolderTree(rootId: string, maxDepth = 2): Promise<ScannedDriveFolder[]> {
    const normalized = rootId.trim();
    const out: ScannedDriveFolder[] = [];

    const walk = async (parentId: string, prefix: string, depth: number) => {
      if (depth > maxDepth) return;
      const folders = await this.drive.listFolders(parentId);
      for (const f of folders) {
        const path = prefix ? `${prefix}/${f.name}` : f.name;
        out.push({ id: f.id, name: f.name, path, parentId, depth });
        if (depth < maxDepth) {
          await walk(f.id, path, depth + 1);
        }
      }
    };

    await walk(normalized, '', 1);
    return out;
  }

  async discoverProjectFolders(
    project: Project,
    options: { replaceManual?: boolean } = {},
  ): Promise<DiscoveryResult> {
    const projectId = project.id;
    const rootId = project.driveFolderId;

    if (!rootId) {
      return {
        projectId,
        scannedCount: 0,
        linkedCount: 0,
        missingCount: DRIVE_FOLDER_MAPPING_RULES.length,
        needsReviewCount: 0,
        skippedManual: 0,
        authRequired: false,
        error: 'No project Drive folder linked.',
      };
    }

    const token = await this.auth.getAccessToken();
    if (!token) {
      await this.initializeFolderLinks(projectId, rootId);
      await this.syncProjectRootLink(projectId, rootId);
      return {
        projectId,
        scannedCount: 0,
        linkedCount: 1,
        missingCount: DRIVE_FOLDER_MAPPING_RULES.length - 1,
        needsReviewCount: 0,
        skippedManual: 0,
        authRequired: true,
      };
    }

    await this.initializeFolderLinks(projectId, rootId);

    try {
      const scanned = await this.scanFolderTree(rootId, 2);
      const matches = matchFoldersToRules(scanned);
      const existing = this.data.projectFoldersSnapshot().filter(f => f.projectId === projectId);
      const now = new Date().toISOString();

      let linkedCount = 0;
      let missingCount = 0;
      let needsReviewCount = 0;
      let skippedManual = 0;

      await this.upsertLinkRow(existing, projectId, 'PROJECT_ROOT', {
        folderId: rootId,
        folderUrl: driveFolderUrl(rootId),
        drivePath: '(project folder)',
        matchedBy: 'exact',
        confidence: 'high',
        linkStatus: 'Linked',
        needsReview: false,
        lastScannedAt: now,
      });

      for (const rule of DRIVE_FOLDER_MAPPING_RULES) {
        if (rule.key === 'PROJECT_ROOT') {
          linkedCount++;
          continue;
        }

        const row = existing.find(f => f.folderKey === rule.key)
          ?? this.data.projectFoldersSnapshot().find(f => f.projectId === projectId && f.folderKey === rule.key);

        if (row?.linkStatus === 'Manual' && row.folderId && !options.replaceManual) {
          skippedManual++;
          if (row.folderId) linkedCount++;
          continue;
        }

        const match = matches.get(rule.key);
        if (match) {
          const linkStatus: FolderLinkStatus = match.needsReview ? 'Needs Review' : 'Linked';
          await this.upsertLinkRow(existing, projectId, rule.key, {
            folderId: match.folder.id,
            folderUrl: driveFolderUrl(match.folder.id),
            drivePath: match.folder.path,
            parentFolderId: match.folder.parentId,
            matchedBy: match.matchedBy,
            confidence: match.confidence,
            linkStatus,
            needsReview: match.needsReview,
            lastScannedAt: now,
            notes: match.needsReview ? 'Multiple possible matches — review recommended.' : undefined,
          });
          linkedCount++;
          if (match.needsReview) needsReviewCount++;
        } else {
          await this.upsertLinkRow(existing, projectId, rule.key, {
            folderId: undefined,
            folderUrl: undefined,
            drivePath: undefined,
            parentFolderId: undefined,
            matchedBy: 'missing',
            confidence: 'missing',
            linkStatus: 'Missing',
            needsReview: false,
            lastScannedAt: now,
            notes: undefined,
          });
          missingCount++;
        }
      }

      return {
        projectId,
        scannedCount: scanned.length,
        linkedCount,
        missingCount,
        needsReviewCount,
        skippedManual,
        authRequired: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drive scan failed';
      return {
        projectId,
        scannedCount: 0,
        linkedCount: 0,
        missingCount: 0,
        needsReviewCount: 0,
        skippedManual: 0,
        authRequired: message.includes('Not authenticated') || message.includes('Re-authorize'),
        error: message,
      };
    }
  }

  async manualLinkFolder(
    projectId: string,
    folderKey: string,
    driveFolderId: string,
    drivePath?: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const existing = this.data.projectFoldersSnapshot().filter(f => f.projectId === projectId);
    await this.upsertLinkRow(existing, projectId, folderKey, {
      folderId: driveFolderId,
      folderUrl: driveFolderUrl(driveFolderId),
      drivePath: drivePath ?? '(manual link)',
      matchedBy: 'manual',
      confidence: 'high',
      linkStatus: 'Manual',
      needsReview: false,
      lastScannedAt: now,
    });
  }

  async createMissingFolder(
    project: Project,
    folderKey: string,
  ): Promise<ProjectFolder> {
    const rootId = project.driveFolderId;
    if (!rootId) throw new Error('Link a project Drive folder first.');

    const rule = DRIVE_FOLDER_MAPPING_RULES.find(r => r.key === folderKey);
    if (!rule) throw new Error(`Unknown folder key: ${folderKey}`);

    const segments = rule.expectedPath.split('/').map(s => s.trim()).filter(Boolean);
    const folderName = segments[segments.length - 1] ?? rule.displayName;

    let parentId = rootId;
    if (segments.length > 1) {
      const parentPath = segments.slice(0, -1).join(' / ');
      const parentRule = DRIVE_FOLDER_MAPPING_RULES.find(r =>
        r.expectedPath.toLowerCase() === parentPath.toLowerCase(),
      );
      const parentLink = this.data.projectFoldersSnapshot().find(f =>
        f.projectId === project.id && f.folderKey === parentRule?.key,
      );
      if (parentLink?.folderId) {
        parentId = parentLink.folderId;
      } else {
        const parentName = segments[segments.length - 2];
        const createdParent = await this.drive.createFolder(rootId, parentName);
        parentId = createdParent.id;
      }
    }

    const created = await this.drive.createFolder(parentId, folderName);
    const path = segments.join(' / ');

    const existing = this.data.projectFoldersSnapshot().filter(f => f.projectId === project.id);
    await this.upsertLinkRow(existing, project.id, folderKey, {
      folderId: created.id,
      folderUrl: driveFolderUrl(created.id),
      drivePath: path,
      parentFolderId: parentId,
      matchedBy: 'manual',
      confidence: 'high',
      linkStatus: 'Manual',
      needsReview: false,
      lastScannedAt: new Date().toISOString(),
      notes: 'Created by user from Drive Mapping.',
    });

    const updated = this.data.projectFoldersSnapshot().find(f =>
      f.projectId === project.id && f.folderKey === folderKey,
    );
    if (!updated) throw new Error('Failed to save folder link.');
    return updated;
  }

  projectFolderLinks(projectId: string): ProjectFolder[] {
    return this.data.projectFoldersSnapshot()
      .filter(f => f.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  expectedPath(folderKey: string): string {
    return DRIVE_FOLDER_MAPPING_RULES.find(r => r.key === folderKey)?.expectedPath ?? folderKey;
  }

  private async syncProjectRootLink(projectId: string, rootId: string): Promise<void> {
    const existing = this.data.projectFoldersSnapshot().filter(f => f.projectId === projectId);
    await this.upsertLinkRow(existing, projectId, 'PROJECT_ROOT', {
      folderId: rootId,
      folderUrl: driveFolderUrl(rootId),
      drivePath: '(project folder)',
      matchedBy: 'manual',
      confidence: 'high',
      linkStatus: 'Linked',
      needsReview: false,
      lastScannedAt: new Date().toISOString(),
    });
  }

  private async upsertLinkRow(
    existing: ProjectFolder[],
    projectId: string,
    folderKey: string,
    patch: Partial<ProjectFolder>,
  ): Promise<void> {
    const rule = DRIVE_FOLDER_MAPPING_RULES.find(r => r.key === folderKey);
    let row = existing.find(f => f.folderKey === folderKey)
      ?? this.data.projectFoldersSnapshot().find(f => f.projectId === projectId && f.folderKey === folderKey);

    if (!row) {
      await firstValueFrom(this.data.createProjectFolder({
        projectId,
        folderKey,
        folderName: rule?.displayName ?? folderKey,
        sortOrder: rule?.sortOrder ?? 99,
        isRequired: rule?.isSystemRequired ?? false,
        ...patch,
      }));
      return;
    }

    await firstValueFrom(this.data.updateProjectFolder(row.id, patch));
  }
}
