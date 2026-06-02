import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Project, ProjectFile, RequiredDocument } from '../models/types';
import { DataService } from '../services/data.service';
import { ProjectRequirementsService } from '../services/project-requirements.service';
import { ProjectLifecycleService } from '../services/project-lifecycle.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { FileView } from '../components/project/project-detail.types';
import { ProjectEnabledModules } from '../models/project-needs.types';
import { EmptyStateComponent } from '../components/ui/empty-state';
import {
  CATEGORY_LABELS,
  DocumentListItem,
} from '../models/project-documents.types';
import {
  countFilesForView,
  defaultsForNewUpload,
  enrichProjectFileOnSave,
  filterDocumentList,
  folderKeyForCategory,
  categoryForFileView,
} from '../utils/project-documents.compute';
import { FILE_VIEW_LABELS } from '../components/project/project-detail.types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';

@Component({
  selector: 'app-documents-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, EmptyStateComponent],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
          <div class="relative flex-1 max-w-md">
            <mat-icon class="!text-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</mat-icon>
            <input type="search"
                   [(ngModel)]="searchQuery"
                   placeholder="Search files…"
                   class="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          @if (fileView !== 'all') {
            <span class="text-xs font-semibold text-slate-500">
              {{ viewLabel() }} · {{ filteredItems().length }} item(s)
            </span>
          }
        </div>
        <div class="flex flex-wrap gap-2">
          @if (fileView === 'required') {
            <button type="button" (click)="showNewReq = true"
                    class="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50">
              Add requirement
            </button>
          }
          <button type="button" (click)="openNewFile()"
                  class="bg-slate-900 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 flex items-center gap-1">
            <mat-icon class="!text-[16px]">add</mat-icon> Add file
          </button>
        </div>
      </div>

      @if (showNewReq) {
        <div class="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="col-span-full text-sm font-bold text-slate-900">Document requirement</div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document type</label>
            <input [(ngModel)]="newReq.documentType" class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
            <select [(ngModel)]="newReq.status" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="Needed">Needed</option>
              <option value="Requested">Requested</option>
              <option value="Received">Received</option>
            </select>
          </div>
          <div class="col-span-full flex justify-end gap-2">
            <button type="button" (click)="cancelReq()" class="px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" (click)="saveReq()" class="px-3 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg">Save</button>
          </div>
        </div>
      }

      @if (showNewFile) {
        <div class="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div class="col-span-full text-sm font-bold text-slate-900">Add file link</div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">File name</label>
            <input [(ngModel)]="newFile.fileName" class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
            <select [(ngModel)]="newFile.folderKey" (ngModelChange)="onFolderChange($event)" class="w-full px-3 py-2 border rounded-lg text-sm">
              @for (opt of folderOptions; track opt.key) {
                <option [value]="opt.key">{{ opt.label }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">Document type</label>
            <input [(ngModel)]="newFile.documentType" class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div class="col-span-full">
            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-1">File URL / Drive link</label>
            <input [(ngModel)]="newFile.fileUrl" class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div class="col-span-full flex justify-end gap-2">
            <button type="button" (click)="cancelFile()" class="px-3 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <button type="button" (click)="saveFile()" class="px-3 py-2 text-sm font-semibold bg-emerald-700 text-white rounded-lg">Save</button>
          </div>
        </div>
      }

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        @for (item of filteredItems(); track item.id) {
          @if (item.kind === 'missing') {
            <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-amber-100 bg-amber-50/60">
              <div class="flex items-start gap-3 min-w-0">
                <span class="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0"></span>
                <div>
                  <p class="text-sm font-semibold text-amber-900">{{ item.fileName }}</p>
                  <p class="text-xs text-amber-700">{{ categoryLabel(item.fileCategory) }}</p>
                </div>
              </div>
              <button type="button" (click)="openMissingItem(item)"
                      class="text-xs font-bold text-indigo-700 underline shrink-0">
                {{ item.actionLabel || 'Upload' }}
              </button>
            </div>
          } @else {
            <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <mat-icon class="!text-[20px] text-slate-400 shrink-0 mt-0.5">description</mat-icon>
                <div class="min-w-0">
                  @if (item.fileUrl) {
                    <a [href]="item.fileUrl" target="_blank" rel="noopener"
                       class="text-sm font-semibold text-blue-600 hover:underline truncate block">
                      {{ item.fileName }}
                    </a>
                  } @else {
                    <p class="text-sm font-semibold text-slate-900 truncate">{{ item.fileName }}</p>
                  }
                  <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                    <span>{{ categoryLabel(item.fileCategory) }}</span>
                    @if (item.sourceType) {
                      <span>{{ item.sourceType }}</span>
                    }
                    @if (item.locationLabel) {
                      <span>{{ item.locationLabel }}</span>
                    }
                    @if (item.dateLabel) {
                      <span>{{ item.dateLabel }}</span>
                    }
                    @if (item.linkedRecord) {
                      <span class="text-indigo-600">{{ item.linkedRecord }}</span>
                    }
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                @if (item.fileUrl) {
                  <a [href]="item.fileUrl" target="_blank" rel="noopener"
                     class="text-xs font-semibold text-slate-600 hover:text-slate-900">Open</a>
                }
                <button type="button" (click)="editFile(item.file!)"
                        class="text-xs font-semibold text-slate-500 hover:text-slate-800">Edit</button>
                @if (item.file && isPhoto(item.file)) {
                  <button type="button" (click)="createAction(item.file!)"
                          class="text-xs font-semibold text-rose-600">Create issue</button>
                }
              </div>
            </div>
          }
        } @empty {
          <app-empty-state
            [title]="emptyTitle()"
            [message]="emptyMessage()" />
        }
      </div>

      @if (fileView === 'all' && manageRequirements()) {
        <details class="bg-white rounded-xl border border-slate-200">
          <summary class="px-4 py-3 text-sm font-semibold text-slate-700 cursor-pointer">
            Manage all requirements ({{ requiredDocs().length }})
          </summary>
          <div class="border-t divide-y">
            @for (req of requiredDocs(); track req.id) {
              <div class="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                <span class="font-medium">{{ req.documentType }}</span>
                <span class="text-xs uppercase font-bold text-slate-500">{{ req.status }}</span>
                <button type="button" (click)="editReq(req)" class="text-xs text-indigo-700 underline">Edit</button>
              </div>
            } @empty {
              <p class="px-4 py-6 text-sm text-slate-500 italic">No requirements tracked.</p>
            }
          </div>
        </details>
      }
    </div>
  `,
})
export class DocumentsTabComponent {
  @Input({ required: true }) project!: Project;
  @Input() fileView: FileView = 'all';
  @Input() modules?: ProjectEnabledModules;
  @Input() showAllTools = false;

  private dataService = inject(DataService);
  private requirements = inject(ProjectRequirementsService);
  private lifecycle = inject(ProjectLifecycleService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  searchQuery = '';
  showNewReq = false;
  showNewFile = false;
  editingReqId: string | null = null;
  editingFileId: string | null = null;
  newReq: Partial<RequiredDocument> = this.resetReq();
  newFile: Partial<ProjectFile> = this.resetFile();

  allFiles = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  allReqs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });

  requiredDocs = computed(() => (this.allReqs() || []).filter(r => r.projectId === this.project.id));

  reqCtx = computed(() => this.requirements.buildContext(this.project));

  setupGaps = computed(() => this.lifecycle.forProject(this.project)?.seedGaps ?? []);

  filteredItems = computed((): DocumentListItem[] =>
    filterDocumentList(
      this.allFiles() ?? [],
      this.fileView,
      this.reqCtx(),
      this.requiredDocs(),
      this.searchQuery,
      this.setupGaps(),
    ),
  );

  readonly folderOptions = [
    { key: 'PROJECT_ADMIN', label: '00 Project Admin' },
    { key: 'CONTRACT', label: '01 Contract' },
    { key: 'PLANS_SPECS', label: '02 Plans & Specs' },
    { key: 'SUBMITTALS', label: '03 Submittals' },
    { key: 'RFIS', label: '04 RFIs' },
    { key: 'CHANGE_ORDERS', label: '05 Change Orders' },
    { key: 'BILLING', label: '07 Billing' },
    { key: 'PHOTOS', label: '08 Photos' },
    { key: 'SUBS', label: 'Subs' },
    { key: 'CERTIFIED_PAYROLL', label: 'Certified Payroll' },
    { key: 'LIEN_WAIVERS', label: 'Lien Waivers' },
    { key: 'CLOSEOUT', label: '13 Closeout' },
    { key: 'ARCHIVE', label: '99 Archive' },
  ];

  viewLabel = computed(() => FILE_VIEW_LABELS[this.fileView] ?? this.fileView);

  categoryLabel(cat: string): string {
    return CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat;
  }

  emptyTitle(): string {
    switch (this.fileView) {
      case 'required': return 'Nothing missing right now.';
      case 'generated': return 'No generated documents yet.';
      case 'uploads': return 'No uploads yet.';
      default: return 'No files in this view.';
    }
  }

  emptyMessage(): string {
    if (this.searchQuery.trim()) return 'Try a different search term.';
    if (this.fileView === 'required') {
      return 'Setup gaps, required folders, and tracked document requirements appear here.';
    }
    return 'Add a file link or generate a document from Work or Money.';
  }

  manageRequirements(): boolean {
    return this.fileView === 'all' || this.showAllTools;
  }

  isPhoto(file: ProjectFile): boolean {
    const dt = file.documentType?.toLowerCase() ?? '';
    return dt.includes('photo') || dt.includes('damage') || dt.includes('issue');
  }

  openNewFile(): void {
    this.newFile = this.resetFile();
    const cat = categoryForFileView(this.fileView);
    if (cat) {
      const fk = folderKeyForCategory(cat);
      if (fk) this.newFile.folderKey = fk;
    }
    this.showNewFile = true;
  }

  openNewFileForCategory(category: string): void {
    this.newFile = this.resetFile();
    const fk = folderKeyForCategory(category as never);
    if (fk) this.newFile.folderKey = fk;
    this.showNewFile = true;
  }

  openMissingItem(item: DocumentListItem): void {
    if (item.id.startsWith('setup-')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: 'setup', section: null, view: null },
        queryParamsHandling: 'merge',
      });
      return;
    }
    if (item.id.startsWith('folder-') && item.fileCategory === 'Contract') {
      this.openNewFileForCategory(item.fileCategory);
      return;
    }
    if (item.id.startsWith('folder-')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { tab: 'drive-mapping', section: null, view: null },
        queryParamsHandling: 'merge',
      });
      return;
    }
    this.openNewFileForCategory(item.fileCategory);
  }

  onFolderChange(folderKey: string): void {
    const defaults = defaultsForNewUpload(folderKey);
    this.newFile = { ...this.newFile, ...defaults, folderKey };
  }

  resetReq(): Partial<RequiredDocument> {
    return { documentType: '', status: 'Needed', required: true };
  }

  resetFile(): Partial<ProjectFile> {
    return {
      fileName: '',
      documentType: '',
      folderKey: 'PROJECT_ADMIN',
      fileUrl: '',
      documentStatus: 'Received',
      ...defaultsForNewUpload('PROJECT_ADMIN'),
    };
  }

  editReq(req: RequiredDocument): void {
    this.editingReqId = req.id;
    this.newReq = { ...req };
    this.showNewReq = true;
  }

  cancelReq(): void {
    this.editingReqId = null;
    this.newReq = this.resetReq();
    this.showNewReq = false;
  }

  saveReq(): void {
    if (!this.newReq.documentType) return;
    this.newReq.projectId = this.project.id;
    if (this.editingReqId) {
      this.dataService.updateRequiredDocument(this.editingReqId, this.newReq).subscribe(() => this.cancelReq());
    } else {
      this.dataService.createRequiredDocument(this.newReq).subscribe(() => this.cancelReq());
    }
  }

  editFile(f: ProjectFile): void {
    this.editingFileId = f.id;
    this.newFile = { ...f };
    this.showNewFile = true;
  }

  cancelFile(): void {
    this.editingFileId = null;
    this.newFile = this.resetFile();
    this.showNewFile = false;
  }

  createAction(file: ProjectFile): void {
    if (!confirm('Create a linked issue from this photo/file?')) return;
    this.dataService.createProjectIssue({
      projectId: file.projectId,
      title: `Issue from Photo: ${file.fileName}`,
      description: `Review linked file: ${file.fileUrl}\n\nNotes: ${file.notes || ''}`,
      category: 'Quality/Damage',
      priority: 'High',
      status: 'Open',
      relatedRecordType: 'ProjectFile',
      relatedRecordId: file.id,
    }).subscribe(() => alert('Issue created. View in Work → Field Issues.'));
  }

  saveFile(): void {
    if (!this.newFile.fileName) return;
    const payload = enrichProjectFileOnSave(
      { ...this.newFile, projectId: this.project.id },
      this.project,
    );
    if (this.editingFileId) {
      this.dataService.updateProjectFile(this.editingFileId, payload).subscribe(() => this.cancelFile());
    } else {
      this.dataService.createProjectFile(payload).subscribe(() => this.cancelFile());
    }
  }
}

/** Exported for nav badge counts */
export function fileCountForView(
  files: ProjectFile[],
  view: FileView,
  project: Project,
  requiredDocs: RequiredDocument[],
  requirements: ProjectRequirementsService,
  lifecycle?: ProjectLifecycleSnapshot,
): number {
  const ctx = requirements.buildContext(project);
  return countFilesForView(
    files,
    view,
    ctx,
    requiredDocs.filter(r => r.projectId === project.id),
    lifecycle?.seedGaps ?? [],
  );
}
