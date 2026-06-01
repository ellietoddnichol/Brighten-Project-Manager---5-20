import { Injectable, inject } from '@angular/core';
import { Project } from '../models/types';
import { DRIVE_FOLDER_MAPPING_RULES } from '../models/drive-folder-mapping.types';
import { DataService } from './data.service';
import { ProjectControlsService } from './project-controls.service';
import { ProjectRequirementsService } from './project-requirements.service';

export type DocumentSaveTarget = {
  folderKey: string;
  folderId: string;
  drivePath?: string;
  usedFallback: boolean;
  warning?: string;
};

@Injectable({ providedIn: 'root' })
export class ProjectDocumentSaveService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);
  private requirements = inject(ProjectRequirementsService);

  resolveMappedFolder(project: Project, folderKey: string): DocumentSaveTarget | null {
    const link = this.data.projectFoldersSnapshot().find(f =>
      f.projectId === project.id && f.folderKey === folderKey && f.folderId,
    );
    if (!link?.folderId) return null;
    return {
      folderKey,
      folderId: link.folderId,
      drivePath: link.drivePath,
      usedFallback: false,
    };
  }

  resolveSaveTarget(
    project: Project,
    folderKey: string,
    fallbackKeys: string[] = [],
  ): DocumentSaveTarget | null {
    const rootId = project.driveFolderId;
    if (!rootId) return null;

    const keysToTry = [folderKey, ...fallbackKeys.filter(k => k !== folderKey)];

    for (const key of keysToTry) {
      const link = this.data.projectFoldersSnapshot().find(f =>
        f.projectId === project.id && f.folderKey === key && f.folderId,
      );
      if (link?.folderId) {
        return {
          folderKey: key,
          folderId: link.folderId,
          drivePath: link.drivePath,
          usedFallback: key !== folderKey,
          warning: key !== folderKey
            ? `Used ${this.displayName(key)} because ${this.displayName(folderKey)} was not mapped.`
            : undefined,
        };
      }
    }

    return {
      folderKey,
      folderId: rootId,
      drivePath: '(project root fallback)',
      usedFallback: true,
      warning: `Drive folder mapping needed for ${this.displayName(folderKey)}.`,
    };
  }

  async ensureSaveTarget(
    project: Project,
    folderKey: string,
    fallbackKeys: string[] = [],
  ): Promise<DocumentSaveTarget | null> {
    const target = this.resolveSaveTarget(project, folderKey, fallbackKeys);
    if (!target) return null;

    const isProjectRootFallback = target.usedFallback
      && target.folderId === project.driveFolderId
      && target.drivePath === '(project root fallback)';

    if (isProjectRootFallback && target.warning) {
      const level = this.requirements.requirementLevel(project, folderKey);
      if (level === 'required') {
        await this.controls.ensureSystemTask(
          project.id,
          `drive-folder-missing-${project.id}-${folderKey}`,
          target.warning,
          'Setup',
          { type: 'DriveFolder', id: folderKey },
        );
      }
    }

    return target;
  }

  savedToLabel(target: DocumentSaveTarget): string {
    if (target.usedFallback && target.drivePath === '(project root fallback)') {
      return 'Saved to project root because mapped folder was missing.';
    }
    if (target.drivePath && target.drivePath !== '(project root fallback)') {
      return `Saved to: ${target.drivePath}`;
    }
    return `Saved to: ${this.displayName(target.folderKey)}`;
  }

  displayName(folderKey: string): string {
    return DRIVE_FOLDER_MAPPING_RULES.find(r => r.key === folderKey)?.displayName ?? folderKey;
  }

  expectedPath(folderKey: string): string {
    return DRIVE_FOLDER_MAPPING_RULES.find(r => r.key === folderKey)?.expectedPath ?? '—';
  }
}
