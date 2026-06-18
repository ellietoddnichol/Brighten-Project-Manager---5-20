import { Component, ChangeDetectionStrategy, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '@core/services/data.service';
import { ProjectApiService } from '@core/services/api/project-api.service';
import { buildProjectApiUpdatePayload, hasApiUpdateFields } from '@core/services/api/project-api-update';
import { apiConfig } from '@app/config/api.config';
import { qbSyncConfig } from '@app/config/qb-sync.config';
import { AuthService } from '@core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { Project, PROJECT_STATUSES } from '@app/models/types';
import { PROJECT_PROFILE_OPTIONS, PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';
import { DriveService, DriveFile, parseDriveFolderId } from '@core/services/drive.service';
import { DriveFolderDiscoveryService } from '@features/subcontractors/services/drive-folder-discovery.service';
import { getProjectFinancialSummary } from '@shared/utils/financial';
import { formatProjectDate, isOverheadJob } from '@shared/utils/project';
import {
  isMasterSheetLinkedProject,
  isMasterSheetReadOnlyField,
  stripMasterSheetFieldsFromUserPatch,
} from '@shared/utils/master-sheet-fields';
import { collectProjectActionItems } from '@shared/utils/action-items';
import { CertifiedPayrollService } from '@features/labor/services/certified-payroll.service';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';
import { getNextMilestone, buildProjectActivityFeed } from '@shared/utils/field';
import { BudgetLineService } from '@features/projects/services/budget-line.service';
import { buildProjectCostDonut, buildBudgetVsActualBars, buildBudgetVsActualFromLines } from '@shared/utils/chart-data';
import { ProjectDataService } from '@features/projects/services/project-data.service';
import { normalizedProjectToProject } from '@shared/utils/sheet-normalizers';
import { ProjectPrimaryNavComponent } from '@app/components/project/project-primary-nav';
import { ProjectMoreMenuComponent } from '@app/components/project/project-more-menu';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { ProjectOverviewPanelComponent } from '@app/components/project/project-overview-panel';
import { ProjectRecordHeaderComponent } from '@app/components/project/project-record-header';
import {
  ProjectRecordOverviewTabComponent,
  ProjectRecordLaborTabComponent,
  ProjectRecordMaterialsTabComponent,
  ProjectRecordChangesTabComponent,
  ProjectRecordDocumentsTabComponent,
  ProjectRecordTodosTabComponent,
  ProjectRecordActivitiesTabComponent,
  ProjectRecordSubsTabComponent,
} from '@app/components/project/project-record-tabs';
import { JobRecordService } from '@features/projects/services/job-record.service';
import { manualFirstConfig } from '@app/config/manual-first.config';
import {
  FinancialView,
  NewItemAction,
  ProjectNavState,
  ProjectPrimarySection,
  UtilityView,
  WorkflowChip,
  WorkflowView,
  FileView,
} from '@app/components/project/project-detail.types';
import {
  defaultNavState,
  navQueryParams,
  openFinancial,
  openFileView,
  openUtility,
  openWorkflow,
  resolveNavFromQuery,
  savePersistedNav,
  persistShowAllToolsKey,
  loadPersistedLastTab,
  savePersistedLastTab,
} from '@app/components/project/project-navigation';
import { ProjectNeedsService } from '@features/projects/services/project-needs.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { workflowChipVisible, computeProjectEnabledModules } from '@features/projects/utils/project-needs.compute';

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, RouterModule, FormsModule,
    ProjectPrimaryNavComponent, ProjectMoreMenuComponent,
    PageHeaderComponent, StatusChipComponent, EmptyStateComponent,
    ProjectRecordHeaderComponent,
    ProjectRecordOverviewTabComponent, ProjectRecordLaborTabComponent,
    ProjectRecordMaterialsTabComponent, ProjectRecordChangesTabComponent,
    ProjectRecordDocumentsTabComponent, ProjectRecordTodosTabComponent,
    ProjectRecordActivitiesTabComponent, ProjectRecordSubsTabComponent,
  ],
  template: `
    <div class="project-detail-density min-h-full overflow-y-auto bg-slate-50/50">
      <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">

        @if (projectLoading()) {
          <div class="animate-pulse space-y-4">
            <div class="h-4 bg-slate-100 rounded w-32"></div>
            <div class="h-8 bg-slate-100 rounded w-2/3"></div>
            <div class="h-4 bg-slate-100 rounded w-1/3"></div>
            <div class="flex gap-2 pt-2">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="h-9 bg-slate-100 rounded-t-lg w-28"></div>
              }
            </div>
            <div class="h-64 bg-slate-100 rounded-xl"></div>
          </div>
        } @else if (projectNotFound()) {
          <app-empty-state
            icon="search_off"
            title="Project not found"
            message="This project may have been archived or the link is incorrect." />
          <div class="text-center -mt-8">
            <a routerLink="/projects"
               class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-colors">
              Back to Projects
            </a>
          </div>
        } @else if (project(); as p) {

          @if (loadError()) {
            <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <mat-icon class="!text-[16px] text-amber-500 shrink-0">warning</mat-icon>
              <span>Could not load project data. Check your connection.</span>
              <button type="button" (click)="reload()"
                      class="ml-auto text-xs font-semibold underline hover:text-amber-900 transition-colors">Retry</button>
            </div>
          }

          <nav class="text-xs text-slate-500 mb-1">
            <a routerLink="/projects" class="hover:text-slate-900 transition-colors">Projects</a>
            › <span class="text-slate-900">{{ p.projectNumber }}</span>
          </nav>

          <app-project-record-header
            [project]="p"
            [totals]="jobTotals()"
            [profit]="jobProfit()"
            (edit)="openEdit()" />

          <app-project-primary-nav
            [active]="nav().section"
            [showSubs]="showSubsTab()"
            (sectionChange)="setSection($event)" />

          <div>
            @switch (nav().section) {
              @case ('overview') {
                <app-project-record-overview-tab [project]="p" />
              }
              @case ('labor') {
                <app-project-record-labor-tab [project]="p" />
              }
              @case ('materials') {
                <app-project-record-materials-tab [project]="p" />
              }
              @case ('changes') {
                <app-project-record-changes-tab [project]="p" />
              }
              @case ('documents') {
                <app-project-record-documents-tab [project]="p" />
              }
              @case ('todos') {
                <app-project-record-todos-tab [project]="p" />
              }
              @case ('activities') {
                <app-project-record-activities-tab [project]="p" />
              }
              @case ('subs') {
                <app-project-record-subs-tab [project]="p" />
              }
            }
          </div>
        }
      </div>
    </div>

    @if (showEditModal()) {
      <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-2xl rounded-xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
          <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
            <h2 class="text-base font-bold text-slate-900">Edit Project</h2>
            <button type="button" (click)="showEditModal.set(false)" class="text-slate-400 hover:text-slate-600"><mat-icon>close</mat-icon></button>
          </div>
          <form (submit)="saveEdit(); $event.preventDefault()" class="p-6 space-y-4 overflow-y-auto">
            @if (masterSheetLinked() && !manualProjectEdit()) {
              <p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Fields synced from the Master Data Sheet are read-only here. PM, contract, status, and other app fields can still be edited.
              </p>
            } @else if (manualProjectEdit()) {
              <p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Manual project mode — edit job details here. Master sheet sync will not overwrite your changes to name, customer, or address.
              </p>
            }
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Project #</label>
                <input type="text" [(ngModel)]="editDraft.projectNumber" name="editNum"
                       [disabled]="isReadOnlyField('projectNumber')"
                       class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 disabled:text-slate-500">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Project Name</label>
                <input type="text" [(ngModel)]="editDraft.projectName" name="editName"
                       [disabled]="isReadOnlyField('projectName')"
                       class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 disabled:text-slate-500">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Customer</label>
                <input type="text" [(ngModel)]="editDraft.customer" name="editCust"
                       [disabled]="isReadOnlyField('customer')"
                       class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 disabled:text-slate-500">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Status</label>
                <select [(ngModel)]="editDraft.status" name="editStatus" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  @for (s of projectStatuses; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
            </div>
            <div>
              <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Address</label>
              <input type="text" [(ngModel)]="editDraft.address" name="editAddress"
                     [disabled]="isReadOnlyField('address')"
                     class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:bg-slate-100 disabled:text-slate-500">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Project Manager</label>
                <input type="text" [(ngModel)]="editDraft.projectManager" name="editPm" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Superintendent</label>
                <input type="text" [(ngModel)]="editDraft.superintendent" name="editSup" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Billed to Date ($)</label>
                <input type="number" [(ngModel)]="editDraft.billedToDate" name="editBilled" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Estimated Total Cost ($)</label>
                <input type="number" [(ngModel)]="editDraft.estimatedTotalCost" name="editEstCost" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.prevailingWage" name="editPw"> Prevailing Wage / CPR</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.retainageRequired" name="editRetReq"> Retainage Required</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.progressBilling" name="editProgBill"> Progress Billing</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.taxExempt" name="editTaxEx"> Tax Exempt</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.bondRequired" name="editBond"> Bond Required</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.hasSubcontractors" name="editHasSubs"> Has Subcontractors</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.tmBilling" name="editTm"> T&M Billing</label>
              <label class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="editDraft.archived" name="editArchived"> Archived</label>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Contract ($)</label>
                <input type="number" [(ngModel)]="editDraft.originalContractAmount" name="editContract" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Retainage %</label>
                <input type="number" min="0" max="100" step="0.01" [(ngModel)]="editDraft.retainagePercent" name="editRet" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Project Profile</label>
                <select [(ngModel)]="editDraft.projectProfile" name="editProfile" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option [ngValue]="undefined">—</option>
                  @for (opt of projectProfileOptions; track opt) {
                    <option [value]="opt">{{ projectProfileLabels[opt] }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Current Phase</label>
                <input type="text" [(ngModel)]="editDraft.currentPhase" name="editPhase" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Award Date</label>
                <input type="date" [(ngModel)]="editDraft.awardDate" name="editAward" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
            <div class="pt-2 border-t border-slate-200">
              <p class="text-[11px] font-bold text-slate-500 uppercase mb-2">Project Scope</p>
              <div class="space-y-3">
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Scope Summary</label>
                  <textarea [(ngModel)]="editDraft.scopeSummary" name="editScopeSummary" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Included Work</label>
                  <textarea [(ngModel)]="editDraft.includedWork" name="editIncluded" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Exclusions / By Others</label>
                  <textarea [(ngModel)]="editDraft.exclusions" name="editExclusions" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Schedule / Access Notes</label>
                  <textarea [(ngModel)]="editDraft.scheduleAccessNotes" name="editSchedule" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Closeout / Special Requirements</label>
                  <textarea [(ngModel)]="editDraft.closeoutRequirements" name="editCloseout" rows="2" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"></textarea>
                </div>
              </div>
            </div>
            @if (saveEditError()) {
              <p class="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{{ saveEditError() }}</p>
            }
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" (click)="showEditModal.set(false)" class="px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="submit" [disabled]="savingEdit()" class="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                {{ savingEdit() ? 'Saving...' : 'Save Changes' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetails implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly projectApi = inject(ProjectApiService);
  private projectData = inject(ProjectDataService);
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private driveService = inject(DriveService);
  private folderDiscovery = inject(DriveFolderDiscoveryService);
  private certifiedPayroll = inject(CertifiedPayrollService);
  private budgetLineSvc = inject(BudgetLineService);
  private needsSvc = inject(ProjectNeedsService);
  private lifecycleSvc = inject(ProjectLifecycleService);
  private jobRecord = inject(JobRecordService);

  jobTotals = computed(() => {
    const p = this.project();
    if (!p) {
      return {
        totalHours: 0, laborCost: 0, materialCost: 0, approvedChangeAmount: 0, pendingChangeAmount: 0,
        costToDate: 0, syncedLaborHours: 0, syncedMaterialCost: 0, manualLaborHours: 0, manualMaterialCost: 0,
      };
    }
    return this.jobRecord.totalsForProject(p, this.changeOrders() ?? []);
  });

  jobProfit = computed(() => {
    const p = this.project();
    if (!p) {
      return this.jobRecord.profitForProject({} as Project, this.jobTotals());
    }
    return this.jobRecord.profitForProject(p, this.jobTotals());
  });

  showSubsTab = computed(() => {
    const p = this.project();
    return p ? this.jobRecord.showSubsTab(p) : false;
  });

  projectId: string | null = this.route.snapshot.paramMap.get('id');

  firestoreReady = signal(false);
  newMenuOpen = signal(false);

  readonly newItems: NewItemAction[] = [
    { id: 'labor', label: 'Labor Entry', icon: 'schedule', section: 'labor' },
    { id: 'material', label: 'Material Entry', icon: 'inventory', section: 'materials' },
    { id: 'change', label: 'Change', icon: 'sync_alt', section: 'changes' },
    { id: 'todo', label: 'Todo', icon: 'task_alt', section: 'todos' },
    { id: 'upload-doc', label: 'Document Link', icon: 'upload_file', section: 'documents' },
    { id: 'activity', label: 'Activity', icon: 'history', section: 'activities' },
  ];

  firestoreProjects = toSignal(this.dataService.getProjects(), { initialValue: [] });
  project = computed(() => {
    const routeId = this.projectId;
    if (!routeId) return undefined;

    const firestoreProject = this.fallbackProjectForRoute(routeId);
    if (manualFirstConfig.firestoreLiveEdits) {
      return firestoreProject;
    }

    const fallbackProject = firestoreProject;

    const apiDetail = this.projectApi.detailProject();
    if (
      apiDetail
      && this.projectApi.detailActiveSource() === 'api'
      && (
        (
          this.projectApi.detailProjectId() === routeId
          && this.matchesRouteProject(apiDetail, routeId)
        )
        || (
          fallbackProject?.projectNumber
          && apiDetail.projectNumber === fallbackProject.projectNumber
        )
      )
    ) {
      return apiDetail;
    }

    if (this.projectApi.activeSource() === 'api') {
      const cached = (this.projectApi.projects() || []).find(p => this.matchesRouteProject(p, routeId));
      if (cached) return cached;
    }

    return fallbackProject;
  });

  projectLoading = computed(() => {
    if (!this.projectId) return false;
    if (this.project()) return false;
    if (this.projectApi.isEnabled() && this.projectApi.detailLoading()) return true;
    return !this.firestoreReady();
  });

  projectNotFound = computed(() =>
    !!this.projectId
    && this.firestoreReady()
    && !this.projectLoading()
    && !this.project()
    && !(this.projectApi.isEnabled() && this.projectApi.detailLoading()),
  );

  loadError = computed(() => {
    if (this.project()) return null;
    if (this.projectApi.isEnabled() && this.projectApi.detailError() && !this.projectApi.detailLoading()) {
      return this.projectApi.detailError();
    }
    return null;
  });

  changeOrders = toSignal(this.dataService.getChangeOrders(), { initialValue: [] });
  rfis = toSignal(this.dataService.getRfis(), { initialValue: [] });
  submittals = toSignal(this.dataService.getSubmittals(), { initialValue: [] });
  dailyLogs = toSignal(this.dataService.getDailyLogs(), { initialValue: [] });
  fieldIssues = toSignal(this.dataService.getFieldIssues(), { initialValue: [] });
  billings = toSignal(this.dataService.getBillings(), { initialValue: [] });
  budgetLines = toSignal(this.dataService.getBudgetLines(), { initialValue: [] });
  pos = toSignal(this.dataService.getPOs(), { initialValue: [] });
  arRecords = toSignal(this.dataService.getArRecords(), { initialValue: [] });
  files = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  reqDocs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });
  issues = toSignal(this.dataService.getProjectIssues(), { initialValue: [] });
  tasks = toSignal(this.dataService.getProjectTasks(), { initialValue: [] });
  milestones = toSignal(this.dataService.getMilestones(), { initialValue: [] });

  sheetDetail = computed(() => (this.projectId ? this.projectData.getProjectDetail(this.projectId) : null));

  projectCOs = computed(() => {
    const sheetCos = this.sheetDetail()?.changes ?? [];
    if (sheetCos.length) {
      return sheetCos.map(c => ({
        id: c.id,
        projectId: c.projectId,
        coNumber: c.changeNo,
        title: c.title,
        status: c.status as import('@app/models/types').ChangeOrder['status'],
        sellPrice: c.submittedAmount,
        approvedAmount: c.approvedAmount,
        dateSubmitted: c.dateSubmitted,
      }));
    }
    return (this.changeOrders() || []).filter(co => co.projectId === this.projectId);
  });

  projectBillings = computed(() => {
    const sheetInvoices = this.sheetDetail()?.invoices ?? [];
    if (sheetInvoices.length) {
      return sheetInvoices.map(i => ({
        id: i.id,
        projectId: i.projectId,
        payAppNumber: i.invoiceNo,
        billingPeriod: i.billingPeriod ?? '',
        status: i.status as import('@app/models/types').Billing['status'],
        totalBilledToDate: i.grossBilled,
        amountPaid: i.paid,
      }));
    }
    return (this.billings() || []).filter(b => b.projectId === this.projectId);
  });

  projectBudgetLines = computed(() =>
    (this.budgetLines() || []).filter(line => line.projectId === this.projectId),
  );

  activityFeed = computed(() => buildProjectActivityFeed(
    this.projectId!,
    this.files() || [],
    this.issues() || [],
    this.tasks() || [],
    this.changeOrders() || [],
    this.billings() || [],
    this.milestones() || [],
  ));

  financialSummary = computed(() =>
    getProjectFinancialSummary(this.project() || null, this.projectCOs(), this.projectBillings()),
  );

  costDonut = computed(() => {
    const p = this.project();
    return p ? buildProjectCostDonut(p) : [];
  });

  budgetVsActual = computed(() => {
    const p = this.project();
    if (!p) return { labels: [], rows: [] };
    const lines = this.budgetLineSvc.computeForProject(p);
    if (lines.length) return buildBudgetVsActualFromLines(lines);
    return buildBudgetVsActualBars(p);
  });

  latestChangeOrders = computed(() =>
    [...this.projectCOs()]
      .sort((a, b) => (b.dateSubmitted || '').localeCompare(a.dateSubmitted || ''))
      .slice(0, 5),
  );

  projectExceptions = computed(() => {
    const p = this.project();
    if (!p) return [];
    const lifecycleMap = this.lifecycleSvc.snapshotMap();
    return collectProjectActionItems(p, {
      changeOrders: this.changeOrders() || [],
      billings: this.billings() || [],
      pos: this.pos() || [],
      budgetLines: this.budgetLines() || [],
      arRecords: this.arRecords() || [],
      files: this.files() || [],
      requiredDocuments: this.reqDocs() || [],
      issues: this.issues() || [],
      tasks: this.tasks() || [],
      milestones: this.milestones() || [],
      lifecycleByProjectId: lifecycleMap,
    });
  });

  workflowChips = computed((): WorkflowChip[] => {
    const pid = this.projectId!;
    const openCos = this.projectCOs().filter(c => !['Approved', 'Rejected', 'Void'].includes(c.status ?? '')).length;
    const openRfis = this.rfis().filter(r => r.projectId === pid && r.status !== 'Closed').length;
    const openSubs = this.submittals().filter(s => s.projectId === pid && s.status !== 'Approved').length;
    const openLogs = this.dailyLogs().filter(l => l.projectId === pid).length;
    const openIssues = this.fieldIssues().filter(f => f.projectId === pid && f.status !== 'Closed').length;
    const draftBilling = this.projectBillings().filter(b => b.status === 'Draft' || b.status === 'Submitted').length;

    return [
      { id: 'changes', label: 'Changes', count: openCos, status: openCos ? 'attention' : 'ok' },
      { id: 'rfis', label: 'RFIs', count: openRfis, status: openRfis ? 'attention' : 'ok' },
      { id: 'submittals', label: 'Submittals', count: openSubs, status: openSubs ? 'attention' : 'ok' },
      { id: 'daily-logs', label: 'Daily Logs', count: openLogs, status: 'ok' },
      { id: 'field-issues', label: 'Field Issues', count: openIssues, status: openIssues ? 'alert' : 'ok' },
      { id: 'billing', label: 'Billing', count: draftBilling, status: draftBilling ? 'attention' : 'ok' },
    ];
  });

  showAllTools = signal(true);

  enabledModules = computed(() => {
    const p = this.project();
    if (!p) return computeProjectEnabledModules({
      projectId: '',
      isActive2026: false,
      prevailingWage: false,
      certifiedPayrollRequired: false,
      bonusEligible: false,
      hasForemanAssignment: false,
      hasLaborBudget: false,
      hasDriveFolder: false,
      hasRFIs: false,
      hasSubmittals: false,
      hasDailyLogs: false,
      hasFieldIssues: false,
      hasOpenTasks: false,
      hasCPRRecords: false,
      hasSubs: false,
      hasPOs: false,
      hasSubcontractorCosts: false,
      hasSubInvoices: false,
      hasAR: false,
      hasBilling: false,
      hasQuickBooksDetailCosts: false,
      hasApprovedCoNotBilled: false,
      hasBonusRecords: false,
      requiresRfis: false,
      requiresSubmittals: false,
      requiresDailyLogs: false,
      hasMaterialScope: false,
      hasSafetyRecords: false,
      hasInspectionRecords: false,
      isCloseoutOrClosed: false,
      showAllTools: this.showAllTools(),
    });
    return this.needsSvc.enabledModules(p, this.showAllTools());
  });

  visibleWorkflowChips = computed(() => {
    const modules = this.enabledModules();
    return this.workflowChips().filter(chip =>
      workflowChipVisible(chip.id, modules, chip.count, chip.status !== 'ok'),
    );
  });

  lifecycleSnapshot = computed(() => {
    const p = this.project();
    return p ? this.lifecycleSvc.forProject(p) : undefined;
  });

  nextAction = computed(() => {
    const p = this.project();
    return p ? this.needsSvc.nextAction(p) : undefined;
  });

  nav = signal<ProjectNavState>(defaultNavState());
  showEditModal = signal(false);
  savingEdit = signal(false);
  saveEditError = signal<string | null>(null);
  editDraft: Partial<Project> = {};
  projectStatuses = PROJECT_STATUSES;
  projectProfileOptions = PROJECT_PROFILE_OPTIONS;
  projectProfileLabels = PROJECT_PROFILE_LABELS;

  masterSheetLinked = computed(() => {
    const p = this.project();
    return p ? isMasterSheetLinkedProject(p) : false;
  });
  manualProjectEdit = computed(() => qbSyncConfig.isManualMode());

  driveFiles = signal<DriveFile[]>([]);
  loadingFiles = signal(false);
  driveError = signal<string | null>(null);

  constructor() {
    this.dataService.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => this.firestoreReady.set(true),
      error: () => this.firestoreReady.set(true),
    });

    const tab = this.route.snapshot.queryParamMap.get('tab');
    const section = this.route.snapshot.queryParamMap.get('section');
    const view = this.route.snapshot.queryParamMap.get('view');
    if (!tab && !section && this.projectId) {
      const persistedSection = loadPersistedLastTab(this.projectId);
      this.nav.set(persistedSection
        ? { ...defaultNavState(), section: persistedSection }
        : resolveNavFromQuery(tab, section, view));
    } else {
      this.nav.set(resolveNavFromQuery(tab, section, view));
    }

    if (this.projectId) {
      try {
        const raw = localStorage.getItem(persistShowAllToolsKey(this.projectId));
        if (raw === 'false') this.showAllTools.set(false);
        else if (raw === 'true') this.showAllTools.set(true);
      } catch { /* ignore */ }
    }

    this.route.queryParamMap.subscribe(params => {
      this.nav.set(resolveNavFromQuery(
        params.get('tab'),
        params.get('section'),
        params.get('view'),
      ));
    });

    effect(() => {
      const utility = this.nav().utilityView;
      if (utility === 'files' && this.project()?.driveFolderId) {
        void this.loadDriveFiles();
      }
    });

    effect(() => {
      const routeId = this.projectId;
      const fallbackProject = routeId ? this.fallbackProjectForRoute(routeId) : undefined;
      if (
        routeId
        && fallbackProject?.projectNumber
        && fallbackProject.projectNumber !== routeId
        && this.projectApi.detailProjectId() === routeId
        && this.projectApi.detailActiveSource() === 'firestore'
        && this.projectApi.detailError()
      ) {
        void this.projectApi.loadProjectDetail(fallbackProject.projectNumber);
      }
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.projectId = params.get('id');
      if (!this.projectId) return;

      const tab = this.route.snapshot.queryParamMap.get('tab');
      const section = this.route.snapshot.queryParamMap.get('section');
      if (!tab && !section) {
        const persistedSection = loadPersistedLastTab(this.projectId);
        if (persistedSection) {
          this.nav.set({ ...defaultNavState(), section: persistedSection });
        }
      }

      if (this.projectApi.isEnabled()) {
        void this.projectApi.loadProjectDetail(this.projectId);
      }
    });
  }

  private matchesRouteProject(project: Project, routeId: string): boolean {
    const job = routeId.replace(/^J/i, '').trim();
    return (
      project.id === routeId
      || project.seedProjectId === routeId
      || project.projectNumber === routeId
      || project.projectNumber === job
    );
  }

  private fallbackProjectForRoute(routeId: string): Project | undefined {
    const firestoreProject = (this.firestoreProjects() || []).find(
      p => this.matchesRouteProject(p, routeId),
    );
    if (firestoreProject) return firestoreProject;

    const sheetProject = this.projectData.getProjectDetail(routeId)?.project ?? null;
    return sheetProject ? normalizedProjectToProject(sheetProject) : undefined;
  }

  retryDetail(): void {
    if (this.projectId) void this.projectApi.loadProjectDetail(this.projectId);
  }

  reload(): void {
    this.firestoreReady.set(false);
    this.dataService.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => this.firestoreReady.set(true),
      error: () => this.firestoreReady.set(true),
    });
    this.retryDetail();
  }

  statusTone(status: string | undefined): StatusTone {
    switch (status) {
      case 'Active':
      case 'In Progress':
        return 'green';
      case 'Closeout':
      case 'Needs Review':
        return 'amber';
      case 'Closed':
      case 'Archived':
        return 'slate';
      default:
        return 'blue';
    }
  }

  selectNewItem(item: NewItemAction): void {
    this.newMenuOpen.set(false);
    this.onNewItem(item);
  }

  setSection(section: ProjectPrimarySection): void {
    this.applyNav({ ...defaultNavState(), section, utilityView: null });
  }

  goWorkflow(view: WorkflowView | 'billing'): void {
    if (view === 'billing') {
      this.applyNav(openFinancial('billing'));
    } else {
      this.applyNav(openWorkflow(view));
    }
  }

  goFinancial(view: FinancialView): void {
    this.applyNav(openFinancial(view));
  }

  goActionItem(state: ProjectNavState): void {
    this.applyNav(state);
  }

  goFileView(view: FileView): void {
    this.applyNav(openFileView(view));
  }

  toggleShowAllTools(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.showAllTools.set(checked);
    if (this.projectId) {
      try {
        localStorage.setItem(persistShowAllToolsKey(this.projectId), String(checked));
      } catch { /* ignore */ }
    }
  }

  openMore(view: UtilityView): void {
    this.applyNav({ ...this.nav(), utilityView: view });
    if (view === 'files') void this.loadDriveFiles();
  }

  closeUtility(): void {
    this.applyNav({ ...this.nav(), utilityView: null });
  }

  onNewItem(item: NewItemAction): void {
    if (item.section) {
      this.setSection(item.section);
    }
  }

  private applyNav(state: ProjectNavState): void {
    this.nav.set(state);
    if (this.projectId) {
      savePersistedNav(this.projectId, state);
      savePersistedLastTab(this.projectId, state.section);
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: navQueryParams(state),
      queryParamsHandling: 'merge',
    });
  }

  openEdit(): void {
    const p = this.project();
    if (!p) return;
    this.editDraft = { ...p };
    this.saveEditError.set(null);
    this.showEditModal.set(true);
  }

  isReadOnlyField(field: keyof Project): boolean {
    const p = this.project();
    return p ? isMasterSheetReadOnlyField(field, p) : false;
  }

  saveEdit(): void {
    if (!this.projectId) return;
    const current = this.project();
    if (!current) return;

    const firestorePatch = stripMasterSheetFieldsFromUserPatch(current, {
      ...this.editDraft,
      taxable: !this.editDraft.taxExempt,
    });

    if (apiConfig.useApiBackend && this.projectApi.isEnabled()) {
      const apiPatch = buildProjectApiUpdatePayload(current, this.editDraft);
      if (!hasApiUpdateFields(apiPatch)) {
        this.showEditModal.set(false);
        return;
      }
      this.savingEdit.set(true);
      this.saveEditError.set(null);
      const apiProjectKey = current.projectNumber || this.projectId;
      void this.projectApi.updateProject(apiProjectKey, apiPatch).then((updated) => {
        this.savingEdit.set(false);
        this.showEditModal.set(false);
        if (isCertifiedPayrollProject(updated)) {
          void this.certifiedPayroll.ensureComplianceForProject(updated);
        }
      }).catch((err: unknown) => {
        this.savingEdit.set(false);
        const message = err instanceof Error ? err.message : 'Failed to save project to Cloud SQL.';
        this.saveEditError.set(message);
      });
      return;
    }

    this.savingEdit.set(true);
    this.saveEditError.set(null);
    this.dataService.updateProject(this.projectId, firestorePatch).subscribe({
      next: (updated) => {
        this.savingEdit.set(false);
        this.showEditModal.set(false);
        if (updated && isCertifiedPayrollProject(updated)) {
          void this.certifiedPayroll.ensureComplianceForProject(updated);
        }
      },
      error: () => {
        this.savingEdit.set(false);
        this.saveEditError.set('Failed to save project changes to Firestore.');
      },
    });
  }

  saveDriveIdFromUtility(folderIdRaw: string): void {
    if (!this.projectId) return;
    const folderId = parseDriveFolderId(folderIdRaw);
    const driveFolderUrl = this.driveService.folderUrl(folderId);
    this.dataService.updateProject(this.projectId, { driveFolderId: folderId, driveFolderUrl }).subscribe(async () => {
      const p = this.project();
      if (p) {
        await this.folderDiscovery.initializeFolderLinks(this.projectId!, folderId);
        const token = await this.authService.getAccessToken();
        if (token) {
          await this.folderDiscovery.discoverProjectFolders({ ...p, driveFolderId: folderId, driveFolderUrl });
        }
      }
    });
  }

  saveSheetIdFromUtility(sheetId: string): void {
    if (!this.projectId) return;
    this.dataService.updateProject(this.projectId, {
      googleSheetId: sheetId,
      googleSheetUrl: sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : undefined,
    }).subscribe();
  }

  async loadDriveFiles(): Promise<void> {
    const p = this.project();
    if (!p?.driveFolderId || this.loadingFiles()) return;
    try {
      this.loadingFiles.set(true);
      this.driveError.set(null);
      this.driveFiles.set(await this.driveService.listFiles(p.driveFolderId));
    } catch (e: unknown) {
      this.driveError.set(e instanceof Error ? e.message : 'Error loading files');
    } finally {
      this.loadingFiles.set(false);
    }
  }
}
