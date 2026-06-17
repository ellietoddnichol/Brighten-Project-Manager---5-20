import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Project, ProjectFile } from '@app/models/types';
import { FILE_VIEW_LABELS, FileView, UtilityView } from './project-detail.types';
import { ProjectEnabledModules } from '@app/models/project-needs.types';
import { DataService } from '@core/services/data.service';
import { ProjectRequirementsService } from '@features/projects/services/project-requirements.service';
import { ProjectFilesRepository } from '@core/services/project-files.repository';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { fileViewVisibleInNav, filterDocumentList } from '@features/projects/utils/project-documents.compute';
import { fileCountForView } from '@features/documents/pages/documents-tab';
import { EmptyStateComponent } from '../ui/empty-state';
import { StatusChipComponent } from '../ui/status-chip';
import { firstValueFrom } from 'rxjs';
import { ProjectWorkflowSaveService } from '@features/projects/services/project-workflow-save.service';
import { ProjectApiService } from '@core/services/api/project-api.service';

type FileSortMode = 'modified' | 'name';

@Component({
  selector: 'app-project-documents-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, EmptyStateComponent, StatusChipComponent],
  template: `
    <div class="space-y-4">
      @if (sqlDocumentsReadOnly()) {
        <div class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          <mat-icon class="!text-[16px] text-indigo-600">cloud_done</mat-icon>
          Documents loaded from Cloud SQL (read-only). Upload and archive still use Firestore/Drive.
        </div>
      } @else if (projectApi.documentsError()) {
        <div class="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          Could not load documents from API — showing Firestore files. {{ projectApi.documentsError() }}
        </div>
      }
      <div class="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 pb-1">
        @for (seg of primarySegments(); track seg.id) {
          <button type="button" (click)="fileViewChange.emit(seg.id)"
                  class="px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5"
                  [class.bg-slate-900]="activeView === seg.id"
                  [class.text-white]="activeView === seg.id"
                  [class.text-slate-500]="activeView !== seg.id"
                  [class.hover:text-slate-900]="activeView !== seg.id"
                  [class.hover:bg-slate-50]="activeView !== seg.id">
            {{ seg.label }}
            @if (seg.badge) {
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{{ seg.badge }}</span>
            }
          </button>
        }
        @if (moreSegments().length) {
          <div class="relative shrink-0">
            <button type="button" (click)="moreOpen.set(!moreOpen())"
                    class="px-3 py-1.5 rounded-t-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-1 shrink-0">
              More
              @if (moreBadgeTotal() > 0) {
                <span class="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ moreBadgeTotal() }}</span>
              }
            </button>
            @if (moreOpen()) {
              <div class="absolute z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                @for (seg of moreSegments(); track seg.id) {
                  <button type="button" (click)="onMoreSelect(seg.id)"
                          class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 flex justify-between gap-2">
                    <span>{{ seg.label }}</span>
                    @if (seg.badge) {
                      <span class="text-xs font-bold text-amber-700">{{ seg.badge }}</span>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (activeView === 'drive-mapping') {
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600">
          Drive mapping opens in the utility panel.
          <button type="button" (click)="utilitySelect.emit('drive-mapping')" class="ml-2 font-bold text-indigo-700 underline">Open Drive Mapping</button>
        </div>
      } @else if (!project.driveFolderId) {
        <app-empty-state icon="folder_off" title="No Drive folder linked"
                         message="Link a Google Drive folder in Project Overview to manage documents here."
                         actionLabel="Link folder"
                         (actionClick)="utilitySelect.emit('drive-mapping')" />
      } @else {
        @if (project.driveFolderUrl) {
          <a [href]="project.driveFolderUrl" target="_blank" rel="noopener"
             class="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <mat-icon class="!text-[16px]">folder_shared</mat-icon> Open Drive folder
          </a>
        }

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[200px] max-w-md">
            <mat-icon class="!text-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</mat-icon>
            <input type="search" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)"
                   placeholder="Search files…"
                   class="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <select [ngModel]="sortMode()" (ngModelChange)="sortMode.set($event)"
                  class="border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600">
            <option value="modified">Last Modified</option>
            <option value="name">Name</option>
          </select>
          <button type="button" (click)="showArchived.set(!showArchived())"
                  class="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-50 transition-colors">
            {{ showArchived() ? 'Hide archived' : 'Show archived (' + archivedCount() + ')' }}
          </button>
          <label class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1">
            <mat-icon class="!text-[16px]">upload_file</mat-icon> Upload File
            <input type="file" class="hidden" (change)="onFileSelected($event)" />
          </label>
        </div>

        @if (uploading()) {
          <p class="text-xs text-slate-500 flex items-center gap-2">
            <span class="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></span>
            Uploading…
          </p>
        }
        @if (uploadError()) {
          <p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{{ uploadError() }}</p>
        }
        @if (uploadNotice()) {
          <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{{ uploadNotice() }}</p>
        }

        <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          @for (file of sortedFiles(); track file.id) {
            <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors"
                 [class.opacity-60]="file.archived">
              <mat-icon class="!text-[20px] text-slate-400 shrink-0">{{ fileIcon(file) }}</mat-icon>
              <div class="min-w-0 flex-1">
                @if (file.fileUrl) {
                  <a [href]="file.fileUrl" target="_blank" rel="noopener"
                     class="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate block">{{ file.fileName }}</a>
                } @else {
                  <p class="text-sm font-semibold text-slate-900 truncate">{{ file.fileName }}</p>
                }
                <p class="text-xs text-slate-500">{{ modifiedLabel(file) }}</p>
              </div>
              <app-status-chip tone="slate" [label]="fileTypeLabel(file)" />
              @if (!file.archived && !sqlDocumentsReadOnly()) {
                <button type="button" (click)="archiveFile(file)"
                        class="text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors">
                  Archive
                </button>
              }
            </div>
          } @empty {
            <app-empty-state icon="folder_open" title="No files in this view"
                             [message]="searchQuery() ? 'Try a different search term.' : 'Upload a file or link a Drive document.'" />
          }
        </section>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDocumentsPanelComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) activeView: FileView = 'all';
  @Input({ required: true }) modules!: ProjectEnabledModules;
  @Output() utilitySelect = new EventEmitter<UtilityView>();
  @Output() fileViewChange = new EventEmitter<FileView>();

  private data = inject(DataService);
  private requirements = inject(ProjectRequirementsService);
  private lifecycle = inject(ProjectLifecycleService);
  private projectFiles = inject(ProjectFilesRepository);
  private workflowSave = inject(ProjectWorkflowSaveService);
  readonly projectApi = inject(ProjectApiService);

  moreOpen = signal(false);
  showArchived = signal(false);
  searchQuery = signal('');
  sortMode = signal<FileSortMode>('modified');
  uploading = signal(false);
  uploadError = signal<string | null>(null);
  uploadNotice = signal<string | null>(null);

  private allFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  private allReqs = toSignal(this.data.getRequiredDocuments(), { initialValue: [] });

  sqlDocumentsReadOnly = computed(() =>
    this.projectApi.isEnabled()
    && this.projectApi.documentsActiveSource() === 'api'
    && this.matchesLoadedProject(this.projectApi.documentsProjectId()),
  );

  private projectFilesForView = computed((): ProjectFile[] => {
    if (this.sqlDocumentsReadOnly()) {
      return this.projectApi.sqlDocuments();
    }
    return (this.allFiles() ?? []).filter(f => f.projectId === this.project.id);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project) {
      void this.projectApi.loadProjectDocuments(this.project.projectNumber || this.project.id);
    }
  }

  private matchesLoadedProject(loadedKey: string | null): boolean {
    if (!loadedKey) return false;
    const keys = [this.project.id, this.project.projectNumber].filter(Boolean);
    return keys.some(key => key === loadedKey || key?.replace(/^J/i, '') === loadedKey.replace(/^J/i, ''));
  }

  private reqCtx = computed(() => this.requirements.buildContext(this.project));
  private projectReqs = computed(() => (this.allReqs() ?? []).filter(r => r.projectId === this.project.id));

  private countFor = (view: FileView) =>
    fileCountForView(
      this.projectFilesForView(),
      view,
      this.project,
      this.projectReqs(),
      this.requirements,
      this.lifecycle.forProject(this.project),
    );

  private segmentBadge(view: FileView): number | undefined {
    const count = this.countFor(view);
    if (view === 'required' && count > 0) return count;
    if (view !== 'required' && view !== 'all' && count > 0) return count;
    return undefined;
  }

  primarySegments = computed(() =>
    this.modules.filesPrimary.map(id => ({
      id,
      label: FILE_VIEW_LABELS[id] ?? id,
      badge: this.segmentBadge(id),
    })),
  );

  moreSegments = computed(() => {
    const ctx = this.reqCtx();
    const files = this.projectFilesForView();
    return this.modules.filesMore
      .filter(id => id === 'drive-mapping' || fileViewVisibleInNav(id, this.modules, files, ctx, this.projectReqs()))
      .map(id => ({
        id,
        label: FILE_VIEW_LABELS[id] ?? id,
        badge: id === 'drive-mapping' ? undefined : this.segmentBadge(id),
      }));
  });

  moreBadgeTotal = computed(() =>
    this.moreSegments().reduce((s, seg) => s + (seg.badge ?? 0), 0),
  );

  archivedCount = computed(() =>
    this.projectFilesForView().filter(f => f.archived).length,
  );

  filteredFiles = computed((): ProjectFile[] => {
    const items = filterDocumentList(
      this.projectFilesForView(),
      this.activeView,
      this.reqCtx(),
      this.projectReqs(),
      this.searchQuery(),
      this.lifecycle.forProject(this.project)?.seedGaps ?? [],
      { includeArchived: this.showArchived() },
    );
    return items
      .filter(item => item.kind === 'file' && item.file)
      .map(item => item.file!);
  });

  sortedFiles = computed(() => {
    const files = [...this.filteredFiles()];
    const mode = this.sortMode();
    if (mode === 'name') {
      return files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    }
    return files.sort((a, b) => this.modifiedTs(b) - this.modifiedTs(a));
  });

  onMoreSelect(view: FileView): void {
    this.moreOpen.set(false);
    if (view === 'drive-mapping') {
      this.utilitySelect.emit('drive-mapping');
    } else {
      this.fileViewChange.emit(view);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.project.driveFolderId) return;

    this.uploading.set(true);
    this.uploadError.set(null);
    this.uploadNotice.set(null);

    try {
      const result = await this.workflowSave.saveProjectWorkflowFile({
        projectId: this.project.id,
        workflowType: 'closeout',
        folderKey: 'CORRESPONDENCE',
        fallbackFolderKeys: ['BILLING', 'SUBS', 'RFIS'],
        fileName: file.name,
        content: file,
        mimeType: file.type || 'application/octet-stream',
        documentType: this.activeView === 'all' ? 'General' : (FILE_VIEW_LABELS[this.activeView] ?? 'General'),
        requestAuthIfNeeded: true,
      });
      if (result.warning) {
        this.uploadNotice.set(result.warning);
      } else {
        this.uploadNotice.set(`Uploaded ${result.fileName} to ${result.savedToLabel}`);
      }
    } catch (err) {
      this.uploadError.set(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  async archiveFile(file: ProjectFile): Promise<void> {
    await firstValueFrom(this.projectFiles.archive(file.id, 'Archived from documents panel'));
  }

  fileIcon(file: ProjectFile): string {
    const name = (file.fileName ?? '').toLowerCase();
    const mime = (file.mimeType ?? '').toLowerCase();
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'picture_as_pdf';
    if (mime.includes('sheet') || mime.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'table_chart';
    if (mime.includes('image') || /\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
    if (mime.includes('folder')) return 'folder';
    return 'description';
  }

  fileTypeLabel(file: ProjectFile): string {
    const name = (file.fileName ?? '').toLowerCase();
    if (name.endsWith('.pdf')) return 'PDF';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'Sheet';
    if (/\.(png|jpe?g|gif|webp)$/.test(name)) return 'Image';
    return (file.documentType || file.fileType || 'File').slice(0, 12);
  }

  modifiedLabel(file: ProjectFile): string {
    const raw = file.lastModifiedAt ?? file.uploadedAt;
    if (!raw) return 'Modified date unknown';
    const d = typeof raw === 'string' ? new Date(raw) : raw?.toDate?.() ?? new Date(String(raw));
    if (Number.isNaN(d.getTime())) return 'Modified date unknown';
    return `Modified ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)}`;
  }

  private modifiedTs(file: ProjectFile): number {
    const raw = file.lastModifiedAt ?? file.uploadedAt;
    if (!raw) return 0;
    const d = typeof raw === 'string' ? new Date(raw) : raw?.toDate?.() ?? new Date(String(raw));
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
}
