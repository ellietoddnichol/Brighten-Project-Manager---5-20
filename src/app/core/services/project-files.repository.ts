import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { auth } from '@app/firebase';
import { Project, ProjectFile } from '@app/models/types';
import { enrichProjectFileOnSave, persistableFileMetadata } from '@features/projects/utils/project-documents.compute';
import { DataService } from '@core/services/data.service';
import { ActivityEventsService } from '@core/services/activity-events.service';

@Injectable({ providedIn: 'root' })
export class ProjectFilesRepository {
  private readonly data = inject(DataService);
  private readonly activity = inject(ActivityEventsService);

  /** Live list from DataService Firestore listener (migration in progress). */
  watchAll(): Observable<ProjectFile[]> {
    return this.data.getProjectFiles();
  }

  snapshot(): ProjectFile[] {
    return this.data.projectFilesSnapshot();
  }

  forProject(projectId: string, opts?: { includeArchived?: boolean }): ProjectFile[] {
    const files = this.snapshot().filter(f => f.projectId === projectId);
    if (opts?.includeArchived) return files;
    return files.filter(f => !f.archived);
  }

  create(file: Partial<ProjectFile>, project: Project): Observable<ProjectFile> {
    const payload = this.enrichForSave(file, project, { isNew: true });
    return this.data.createProjectFile(payload).pipe(
      tap(created => {
        void this.activity.recordEvent({
          projectId: project.id,
          entityType: 'project_file',
          entityId: created.id,
          action: 'project_file.created',
          title: `File added: ${created.fileName}`,
          after: this.auditSnapshot(created),
          source: 'documents',
        });
      }),
    );
  }

  update(id: string, updates: Partial<ProjectFile>, project: Project): Observable<ProjectFile> {
    const existing = this.snapshot().find(f => f.id === id);
    const payload = this.enrichForSave(
      existing ? { ...existing, ...updates } : updates,
      project,
      { isNew: false },
    );
    return this.data.updateProjectFile(id, payload).pipe(
      tap(updated => {
        void this.activity.recordEvent({
          projectId: project.id,
          entityType: 'project_file',
          entityId: id,
          action: 'project_file.updated',
          title: `File updated: ${updated.fileName}`,
          before: existing ? this.auditSnapshot(existing) : undefined,
          after: this.auditSnapshot(updated),
          source: 'documents',
        });
      }),
    );
  }

  archive(id: string, reason?: string): Observable<ProjectFile> {
    const existing = this.snapshot().find(f => f.id === id);
    if (!existing) {
      throw new Error(`Project file not found: ${id}`);
    }
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? 'unknown';
    const updates: Partial<ProjectFile> = {
      archived: true,
      archivedBy: actor,
      archiveReason: reason?.trim() || undefined,
      updatedBy: actor,
    };
    return this.data.updateProjectFile(id, updates).pipe(
      tap(archived => {
        void this.activity.recordEvent({
          projectId: existing.projectId,
          entityType: 'project_file',
          entityId: id,
          action: 'project_file.archived',
          title: `File archived: ${existing.fileName}`,
          before: this.auditSnapshot(existing),
          after: this.auditSnapshot(archived),
          source: 'documents',
        });
      }),
    );
  }

  restore(id: string): Observable<ProjectFile> {
    const existing = this.snapshot().find(f => f.id === id);
    if (!existing) {
      throw new Error(`Project file not found: ${id}`);
    }
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid ?? 'unknown';
    const updates: Partial<ProjectFile> = {
      archived: false,
      archivedAt: undefined,
      archivedBy: undefined,
      archiveReason: undefined,
      updatedBy: actor,
    };
    return this.data.updateProjectFile(id, updates).pipe(
      tap(restored => {
        void this.activity.recordEvent({
          projectId: existing.projectId,
          entityType: 'project_file',
          entityId: id,
          action: 'project_file.restored',
          title: `File restored: ${existing.fileName}`,
          before: this.auditSnapshot(existing),
          after: this.auditSnapshot(restored),
          source: 'documents',
        });
      }),
    );
  }

  /**
   * Admin-only hard delete — not exposed in document UI.
   * Prefer archive() for normal workflows.
   */
  async hardDeleteAdmin(id: string): Promise<void> {
    await firstValueFrom(this.data.hardDeleteProjectFile(id));
  }

  private enrichForSave(
    file: Partial<ProjectFile>,
    project: Project,
    opts: { isNew: boolean },
  ): Partial<ProjectFile> {
    const actor = auth.currentUser?.email ?? auth.currentUser?.uid;
    const enriched = enrichProjectFileOnSave(file, project);
    const meta = persistableFileMetadata(enriched);
    return {
      ...enriched,
      ...meta,
      updatedBy: actor,
      ...(opts.isNew ? { createdBy: actor } : {}),
    };
  }

  private auditSnapshot(file: ProjectFile): Record<string, unknown> {
    return {
      fileName: file.fileName,
      fileCategory: file.fileCategory,
      sourceType: file.sourceType,
      fileUrl: file.fileUrl,
      fileId: file.fileId,
      driveFolderId: file.driveFolderId,
      archived: file.archived,
    };
  }
}
