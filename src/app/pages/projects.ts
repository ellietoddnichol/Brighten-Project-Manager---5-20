import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';

import { CommonModule, CurrencyPipe } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { DataService } from '../services/data.service';

import { MatIconModule } from '@angular/material/icon';

import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PROJECT_STATUSES, Project } from '../models/types';

import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { dedupeProjectsForDisplay, findProjectMatches, pickCanonicalProject } from '../utils/project-dedupe';

import { projectSearchText, formatProjectDate } from '../utils/project';
import { effectiveForeman } from '../utils/project-setup.util';

import { ProjectControlsService } from '../services/project-controls.service';

import { ProjectLifecycleService } from '../services/project-lifecycle.service';

import { ProjectFinancialService } from '../services/project-financial.service';

import { ImportReviewService } from '../services/import-review.service';

import { MasterSheetSyncService } from '../services/master-sheet-sync.service';

import { ProjectsListView, ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';

import { matchesProjectsListView } from '../utils/project-lifecycle.compute';

import { PROJECT_PROFILE_OPTIONS, PROJECT_PROFILE_LABELS } from '../models/project-requirements.types';

import { PageHeaderComponent } from '../components/ui/page-header';

import { StatCardComponent } from '../components/ui/stat-card';

import { CompactStatStripComponent } from '../components/ui/compact-stat-strip';

import { SegmentedControlComponent } from '../components/ui/segmented-control';

import { StatusChipComponent, StatusTone } from '../components/ui/status-chip';

import {

  DetailDrawerComponent,

  DrawerSectionComponent,

  DrawerFieldComponent,

} from '../components/ui/detail-drawer';

import { downloadCsv } from '../utils/csv-export';

import {

  buildProjectListRow,

  matchesProjectsAdvancedFilters,

  normalizeProjectsViewParam,

  PROJECTS_VIEW_OPTIONS,

  projectsCsvRows,

  projectsEmptyMessage,

  ProjectsAdvancedFilterId,

  ProjectsAdvancedFilters,

  ProjectListRow,

  summarizeProjectsHub,

} from '../utils/projects-hub.compute';



const ADVANCED_FILTER_OPTIONS: { id: ProjectsAdvancedFilterId; label: string }[] = [

  { id: 'missingContract', label: 'Missing contract' },

  { id: 'missingBudget', label: 'Missing budget' },

  { id: 'missingDrive', label: 'Missing Drive' },

  { id: 'openAr', label: 'Open AR' },

  { id: 'under20Margin', label: 'Under 20% margin' },

  { id: 'cprDecision', label: 'Missing wage order' },

  { id: 'sourceReview', label: 'Source review issues' },

];



@Component({

  selector: 'app-projects',

  standalone: true,

  imports: [

    CommonModule,

    MatIconModule,

    FormsModule,

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

  providers: [CurrencyPipe],

  template: `

    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">

      <app-page-header

        title="Projects"

        subtitle="Active jobs, upcoming work, closeout, and archive"

        primaryActionLabel="New Project"

        (primaryAction)="openNewProject()">

        <a routerLink="/settings" fragment="import-review"

           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">

          Import / source review

        </a>

        <button type="button" (click)="syncProjects()" [disabled]="syncing()"

                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">

          <mat-icon class="!text-[18px]">{{ syncing() ? 'hourglass_empty' : 'sync' }}</mat-icon>

          {{ syncing() ? 'Syncing…' : 'Sync projects' }}

        </button>

        <button type="button" (click)="exportCsv()"

                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">

          Export CSV

        </button>

      </app-page-header>



      @if (syncMessage()) {

        <p class="text-sm text-emerald-700 -mt-2">{{ syncMessage() }}</p>

      }



      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

        @for (card of summaryCards(); track card.label) {

          <button type="button" (click)="setView(card.view)"

                  class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">

            <app-stat-card

              [label]="card.label"

              [value]="card.value"

              [subtext]="card.subtext"

              [icon]="card.icon"

              [trend]="card.alert ? 'View jobs' : undefined"

              [trendPositive]="true" />

          </button>

        }

      </div>



      @if (compactStats().length) {

        <app-compact-stat-strip [stats]="compactStats()" />

      }



      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">

        <div class="flex flex-col lg:flex-row lg:items-center gap-4">

          <div class="relative flex-1 min-w-[220px]">

            <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px]">search</mat-icon>

            <input type="text" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)"

                   placeholder="Search job #, project, customer, address, county…"

                   class="w-full pl-10 pr-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-300 outline-none text-sm">

          </div>

          <button type="button" (click)="openFilterDrawer()"

                  class="shrink-0 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-lg flex items-center gap-2">

            <mat-icon class="!text-[18px]">tune</mat-icon>

            Advanced filters

            @if (advancedFilterCount()) {

              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">{{ advancedFilterCount() }}</span>

            }

          </button>

        </div>



        <app-segmented-control

          [options]="segmentOptions()"

          [value]="viewMode()"

          (select)="setView($event)" />



        @if (showHiddenHint()) {

          <p class="text-xs text-slate-500">

            Closed and archived jobs are hidden from Active.

            <button type="button" (click)="setView('all')" class="font-semibold text-indigo-700 underline">Use All</button>

            to search every historical job.

          </p>

        }

      </div>



      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        @if (listRows().length) {

          <div class="divide-y divide-slate-100">

            @for (row of listRows(); track row.project.id) {

              <div class="group px-5 py-4 hover:bg-slate-50/80 transition-colors"

                   [class.opacity-70]="row.quietRow">

                <div class="flex flex-wrap items-start gap-4">

                  <a [routerLink]="['/projects', row.project.id]" class="min-w-0 flex-1">

                    <div class="flex flex-wrap items-center gap-2 mb-1">

                      <span class="text-xs font-bold font-mono text-slate-900">#{{ row.project.projectNumber }}</span>

                      <span class="text-sm font-bold text-slate-900 group-hover:text-indigo-700 truncate max-w-[320px]">

                        {{ row.project.projectName }}

                      </span>

                      <app-status-chip [tone]="statusTone(row.displayStatus)">{{ row.displayStatus }}</app-status-chip>

                      @if (row.health !== 'Neutral') {

                        <app-status-chip [tone]="healthTone(row.health)">{{ row.health }}</app-status-chip>

                      }

                    </div>

                    <p class="text-xs text-slate-500 truncate">

                      {{ row.project.customer || '—' }} · {{ row.profileLabel }}

                    </p>

                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">

                      <span><span class="text-slate-400">Contract</span> <span class="font-mono font-semibold">{{ fmt(row.financial.currentContractAmount) }}</span></span>

                      <span><span class="text-slate-400">Billed</span> <span class="font-mono font-semibold">{{ fmt(row.financial.billedToDate) }}</span></span>

                      <span>

                        <span class="text-slate-400">{{ row.moneySecondaryLabel }}</span>

                        <span class="font-mono font-semibold" [class.text-rose-700]="row.moneySecondaryAlert">{{ fmt(row.moneySecondaryValue) }}</span>

                      </span>

                    </div>

                    @if (row.warnings.length) {

                      <div class="flex flex-wrap gap-1.5 mt-2">

                        @for (chip of row.warnings; track chip.id) {

                          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"

                                [class.bg-rose-100]="chip.kind === 'critical'"

                                [class.text-rose-800]="chip.kind === 'critical'"

                                [class.bg-amber-100]="chip.kind === 'setup'"

                                [class.text-amber-800]="chip.kind === 'setup'">

                            {{ chip.label }}

                          </span>

                        }

                      </div>

                    }

                  </a>



                  <div class="flex flex-col items-end gap-2 shrink-0">

                    <div class="flex items-center gap-2">

                      @if (row.driveLinked) {

                        <a [href]="row.project.driveFolderUrl" target="_blank" rel="noopener"

                           (click)="$event.stopPropagation()"

                           class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"

                           title="Open Drive folder">

                          <mat-icon class="!text-[16px]">folder_shared</mat-icon>

                        </a>

                      } @else {

                        <span class="w-8 h-8 rounded-lg text-slate-300 flex items-center justify-center" title="Drive not linked">

                          <mat-icon class="!text-[16px]">folder_off</mat-icon>

                        </span>

                      }

                      <button type="button" (click)="openQuickView(row); $event.stopPropagation()"

                              class="text-xs font-semibold text-slate-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-slate-100">

                        Quick view

                      </button>

                    </div>

                    <a [routerLink]="row.nextActionRoute"

                       class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">

                      {{ row.nextActionLabel }}

                    </a>

                  </div>

                </div>

              </div>

            }

          </div>

        } @else {

          <div class="px-5 py-16 text-center">

            <p class="text-sm font-medium text-slate-700">{{ emptyState().title }}</p>

            @if (emptyState().hint) {

              <p class="text-xs text-slate-500 mt-2 max-w-md mx-auto">{{ emptyState().hint }}</p>

            }

          </div>

        }

      </section>



      <app-detail-drawer

        [open]="!!quickViewRow()"

        [title]="quickViewRow() ? '#' + quickViewRow()!.project.projectNumber + ' · ' + quickViewRow()!.project.projectName : ''"

        [subtitle]="quickViewSubtitle()"

        footerActionLabel="Open full project"

        (close)="quickViewRow.set(null)"

        (footerAction)="openQuickViewProject()">

        @if (quickViewRow(); as row) {

          <app-drawer-section title="Summary">

            <app-drawer-field label="Status" [value]="row.displayStatus" />

            <app-drawer-field label="Profile" [value]="row.profileLabel" />

            <app-drawer-field label="Health" [value]="row.health" [alert]="row.health === 'Red'" />

            <app-drawer-field label="Next action" [value]="row.nextActionLabel" />

          </app-drawer-section>

          <app-drawer-section title="Money">

            <app-drawer-field label="Contract" [value]="fmt(row.financial.currentContractAmount)" [mono]="true" />

            <app-drawer-field label="Billed to date" [value]="fmt(row.financial.billedToDate)" [mono]="true" />

            <app-drawer-field label="Open AR" [value]="fmt(row.financial.arBalance)" [mono]="true" />

            <app-drawer-field label="Left to bill" [value]="fmt(row.financial.leftToBill)" [mono]="true" />

            <app-drawer-field label="Margin" [value]="row.financial.forecastMargin.toFixed(1) + '%'" [alert]="row.financial.forecastMargin < 20" />

          </app-drawer-section>

          <app-drawer-section title="Setup">

            <app-drawer-field label="Foreman" [value]="drawerForeman(row)" />

            <app-drawer-field label="Address" [value]="row.project.address || '—'" />

            <app-drawer-field label="County" [value]="row.project.county || '—'" />

            <app-drawer-field label="Start" [value]="formatDate(row.lifecycle.derivedStartDate || row.project.startDate)" />

            <app-drawer-field label="Target end" [value]="formatDate(row.project.targetCompletionDate)" />

          </app-drawer-section>

          <app-drawer-section title="Drive">

            <app-drawer-field label="Folder" [value]="row.driveLinked ? 'Linked' : 'Not linked'" [alert]="!row.driveLinked" />

            @if (row.project.driveFolderUrl) {

              <a [href]="row.project.driveFolderUrl" target="_blank" rel="noopener"

                 class="text-sm font-semibold text-indigo-700 underline">Open Drive folder</a>

            }

          </app-drawer-section>

        }

      </app-detail-drawer>



      <app-detail-drawer

        [open]="filterDrawerOpen()"

        title="Advanced filters"

        subtitle="Narrow the project list"

        footerActionLabel="Apply filters"

        (close)="filterDrawerOpen.set(false)"

        (footerAction)="applyAdvancedFilters()">

        <app-drawer-section title="Team &amp; customer">

          <label class="block text-xs font-semibold text-slate-500 mb-1">Customer</label>

          <select [(ngModel)]="advancedDraft.customer" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All customers</option>

            @for (c of customers(); track c) {

              <option [value]="c">{{ c }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">PM</label>

          <select [(ngModel)]="advancedDraft.pm" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All PMs</option>

            @for (p of pms(); track p) {

              <option [value]="p">{{ p }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">Foreman</label>

          <select [(ngModel)]="advancedDraft.foreman" class="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All foremen</option>

            @for (f of foremen(); track f) {

              <option [value]="f">{{ f }}</option>

            }

          </select>

          <label class="block text-xs font-semibold text-slate-500 mb-1">Project profile</label>

          <select [(ngModel)]="advancedDraft.profile" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">

            <option value="all">All profiles</option>

            @for (p of profileOptions; track p) {

              <option [value]="p">{{ profileLabels[p] }}</option>

            }

          </select>

        </app-drawer-section>

        <app-drawer-section title="Issues">

          <div class="space-y-2">

            @for (opt of advancedFilterOptions; track opt.id) {

              <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">

                <input type="checkbox"

                       [checked]="advancedDraft.flags.has(opt.id)"

                       (change)="toggleAdvancedFlag(opt.id, $any($event.target).checked)"

                       class="rounded">

                {{ opt.label }}

              </label>

            }

          </div>

          <button type="button" (click)="clearAdvancedFilters()"

                  class="mt-4 text-sm font-semibold text-slate-500 hover:text-slate-800">

            Clear advanced filters

          </button>

        </app-drawer-section>

      </app-detail-drawer>



      @if (showNewProject()) {

        <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">

          <div class="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">

            <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">

              <div>

                <h2 class="text-base font-bold text-slate-900">New Project</h2>

                <p class="text-slate-500 text-xs mt-0.5">Add a job to Brighten</p>

              </div>

              <button type="button" (click)="showNewProject.set(false)" class="text-slate-400 hover:text-slate-600"><mat-icon>close</mat-icon></button>

            </div>

            <form (submit)="createProject($event)" class="p-6 space-y-5 overflow-y-auto">

              <div class="grid grid-cols-2 gap-4">

                <div>

                  <label for="num" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Project #</label>

                  <input id="num" type="text" [(ngModel)]="newProject.projectNumber" name="num" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

                <div>

                  <label for="name" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Project Name</label>

                  <input id="name" type="text" [(ngModel)]="newProject.projectName" name="name" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

              </div>

              <div class="grid grid-cols-2 gap-4">

                <div>

                  <label for="cust" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Customer / GC</label>

                  <input id="cust" type="text" [(ngModel)]="newProject.customer" name="cust" required class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                </div>

                <div>

                  <label for="status" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Status</label>

                  <select id="status" [(ngModel)]="newProject.status" name="status" class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

                    @for (s of statuses; track s) {

                      <option [value]="s">{{ s }}</option>

                    }

                  </select>

                </div>

              </div>

              <div>

                <label for="address" class="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Site Address</label>

                <input id="address" type="text" [(ngModel)]="newProject.address" name="address" class="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-slate-900 text-sm">

              </div>

              <div class="flex justify-end pt-2 shrink-0">

                <button type="submit" [disabled]="loading()"

                        class="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold shadow-sm hover:bg-slate-800 disabled:opacity-50 text-sm">

                  {{ loading() ? 'Saving…' : 'Create Project' }}

                </button>

              </div>

            </form>

          </div>

        </div>

      }

    </div>

  `,

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class Projects implements OnInit {

  private dataService = inject(DataService);

  private controls = inject(ProjectControlsService);

  private lifecycleSvc = inject(ProjectLifecycleService);

  private financialSvc = inject(ProjectFinancialService);

  private importReview = inject(ImportReviewService);

  private masterSync = inject(MasterSheetSyncService);

  private route = inject(ActivatedRoute);

  private router = inject(Router);

  private currency = inject(CurrencyPipe);



  statuses = PROJECT_STATUSES;

  profileOptions = PROJECT_PROFILE_OPTIONS;

  profileLabels = PROJECT_PROFILE_LABELS;

  advancedFilterOptions = ADVANCED_FILTER_OPTIONS;

  formatDate = formatProjectDate;

  drawerForeman(row: ProjectListRow): string {
    return effectiveForeman(row.project) || '—';
  }



  viewMode = signal<ProjectsListView>('default');

  searchQuery = signal('');

  showNewProject = signal(false);

  loading = signal(false);

  syncing = signal(false);

  syncMessage = signal<string | null>(null);

  filterDrawerOpen = signal(false);

  quickViewRow = signal<ProjectListRow | null>(null);



  advancedFilters = signal<ProjectsAdvancedFilters>({

    customer: 'all',

    pm: 'all',

    foreman: 'all',

    profile: 'all',

    flags: new Set(),

  });



  advancedDraft: ProjectsAdvancedFilters = {

    customer: 'all',

    pm: 'all',

    foreman: 'all',

    profile: 'all',

    flags: new Set(),

  };



  projects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });

  uniqueProjects = computed(() => dedupeProjectsForDisplay(this.projects() || []));

  arRecords = toSignal(this.dataService.getArRecords(), { initialValue: [] });



  lifecycleMap = computed(() => this.lifecycleSvc.snapshotMap());



  sourceReviewJobs = computed(() => {

    const jobs = new Set<string>();

    for (const e of this.importReview.unresolved()) {

      if (e.jobNumber) jobs.add(e.jobNumber.replace(/^0+/, '') || e.jobNumber);

    }

    return jobs;

  });



  allListRows = computed((): ProjectListRow[] => {

    const ar = this.arRecords() ?? [];

    const reviewJobs = this.sourceReviewJobs();

    return this.uniqueProjects().map(project => {

      const lifecycle = this.lifecycleFor(project);

      const financial = this.financialSvc.computeForProject(project);

      const jobKey = project.projectNumber.replace(/^0+/, '') || project.projectNumber;

      return buildProjectListRow({

        project,

        lifecycle,

        financial,

        arRecords: ar,

        sourceReviewIssue: reviewJobs.has(jobKey),

      });

    });

  });



  hubSummary = computed(() =>

    summarizeProjectsHub(

      this.lifecycleSvc.allSnapshots(),

      this.allListRows(),

    ),

  );



  summaryCards = computed(() => {

    const s = this.hubSummary();

    return [

      { label: 'Active Jobs', value: String(s.activeJobs), view: 'default' as ProjectsListView, icon: 'work', alert: false, subtext: undefined },

      { label: 'Upcoming', value: String(s.upcoming), view: 'upcoming' as ProjectsListView, icon: 'schedule', alert: s.upcoming > 0, subtext: undefined },

      { label: 'Closeout / AR', value: String(s.closeoutAr), view: 'closeout' as ProjectsListView, icon: 'receipt_long', alert: s.closeoutAr > 0, subtext: undefined },

      { label: 'Needs Review', value: String(s.needsReview), view: 'needsReview' as ProjectsListView, icon: 'fact_check', alert: s.needsReview > 0, subtext: undefined },

    ];

  });



  compactStats = computed(() => {

    const s = this.hubSummary();

    const view = this.viewMode();

    const stats: { label: string; value: string; alert?: boolean }[] = [];

    if (view === 'default' && s.closed2026Hidden > 0) {

      stats.push({ label: 'Closed 2026 hidden', value: String(s.closed2026Hidden) });

    }

    if (view === 'default' && s.archiveHidden > 0) {

      stats.push({ label: 'Archive hidden', value: String(s.archiveHidden) });

    }

    if (s.missingDrive > 0) stats.push({ label: 'Missing Drive', value: String(s.missingDrive), alert: true });

    if (s.missingContract > 0) stats.push({ label: 'Missing Contract', value: String(s.missingContract), alert: true });

    if (s.missingSetup > 0) stats.push({ label: 'Missing Setup', value: String(s.missingSetup), alert: true });

    return stats.slice(0, 5);

  });



  segmentOptions = computed(() => {

    const s = this.hubSummary();

    return PROJECTS_VIEW_OPTIONS.map(opt => ({

      id: opt.id,

      label: opt.label,

      badge: opt.id === 'default' ? (s.activeJobs || undefined)

        : opt.id === 'closeout' ? (s.closeoutAr || undefined)

        : opt.id === 'needsReview' ? (s.needsReview || undefined)

        : undefined,

    }));

  });



  listRows = computed(() => {

    const q = this.searchQuery().trim().toLowerCase();

    const view = this.viewMode();

    const filters = this.advancedFilters();



    let rows = this.allListRows();



    if (q) {

      rows = rows.filter(r => projectSearchText(r.project).includes(q));

    } else {

      rows = rows.filter(r => matchesProjectsListView(r.lifecycle, view, q));

    }



    rows = rows.filter(r => matchesProjectsAdvancedFilters(r, filters));



    return rows.sort((a, b) =>

      a.project.projectNumber.localeCompare(b.project.projectNumber, undefined, { numeric: true }),

    );

  });



  emptyState = computed(() => projectsEmptyMessage(this.viewMode(), !!this.searchQuery().trim()));

  quickViewSubtitle = computed(() => this.quickViewRow()?.project.customer || '');



  showHiddenHint = computed(() =>

    this.viewMode() === 'default' && !this.searchQuery().trim() && this.hubSummary().closed2026Hidden + this.hubSummary().archiveHidden > 0,

  );



  advancedFilterCount = computed(() => {

    const f = this.advancedFilters();

    let n = f.flags.size;

    if (f.customer !== 'all') n++;

    if (f.pm !== 'all') n++;

    if (f.foreman !== 'all') n++;

    if (f.profile !== 'all') n++;

    return n;

  });



  customers = computed(() => [...new Set(this.uniqueProjects().map(p => p.customer).filter(Boolean))].sort() as string[]);

  pms = computed(() => [...new Set(this.uniqueProjects().map(p => p.projectManager).filter(Boolean))].sort() as string[]);

  foremen = computed(() => [...new Set(this.uniqueProjects().map(p => p.superintendent).filter(Boolean))].sort() as string[]);



  newProject: Partial<Project> = this.emptyProject();



  constructor() {

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {

      if (params.get('q')) {

        this.searchQuery.set(String(params.get('q')));

        this.viewMode.set('all');

        return;

      }

      if (params.get('view')) {

        this.viewMode.set(normalizeProjectsViewParam(params.get('view')));

      }

      if (params.get('wip')) {

        this.viewMode.set('all');

      } else if (params.get('actions') === '1') {

        this.viewMode.set('all');

      } else if (params.get('status')) {

        const s = params.get('status') as string;

        if (s === 'Closed' || s === 'closed2026') this.viewMode.set('closed2026');

        else if (s === 'Archive') this.viewMode.set('archive');

        else if (s === 'Active' || s === 'In Progress') this.viewMode.set('default');

        else if (s === 'all') this.viewMode.set('all');

        else {

          this.viewMode.set('all');

          this.searchQuery.set(s);

        }

      }

    });

  }



  ngOnInit(): void {

    this.syncAdvancedDraft();

  }



  lifecycleFor(project: Project): ProjectLifecycleSnapshot {

    return this.lifecycleMap().get(project.id) ?? this.lifecycleSvc.forProject(project);

  }



  fmt(value: number): string {

    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';

  }



  statusTone(status: string): StatusTone {

    switch (status) {

      case 'Active': return 'blue';

      case 'Upcoming': return 'slate';

      case 'Closeout': return 'amber';

      case 'Closed': return 'slate';

      case 'Archived': return 'slate';

      case 'Needs Review': return 'amber';

      default: return 'slate';

    }

  }



  healthTone(health: string): StatusTone {

    switch (health) {

      case 'Green': return 'green';

      case 'Yellow': return 'amber';

      case 'Red': return 'red';

      default: return 'slate';

    }

  }



  setView(view: ProjectsListView): void {

    this.viewMode.set(view);

    void this.router.navigate([], {

      relativeTo: this.route,

      queryParams: { view: view === 'default' ? 'active' : view, q: null, status: null, wip: null, actions: null },

      queryParamsHandling: 'merge',

      replaceUrl: true,

    });

  }



  onSearch(value: string): void {

    this.searchQuery.set(value);

    if (value.trim()) {

      this.viewMode.set('all');

    }

  }



  openQuickView(row: ProjectListRow): void {

    this.quickViewRow.set(row);

  }



  openQuickViewProject(): void {

    const row = this.quickViewRow();

    if (row) void this.router.navigate(['/projects', row.project.id]);

  }



  openFilterDrawer(): void {

    this.syncAdvancedDraft();

    this.filterDrawerOpen.set(true);

  }



  applyAdvancedFilters(): void {

    this.advancedFilters.set({

      ...this.advancedDraft,

      flags: new Set(this.advancedDraft.flags),

    });

    this.filterDrawerOpen.set(false);

  }



  toggleAdvancedFlag(id: ProjectsAdvancedFilterId, checked: boolean): void {

    if (checked) this.advancedDraft.flags.add(id);

    else this.advancedDraft.flags.delete(id);

  }



  clearAdvancedFilters(): void {

    this.advancedDraft = { customer: 'all', pm: 'all', foreman: 'all', profile: 'all', flags: new Set() };

    this.advancedFilters.set({ ...this.advancedDraft, flags: new Set() });

  }



  syncAdvancedDraft(): void {

    const f = this.advancedFilters();

    this.advancedDraft = { ...f, flags: new Set(f.flags) };

  }



  exportCsv(): void {

    downloadCsv(

      `projects-${this.viewMode()}-${new Date().toISOString().slice(0, 10)}.csv`,

      ['Job #', 'Project', 'Customer', 'Status', 'Profile', 'Contract', 'Billed', 'AR', 'Left to bill', 'Health', 'Warnings', 'Next action', 'Drive'],

      projectsCsvRows(this.listRows()),

    );

  }



  async syncProjects(): Promise<void> {

    this.syncing.set(true);

    this.syncMessage.set(null);

    try {

      await this.masterSync.syncFromMasterSheet(true);

      this.syncMessage.set('Projects synced from Master Sheet.');

    } catch (err) {

      this.syncMessage.set(err instanceof Error ? err.message : 'Sync failed');

    } finally {

      this.syncing.set(false);

    }

  }



  openNewProject(): void {

    this.newProject = this.emptyProject();

    this.showNewProject.set(true);

  }



  emptyProject(): Partial<Project> {

    return {

      projectNumber: '',

      projectName: '',

      customer: '',

      status: 'Lead / Precon',

      billingType: 'Lump Sum',

      taxExempt: false,

      prevailingWage: false,

      kansasRemodelTax: false,

    };

  }



  createProject(event: Event): void {

    event.preventDefault();

    if (!this.newProject.projectName || !this.newProject.projectNumber) return;



    const matches = findProjectMatches(this.projects() || [], {

      projectNumber: this.newProject.projectNumber,

      projectName: this.newProject.projectName,

    });

    if (matches.length) {

      const duplicate = pickCanonicalProject(matches);

      alert(`Job #${duplicate.projectNumber} already exists (${duplicate.projectName}). Open that project instead.`);

      return;

    }



    this.loading.set(true);

    const payload = { ...this.newProject, taxable: !this.newProject.taxExempt };

    this.dataService.createProject(payload).subscribe({

      next: (project) => {

        void this.controls.onProjectCreated(project);

        this.showNewProject.set(false);

        this.newProject = this.emptyProject();

        this.loading.set(false);

      },

      error: (err) => {

        this.loading.set(false);

        alert('Failed to create project.');

        console.error('Create project failed:', err);

      },

    });

  }

}


