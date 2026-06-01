import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { DataService } from '../services/data.service';
import { DriveFolderDiscoveryService } from '../services/drive-folder-discovery.service';
import { ImportReviewService } from '../services/import-review.service';
import { ProjectLifecycleService } from '../services/project-lifecycle.service';
import { ProjectRequirementsService } from '../services/project-requirements.service';
import { PageHeaderComponent } from '../components/ui/page-header';
import { StatCardComponent } from '../components/ui/stat-card';
import { CompactStatStripComponent } from '../components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '../components/ui/segmented-control';
import { StatusChipComponent } from '../components/ui/status-chip';
import {
  DetailDrawerComponent,
  DrawerSectionComponent,
  DrawerFieldComponent,
} from '../components/ui/detail-drawer';
import { downloadCsv } from '../utils/csv-export';
import { Project, ProjectFile } from '../models/types';
import {
  defaultsForNewUpload,
  enrichProjectFileOnSave,
} from '../utils/project-documents.compute';
import {
  buildDocumentsDriveLinkRows,
  buildDocumentsHubFileRows,
  buildDocumentsNeedsReviewRows,
  buildDocumentsOverviewRows,
  DOCUMENTS_SEGMENT_OPTIONS,
  documentsHubCsvRows,
  documentsOverviewSectionLabel,
  DocumentsHubProjectContext,
  DocumentsHubFileRow,
  DocumentsSegmentId,
  normalizeDocumentsSegment,
  summarizeDocumentsCategoryCounts,
  summarizeDocumentsHub,
} from '../utils/documents-hub.compute';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    CompactStatStripComponent,
    SegmentedControlComponent,
    StatusChipComponent,
    DetailDrawerComponent,
    DrawerSectionComponent,
    DrawerFieldComponent,
  ],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-page-header
        title="Documents"
        subtitle="Project files, Drive links, generated docs, and required documents"
        primaryActionLabel="Upload file"
        (primaryAction)="openUpload()">
        <button type="button" (click)="scanDriveFolders()" [disabled]="scanning()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ scanning() ? 'hourglass_empty' : 'folder_open' }}</mat-icon>
          {{ scanning() ? 'Scanning…' : 'Scan Drive folders' }}
        </button>
        <a routerLink="/settings" fragment="import-review"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Source Review
        </a>
        <button type="button" (click)="exportCsv()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export CSV
        </button>
      </app-page-header>

      @if (scanMessage()) {
        <p class="text-sm text-emerald-700 -mt-2">{{ scanMessage() }}</p>
      }
      @if (scanError()) {
        <p class="text-sm text-rose-700 -mt-2">{{ scanError() }}</p>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" (click)="setSegment('all')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Project Files" [value]="num(summary().projectFiles)" icon="folder" />
        </button>
        <button type="button" (click)="setSegment('required')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Missing Required" [value]="num(summary().missingRequired)" icon="assignment_late"
                         [trend]="summary().missingRequired ? 'Upload or link' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('generated')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Generated Docs" [value]="num(summary().generatedDocs)" icon="auto_awesome" />
        </button>
        <button type="button" (click)="setSegment('driveLinks')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Drive Issues" [value]="num(summary().driveIssues)" icon="cloud_off"
                         [trend]="summary().driveIssues ? 'Review mapping' : undefined" [trendPositive]="false" />
        </button>
      </div>

      @if (compactStats().length) {
        <app-compact-stat-strip [stats]="compactStats()" />
      }

      @if (showSearch()) {
        <div class="relative max-w-md">
          <mat-icon class="!text-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</mat-icon>
          <input type="search" [(ngModel)]="searchQuery" placeholder="Search files…"
                 class="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
        </div>
      }

      <app-segmented-control
        [options]="segmentOptions()"
        [value]="segment()"
        (select)="setSegment($event)" />

      @switch (segment()) {
        @case ('overview') {
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100">
              <h2 class="text-sm font-bold text-slate-900">Document actions</h2>
              <p class="text-xs text-slate-500 mt-0.5">Missing docs, Drive setup, recent files, and source issues</p>
            </div>
            @if (overviewRows().length) {
              <div class="divide-y divide-slate-100">
                @for (row of overviewRows(); track row.id) {
                  <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50/80">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-bold font-mono">{{ row.jobNumber }}</span>
                        <span class="text-sm font-semibold text-slate-900 truncate max-w-[220px]">{{ row.projectName }}</span>
                        <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.issueOrStatus }}</app-status-chip>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">
                        {{ documentsOverviewSectionLabel(row.section) }} · {{ row.documentLabel }}
                        @if (row.locationLabel !== '—') { · {{ row.locationLabel }} }
                        @if (row.dateLabel !== '—') { · {{ row.dateLabel }} }
                      </p>
                    </div>
                    @if (row.nextAction === 'Source Review') {
                      <a routerLink="/settings" fragment="import-review" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>
                    } @else if (row.projectId) {
                      <a [routerLink]="row.route" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No document actions right now</div>
            }
          </section>
        }

        @case ('driveLinks') {
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            @for (row of driveLinkRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50/80 flex flex-wrap items-start gap-4">
                <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'documents', view: 'drive-mapping' }" class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-xs font-bold font-mono">{{ row.jobNumber }}</span>
                    <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
                    <app-status-chip [tone]="row.rootLinked ? (row.missingRequired ? 'amber' : 'green') : 'red'">{{ row.statusLabel }}</app-status-chip>
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><span class="text-slate-400">Root</span> <span class="font-semibold">{{ row.rootLinked ? 'Linked' : 'Not linked' }}</span></span>
                    <span><span class="text-slate-400">Mapped</span> <span class="font-semibold">{{ row.mappedFolders }}</span></span>
                    <span><span class="text-slate-400">Missing required</span> <span class="font-semibold" [class.text-rose-700]="row.missingRequired">{{ row.missingRequired }}</span></span>
                    @if (row.needsReview) {
                      <span><span class="text-slate-400">Review</span> <span class="font-semibold">{{ row.needsReview }}</span></span>
                    }
                  </div>
                </a>
                <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'documents', view: 'drive-mapping' }"
                   class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
              </div>
            } @empty {
              <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No active jobs need Drive mapping review</div>
            }
          </section>
        }

        @case ('needsReview') {
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            @for (row of needsReviewRows(); track row.id) {
              <div class="px-5 py-4 hover:bg-slate-50/80 flex flex-wrap items-start gap-4">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-xs font-bold font-mono">{{ row.jobNumber }}</span>
                    <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
                    <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.issueType }}</app-status-chip>
                  </div>
                  <p class="text-xs text-slate-500">{{ row.detail }}</p>
                </div>
                @if (row.nextAction === 'Source Review') {
                  <a routerLink="/settings" fragment="import-review" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
                } @else if (row.projectId) {
                  <a [routerLink]="row.route" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>
                }
              </div>
            } @empty {
              <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No file or source issues need review</div>
            }
          </section>
        }

        @default {
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            @for (row of fileRows(); track row.id) {
              <div class="px-5 py-3 hover:bg-slate-50/80 flex flex-wrap items-start gap-4"
                   [class.bg-amber-50/50]="row.item.kind === 'missing'">
                <button type="button" (click)="openFileRow(row)" class="min-w-0 flex-1 text-left">
                  <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="text-sm font-semibold text-slate-900 truncate max-w-[280px]">{{ row.fileName }}</span>
                    <app-status-chip tone="slate">{{ row.categoryLabel }}</app-status-chip>
                    <app-status-chip tone="blue">{{ row.sourceType }}</app-status-chip>
                  </div>
                  <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><span class="text-slate-400">Job</span> <span class="font-mono font-semibold">{{ row.jobNumber }}</span> <span class="font-semibold">{{ row.projectName }}</span></span>
                    <span><span class="text-slate-400">Location</span> <span class="font-semibold">{{ row.locationLabel }}</span></span>
                    @if (row.linkedRecord) {
                      <span><span class="text-slate-400">Linked</span> <span class="font-semibold text-indigo-700">{{ row.linkedRecord }}</span></span>
                    }
                    <span><span class="text-slate-400">Date</span> <span class="font-semibold">{{ row.dateLabel }}</span></span>
                  </div>
                </button>
                <div class="flex flex-wrap gap-2 shrink-0">
                  @if (row.fileUrl) {
                    <a [href]="row.fileUrl" target="_blank" rel="noopener" class="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5">Open</a>
                  }
                  <button type="button" (click)="openFileRow(row)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                    {{ row.item.kind === 'missing' ? (row.item.actionLabel || 'Upload') : 'Details' }}
                  </button>
                </div>
              </div>
            } @empty {
              <div class="px-5 py-12 text-center text-slate-400 text-sm italic">{{ emptyMessage() }}</div>
            }
          </section>
        }
      }

      @if (uploadOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeUpload()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b flex justify-between items-center bg-slate-50">
            <h3 class="text-lg font-bold">Upload file</h3>
            <button type="button" (click)="closeUpload()">✕</button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
              <select [(ngModel)]="uploadDraft.projectId" class="w-full px-3 py-2 border rounded-lg text-sm">
                @for (p of activeProjects(); track p.id) {
                  <option [value]="p.id">#{{ p.projectNumber }} — {{ p.projectName }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">File name</label>
              <input [(ngModel)]="uploadDraft.fileName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Folder / category</label>
              <select [(ngModel)]="uploadDraft.folderKey" class="w-full px-3 py-2 border rounded-lg text-sm">
                @for (opt of folderOptions; track opt.key) {
                  <option [value]="opt.key">{{ opt.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Drive / file URL</label>
              <input [(ngModel)]="uploadDraft.fileUrl" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="https://drive.google.com/...">
            </div>
            <p class="text-xs text-slate-500">Files stay in Google Drive. This saves metadata in Firestore only.</p>
            <div class="flex gap-2 pt-2">
              <button type="button" (click)="saveUpload()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save metadata</button>
              <button type="button" (click)="closeUpload()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        </aside>
      }

      <app-detail-drawer
        [open]="drawerOpen()"
        [title]="drawerTitle()"
        [subtitle]="drawerSubtitle()"
        (close)="closeDrawer()">
        @if (selectedFile()) {
          <app-drawer-section title="File">
            <app-drawer-field label="Category" [value]="selectedRow()?.categoryLabel ?? '—'" />
            <app-drawer-field label="Source" [value]="selectedRow()?.sourceType ?? '—'" />
            <app-drawer-field label="Location" [value]="selectedRow()?.locationLabel ?? '—'" />
            <app-drawer-field label="Status" [value]="selectedRow()?.documentStatus ?? '—'" />
            <app-drawer-field label="Date" [value]="selectedRow()?.dateLabel ?? '—'" />
            @if (selectedRow()?.linkedRecord) {
              <app-drawer-field label="Linked record" [value]="selectedRow()!.linkedRecord!" />
            }
          </app-drawer-section>
          <div class="flex flex-wrap gap-2 pt-2">
            @if (selectedFile()?.fileUrl) {
              <a [href]="selectedFile()!.fileUrl" target="_blank" rel="noopener"
                 class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">Open in Drive</a>
            }
            <a [routerLink]="['/projects', selectedRow()?.projectId]" [queryParams]="{ section: 'documents' }"
               class="text-xs font-semibold border px-3 py-1.5 rounded-lg">Open project Files</a>
            @if (selectedFile() && selectedFile()!.documentStatus !== 'Signed') {
              <button type="button" (click)="markSigned()" class="text-xs font-semibold border px-3 py-1.5 rounded-lg">Mark signed</button>
            }
            <button type="button" (click)="openReplace()" class="text-xs font-semibold border px-3 py-1.5 rounded-lg">Replace link</button>
          </div>
        }
      </app-detail-drawer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Documents {
  private data = inject(DataService);
  private lifecycleSvc = inject(ProjectLifecycleService);
  private requirements = inject(ProjectRequirementsService);
  private driveDiscovery = inject(DriveFolderDiscoveryService);
  private importReview = inject(ImportReviewService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  segment = signal<DocumentsSegmentId>('overview');
  searchQuery = '';
  scanning = signal(false);
  scanMessage = signal<string | null>(null);
  scanError = signal<string | null>(null);
  uploadOpen = signal(false);
  drawerOpen = signal(false);
  selectedRow = signal<DocumentsHubFileRow | null>(null);
  uploadDraft: Partial<ProjectFile> & { projectId?: string } = {};

  readonly documentsOverviewSectionLabel = documentsOverviewSectionLabel;

  readonly folderOptions = [
    { key: 'CONTRACT', label: '01 Contract' },
    { key: 'CHANGE_ORDERS', label: '05 Change Orders' },
    { key: 'BILLING', label: '07 Billing' },
    { key: 'SUBS', label: 'Subs' },
    { key: 'LIEN_WAIVERS', label: 'Lien Waivers' },
    { key: 'CLOSEOUT', label: '13 Closeout' },
    { key: 'PHOTOS', label: '08 Photos' },
  ];

  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });
  private files = toSignal(this.data.getProjectFiles(), { initialValue: [] as ProjectFile[] });
  private requiredDocs = toSignal(this.data.getRequiredDocuments(), { initialValue: [] });
  private folders = toSignal(this.data.getProjectFolders(), { initialValue: [] });

  contexts = computed((): DocumentsHubProjectContext[] =>
    (this.projects() ?? []).map(project => ({
      project,
      lifecycle: this.lifecycleSvc.forProject(project),
      reqCtx: this.requirements.buildContext(project),
      requiredDocs: (this.requiredDocs() ?? []).filter(r => r.projectId === project.id),
    })),
  );

  activeProjects = computed(() =>
    this.contexts().filter(c => c.lifecycle.includeInDefaultScope && !c.lifecycle.includeInArchive).map(c => c.project),
  );

  summary = computed(() => summarizeDocumentsHub({
    files: this.files() ?? [],
    contexts: this.contexts(),
  }));

  categoryCounts = computed(() => summarizeDocumentsCategoryCounts(this.files() ?? []));

  compactStats = computed(() => {
    const c = this.categoryCounts();
    return [
      { label: 'Contracts', value: String(c.contracts) },
      { label: 'Change Orders', value: String(c.changeOrders) },
      { label: 'Billing Docs', value: String(c.billing) },
      { label: 'Insurance / COIs', value: String(c.insurance) },
      { label: 'Lien Waivers', value: String(c.lienWaivers) },
      { label: 'Closeout', value: String(c.closeout) },
      { label: 'Recently Added', value: String(c.recentlyAdded), alert: c.recentlyAdded > 0 },
    ];
  });

  overviewRows = computed(() => buildDocumentsOverviewRows({
    files: this.files() ?? [],
    contexts: this.contexts(),
    importExceptions: this.importReview.exceptions(),
  }));

  fileRows = computed(() => buildDocumentsHubFileRows({
    files: this.files() ?? [],
    contexts: this.contexts(),
    segment: this.segment(),
    search: this.searchQuery,
  }));

  driveLinkRows = computed(() => buildDocumentsDriveLinkRows(this.contexts()));

  needsReviewRows = computed(() => buildDocumentsNeedsReviewRows({
    files: this.files() ?? [],
    contexts: this.contexts(),
    folders: this.folders() ?? [],
    importExceptions: this.importReview.exceptions(),
  }));

  segmentOptions = computed(() => {
    const opts = DOCUMENTS_SEGMENT_OPTIONS.map(o => ({ ...o, badge: undefined as number | undefined }));
    const idx = opts.findIndex(o => o.id === 'needsReview');
    const count = this.needsReviewRows().length;
    if (idx >= 0 && count) opts[idx].badge = count;
    return opts;
  });

  selectedFile = computed(() => this.selectedRow()?.item.file ?? null);

  drawerTitle = computed(() => this.selectedRow()?.fileName ?? 'File details');
  drawerSubtitle = computed(() => {
    const row = this.selectedRow();
    if (!row) return undefined;
    return `${row.jobNumber} ${row.projectName}`;
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      if (params.get('segment')) {
        this.segment.set(normalizeDocumentsSegment(params.get('segment')));
      }
      if (params.get('q')) {
        this.searchQuery = params.get('q') ?? '';
      }
    });
  }

  showSearch(): boolean {
    return ['all', 'required', 'generated', 'uploads'].includes(this.segment());
  }

  num(value: number): string {
    return String(value);
  }

  emptyMessage(): string {
    switch (this.segment()) {
      case 'required': return 'No required documents or missing prompts on active jobs';
      case 'generated': return 'No generated documents yet';
      case 'uploads': return 'No uploaded files yet';
      default: return 'No files match this view';
    }
  }

  setSegment(segment: DocumentsSegmentId): void {
    this.segment.set(segment);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { segment },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openUpload(): void {
    const first = this.activeProjects()[0];
    this.uploadDraft = {
      projectId: first?.id,
      folderKey: 'CONTRACT',
      documentType: 'Upload',
      documentStatus: 'Received',
      ...defaultsForNewUpload('CONTRACT'),
    };
    this.uploadOpen.set(true);
  }

  closeUpload(): void {
    this.uploadOpen.set(false);
  }

  async saveUpload(): Promise<void> {
    if (!this.uploadDraft.projectId || !this.uploadDraft.fileName?.trim()) return;
    const project = (this.projects() ?? []).find(p => p.id === this.uploadDraft.projectId);
    if (!project) return;
    const payload = enrichProjectFileOnSave({
      ...this.uploadDraft,
      projectId: project.id,
      fileName: this.uploadDraft.fileName.trim(),
      documentType: this.uploadDraft.documentType ?? 'Upload',
      documentStatus: this.uploadDraft.documentStatus ?? 'Received',
    }, project);
    await firstValueFrom(this.data.createProjectFile(payload));
    this.closeUpload();
  }

  openFileRow(row: DocumentsHubFileRow): void {
    if (row.item.kind === 'missing') {
      void this.router.navigate(['/projects', row.projectId], { queryParams: { section: 'documents', view: 'required' } });
      return;
    }
    this.selectedRow.set(row);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.selectedRow.set(null);
  }

  async markSigned(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    await firstValueFrom(this.data.updateProjectFile(file.id, { documentStatus: 'Signed' }));
    this.closeDrawer();
  }

  openReplace(): void {
    const row = this.selectedRow();
    if (!row?.item.file) return;
    this.uploadDraft = { ...row.item.file };
    this.drawerOpen.set(false);
    this.uploadOpen.set(true);
  }

  async scanDriveFolders(): Promise<void> {
    this.scanning.set(true);
    this.scanMessage.set(null);
    this.scanError.set(null);
    let scanned = 0;
    let authRequired = false;
    try {
      for (const project of this.activeProjects()) {
        if (!project.driveFolderId) continue;
        const result = await this.driveDiscovery.discoverProjectFolders(project, { replaceManual: false });
        scanned++;
        if (result.authRequired) authRequired = true;
      }
      this.scanMessage.set(
        authRequired
          ? `Scanned ${scanned} linked project folder(s). Re-authorize Drive in Settings to complete scan.`
          : `Scanned ${scanned} linked project folder(s).`,
      );
    } catch (err) {
      this.scanError.set(err instanceof Error ? err.message : 'Drive scan failed.');
    } finally {
      this.scanning.set(false);
    }
  }

  exportCsv(): void {
    const segment = this.segment();
    const headers: Record<DocumentsSegmentId, string[]> = {
      overview: ['Job', 'Project', 'Document', 'Issue', 'Location', 'Date', 'Next action'],
      all: ['File', 'Job', 'Project', 'Category', 'Source', 'Location', 'Linked', 'Date', 'Status'],
      required: ['File', 'Job', 'Project', 'Category', 'Source', 'Location', 'Linked', 'Date', 'Status'],
      generated: ['File', 'Job', 'Project', 'Category', 'Source', 'Location', 'Linked', 'Date', 'Status'],
      uploads: ['File', 'Job', 'Project', 'Category', 'Source', 'Location', 'Linked', 'Date', 'Status'],
      driveLinks: ['Job', 'Project', 'Root linked', 'Mapped', 'Missing required', 'Needs review', 'Status', 'Next action'],
      needsReview: ['Job', 'Project', 'Issue', 'Detail', 'Next action'],
    };
    downloadCsv(
      `documents-${segment}-${new Date().toISOString().slice(0, 10)}.csv`,
      headers[segment],
      documentsHubCsvRows(
        segment,
        this.overviewRows(),
        this.fileRows(),
        this.driveLinkRows(),
        this.needsReviewRows(),
      ),
    );
  }
}
