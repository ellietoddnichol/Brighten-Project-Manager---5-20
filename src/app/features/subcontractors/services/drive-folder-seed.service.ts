import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { driveFolderUrl } from '@features/documents/utils/drive-folder-matcher';
import { auth } from '@app/firebase';
import seedBundle from '@app/data/seeds/drive-folder-seed.json';

export interface DriveFolderSeedEntry {
  jobNumber: string;
  projectName?: string;
  driveFolderId: string;
  lifecycleStatus?: 'inProgress' | 'closed';
}

export interface DriveFolderSeedBundle {
  meta: {
    generatedAt: string;
    source: string;
    inProgressCount: number;
    closedCount: number;
    totalCount: number;
    notes?: string;
  };
  topLevelFolders: { name: string; driveFolderId: string }[];
  duplicateReviews: { jobNumber: string; note: string }[];
  projectRoots: DriveFolderSeedEntry[];
}

export interface DriveFolderSeedResult {
  updated: number;
  skippedExisting: number;
  skippedDuplicateReview: number;
  skippedScope: number;
  unmatched: string[];
  syncedAt: string;
}

export type DriveLinkScope = 'active' | 'closed' | 'all';

const SEED = seedBundle as DriveFolderSeedBundle;
const IMPORTED_KEY = 'brighten.driveFolderSeedImportedAt';

export interface DriveFolderLinkStats {
  linkedActive: number;
  linkedClosed: number;
  missingActive: number;
  missingClosed: number;
  duplicateReview: number;
}

@Injectable({ providedIn: 'root' })
export class DriveFolderSeedService {
  private data = inject(DataService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);
  projectLinkStats = signal<DriveFolderLinkStats | null>(null);

  readonly seedMeta = SEED.meta;
  readonly duplicateReviews = SEED.duplicateReviews;
  readonly topLevelFolders = SEED.topLevelFolders;
  readonly projectRoots = SEED.projectRoots;

  stats = computed(() => {
    const duplicateJobs = new Set(SEED.duplicateReviews.map(d => d.jobNumber.trim()));
    const active = SEED.projectRoots.filter(r => r.lifecycleStatus !== 'closed' && !duplicateJobs.has(r.jobNumber));
    const closed = SEED.projectRoots.filter(r => r.lifecycleStatus === 'closed' && !duplicateJobs.has(r.jobNumber));
    const linkStats = this.projectLinkStats();
    return {
      activeSeeded: active.length,
      closedSeeded: closed.length,
      duplicateReview: duplicateJobs.size,
      total: SEED.projectRoots.length,
      linkedActive: linkStats?.linkedActive ?? null,
      linkedClosed: linkStats?.linkedClosed ?? null,
      missingActive: linkStats?.missingActive ?? null,
      missingClosed: linkStats?.missingClosed ?? null,
    };
  });

  async refreshProjectLinkStats(): Promise<void> {
    const duplicateJobs = new Set(SEED.duplicateReviews.map(d => d.jobNumber.trim()));
    const projects = await this.data.waitForProjectsLoaded();
    let linkedActive = 0;
    let linkedClosed = 0;
    let missingActive = 0;
    let missingClosed = 0;

    for (const row of SEED.projectRoots) {
      if (duplicateJobs.has(row.jobNumber.trim())) continue;
      const matches = findProjectMatches(projects, { projectNumber: row.jobNumber, projectName: row.projectName });
      const project = matches.length ? pickCanonicalProject(matches) : undefined;
      const linked = !!(project?.driveFolderId || project?.driveFolderUrl);
      const isClosed = row.lifecycleStatus === 'closed';
      if (isClosed) {
        if (linked) linkedClosed++;
        else missingClosed++;
      } else {
        if (linked) linkedActive++;
        else missingActive++;
      }
    }

    this.projectLinkStats.set({
      linkedActive,
      linkedClosed,
      missingActive,
      missingClosed,
      duplicateReview: duplicateJobs.size,
    });
  }

  async importIfNeeded(force = false): Promise<void> {
    const marker = localStorage.getItem(IMPORTED_KEY);
    if (!force && marker === SEED.meta.generatedAt) return;
    await this.syncDriveFolderIds(false, 'active');
    localStorage.setItem(IMPORTED_KEY, SEED.meta.generatedAt);
  }

  async syncDriveFolderIds(
    overwriteExisting = false,
    scope: DriveLinkScope = 'all',
  ): Promise<DriveFolderSeedResult> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to import Drive folder links.');

    this.syncing.set(true);
    const duplicateJobs = new Set(SEED.duplicateReviews.map(d => d.jobNumber.trim()));
    let updated = 0;
    let skippedExisting = 0;
    let skippedDuplicateReview = 0;
    let skippedScope = 0;
    const unmatched: string[] = [];

    try {
      const projects = await this.data.waitForProjectsLoaded();

      for (const row of SEED.projectRoots) {
        if (duplicateJobs.has(row.jobNumber.trim())) {
          skippedDuplicateReview++;
          continue;
        }

        const isClosed = row.lifecycleStatus === 'closed';
        if (scope === 'active' && isClosed) { skippedScope++; continue; }
        if (scope === 'closed' && !isClosed) { skippedScope++; continue; }

        const matches = findProjectMatches(projects, {
          projectNumber: row.jobNumber,
          projectName: row.projectName,
        });
        if (!matches.length) {
          unmatched.push(`J${row.jobNumber} ${row.projectName ?? ''}`.trim());
          continue;
        }

        const project = pickCanonicalProject(matches);
        if (project.driveFolderId && !overwriteExisting) {
          skippedExisting++;
          continue;
        }

        const folderId = row.driveFolderId.trim();
        await firstValueFrom(this.data.updateProject(project.id, {
          driveFolderId: folderId,
          driveFolderUrl: driveFolderUrl(folderId),
        }));
        updated++;
      }

      const result: DriveFolderSeedResult = {
        updated,
        skippedExisting,
        skippedDuplicateReview,
        skippedScope,
        unmatched,
        syncedAt: new Date().toISOString(),
      };

      const scopeLabel = scope === 'active' ? 'active' : scope === 'closed' ? 'closed/archive' : 'all';
      this.lastMessage.set(
        `Linked ${updated} ${scopeLabel} folder${updated === 1 ? '' : 's'}`
        + (skippedExisting ? ` · ${skippedExisting} already linked` : '')
        + (skippedDuplicateReview ? ` · ${skippedDuplicateReview} duplicate-review skipped` : '')
        + (unmatched.length ? ` · ${unmatched.length} unmatched` : ''),
      );
      await this.refreshProjectLinkStats();
      return result;
    } finally {
      this.syncing.set(false);
    }
  }
}
