import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { AuthService } from '../services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, PROJECT_STATUSES } from '../models/types';
import { DriveService, DriveFile, parseDriveFolderId } from '../services/drive.service';
import { DriveFolderDiscoveryService } from '../services/drive-folder-discovery.service';
import { getProjectFinancialSummary } from '../utils/financial';
import { formatProjectDate, isOverheadJob } from '../utils/project';
import {
  isMasterSheetLinkedProject,
  isMasterSheetReadOnlyField,
  stripMasterSheetFieldsFromUserPatch,
} from '../utils/master-sheet-fields';
import { collectProjectActionItems } from '../utils/action-items';
import { CertifiedPayrollService } from '../services/certified-payroll.service';
import { isCertifiedPayrollProject } from '../utils/certified-payroll-week';
import { getNextMilestone, buildProjectActivityFeed } from '../utils/field';
import { BudgetLineService } from '../services/budget-line.service';
import { buildProjectCostDonut, buildBudgetVsActualBars, buildBudgetVsActualFromLines } from '../utils/chart-data';
import { ProjectDataService } from '../services/project-data.service';
import { normalizedProjectToProject } from '../utils/sheet-normalizers';
import { ProjectHeaderComponent } from '../components/project/project-header';
import { ProjectPrimaryNavComponent } from '../components/project/project-primary-nav';
import { ProjectOverviewPanelComponent } from '../components/project/project-overview-panel';
import { ProjectWorkflowsPanelComponent } from '../components/project/project-workflows-panel';
import { ProjectFinancialsPanelComponent } from '../components/project/project-financials-panel';
import { ProjectDocumentsPanelComponent } from '../components/project/project-documents-panel';
import { ProjectUtilityPanelComponent } from '../components/project/project-utility-panel';
import {
  FinancialView,
  NewItemAction,
  ProjectNavState,
  ProjectPrimarySection,
  UtilityView,
  WorkflowChip,
  WorkflowView,
  FileView,
} from '../components/project/project-detail.types';
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
} from '../components/project/project-navigation';
import { ProjectNeedsService } from '../services/project-needs.service';
import { ProjectLifecycleService } from '../services/project-lifecycle.service';
import { workflowChipVisible, computeProjectEnabledModules } from '../utils/project-needs.compute';

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, RouterModule, FormsModule,
    ProjectHeaderComponent, ProjectPrimaryNavComponent,
    ProjectOverviewPanelComponent, ProjectWorkflowsPanelComponent,
    ProjectFinancialsPanelComponent, ProjectDocumentsPanelComponent, ProjectUtilityPanelComponent,
  ],
  template: `
    <div class="h-full flex flex-col bg-slate-50/50">
      @if (project(); as p) {
        <app-project-header
          [project]="p"
          (edit)="openEdit()"
          (newItem)="onNewItem($event)"
          (moreSelect)="openMore($event)" />

        <app-project-primary-nav
          [active]="nav().section"
          (sectionChange)="setSection($event)" />

        @if (project(); as p) {
          <div class="px-6 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-slate-500">
              @if (enabledModules().profile) {
                Profile: <span class="font-semibold text-slate-700">{{ enabledModules().profile }}</span>
              }
            </p>
            <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" [checked]="showAllTools()" (change)="toggleShowAllTools($event)">
              Show all tools
            </label>
          </div>
        }

        <div class="flex-1 overflow-y-auto p-6 lg:p-8">
          @if (nav().utilityView) {
            <app-project-utility-panel
              [project]="p"
              [view]="nav().utilityView!"
              [driveFiles]="driveFiles()"
              [loadingFiles]="loadingFiles()"
              [driveError]="driveError()"
              (close)="closeUtility()"
              (editProject)="openEdit()"
              (saveDrive)="saveDriveIdFromUtility($event)"
              (saveSheet)="saveSheetIdFromUtility($event)"
              (openUtility)="openMore($event)"
              (refreshFiles)="loadDriveFiles()" />
          } @else {
            @switch (nav().section) {
              @case ('overview') {
                <app-project-overview-panel
                  [project]="p"
                  [summary]="financialSummary()!"
                  [actionItems]="projectExceptions()"
                  [activityFeed]="activityFeed()"
                  [latestChangeOrders]="latestChangeOrders()"
                  [visibleWorkflowChips]="visibleWorkflowChips()"
                  [lifecycleGroup]="lifecycleSnapshot()?.projectLifecycleGroup ?? ''"
                  [nextAction]="nextAction()"
                  (navigateWorkflow)="goWorkflow($event)"
                  (navigateFinancial)="goFinancial($event)"
                  (navigateAction)="goActionItem($event)" />
              }
              @case ('workflows') {
                <app-project-workflows-panel
                  [project]="p"
                  [activeView]="nav().workflowView"
                  [modules]="enabledModules()"
                  (viewChange)="goWorkflow($event)" />
              }
              @case ('financials') {
                <app-project-financials-panel
                  [project]="p"
                  [summary]="financialSummary()!"
                  [activeView]="nav().financialView"
                  [modules]="enabledModules()"
                  (viewChange)="goFinancial($event)" />
              }
              @case ('documents') {
                <app-project-documents-panel
                  [project]="p"
                  [activeView]="nav().fileView"
                  [modules]="enabledModules()"
                  (utilitySelect)="openMore($event)"
                  (fileViewChange)="goFileView($event)" />
              }
            }
          }
        </div>
      } @else {
        <div class="flex-1 flex items-center justify-center text-slate-400">Loading project...</div>
      }
    </div>

    @if (showEditModal()) {
      <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
        <div class="bg-white w-full max-w-2xl rounded-xl shadow-xl border border-slate-200 max-h-[90vh] flex flex-col">
          <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
            <h2 class="text-base font-bold text-slate-900">Edit Project</h2>
            <button type="button" (click)="showEditModal.set(false)" class="text-slate-400 hover:text-slate-600"><mat-icon>close</mat-icon></button>
          </div>
          <form (submit)="saveEdit(); $event.preventDefault()" class="p-6 space-y-4 overflow-y-auto">
            @if (masterSheetLinked()) {
              <p class="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Fields synced from the Master Data Sheet are read-only here. PM, contract, status, and other app fields can still be edited.
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
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Contract ($)</label>
                <input type="number" [(ngModel)]="editDraft.originalContractAmount" name="editContract" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Retainage %</label>
                <input type="number" [(ngModel)]="editDraft.retainagePercent" name="editRet" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
              </div>
            </div>
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
export class ProjectDetails {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectData = inject(ProjectDataService);
  private dataService = inject(DataService);
  private authService = inject(AuthService);
  private driveService = inject(DriveService);
  private folderDiscovery = inject(DriveFolderDiscoveryService);
  private certifiedPayroll = inject(CertifiedPayrollService);
  private budgetLineSvc = inject(BudgetLineService);
  private needsSvc = inject(ProjectNeedsService);
  private lifecycleSvc = inject(ProjectLifecycleService);

  projectId = this.route.snapshot.paramMap.get('id');

  projects = toSignal(this.dataService.getProjects(), { initialValue: [] });
  project = computed(() => {
    const firestoreProject = (this.projects() || []).find(
      p => p.id === this.projectId || p.seedProjectId === this.projectId,
    );
    if (firestoreProject) return firestoreProject;
    const sheetProject = this.projectId ? this.projectData.getProjectDetail(this.projectId)?.project : null;
    return sheetProject ? normalizedProjectToProject(sheetProject) : undefined;
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
        status: c.status as import('../models/types').ChangeOrder['status'],
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
        status: i.status as import('../models/types').Billing['status'],
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

  showAllTools = signal(false);

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
  editDraft: Partial<Project> = {};
  projectStatuses = PROJECT_STATUSES;

  masterSheetLinked = computed(() => {
    const p = this.project();
    return p ? isMasterSheetLinkedProject(p) : false;
  });

  driveFiles = signal<DriveFile[]>([]);
  loadingFiles = signal(false);
  driveError = signal<string | null>(null);

  constructor() {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    const section = this.route.snapshot.queryParamMap.get('section');
    const view = this.route.snapshot.queryParamMap.get('view');
    this.nav.set(resolveNavFromQuery(tab, section, view));

    if (this.projectId) {
      try {
        const raw = localStorage.getItem(persistShowAllToolsKey(this.projectId));
        if (raw === 'true') this.showAllTools.set(true);
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
    if (item.section === 'workflows' && item.view) {
      this.goWorkflow(item.view as WorkflowView);
    } else if (item.section === 'financials' && item.view) {
      this.goFinancial(item.view as FinancialView);
    } else if (item.section === 'documents') {
      this.setSection('documents');
    }
  }

  private applyNav(state: ProjectNavState): void {
    this.nav.set(state);
    if (this.projectId) savePersistedNav(this.projectId, state);
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
    this.savingEdit.set(true);
    const patch = stripMasterSheetFieldsFromUserPatch(current, {
      ...this.editDraft,
      taxable: !this.editDraft.taxExempt,
    });
    this.dataService.updateProject(this.projectId, patch).subscribe({
      next: (updated) => {
        this.savingEdit.set(false);
        this.showEditModal.set(false);
        if (updated && isCertifiedPayrollProject(updated)) {
          void this.certifiedPayroll.ensureComplianceForProject(updated);
        }
      },
      error: () => {
        this.savingEdit.set(false);
        alert('Failed to save project changes.');
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
