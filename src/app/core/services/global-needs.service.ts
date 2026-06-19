import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ForemanBonusService } from '@features/labor/services/foreman-bonus.service';
import { ImportDataService } from '@core/services/import-data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { GlobalNeedsInput } from '@app/models/global-enabled-modules.types';
import { computeGlobalEnabledModules } from '@shared/utils/global-enabled-modules.compute';
import {
  loadGlobalShowAllTools,
  loadPinnedTools,
  saveGlobalShowAllTools,
  savePinnedTools,
  togglePinnedTool,
  resetPinnedTools,
} from '@shared/utils/global-pinned-tools';
import { GlobalModuleId } from '@app/models/global-enabled-modules.types';
import {
  buildActive2026ControlRows,
  summarizeActive2026Control,
} from '@features/projects/utils/active-2026-control.compute';
import { countBillingActions } from '@shared/utils/home-hub.compute';
import { isApprovedUnbilledCo, isOpenChangeRequest, normalizeCoStatus } from '@features/projects/utils/change-management';
import { isClosedProject, isOverheadJob } from '@shared/utils/project';
import { isOpenArRecord } from '@features/financials/utils/wip.compute';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

@Injectable({ providedIn: 'root' })
export class GlobalNeedsService {
  private data = inject(DataService);
  private financialSvc = inject(ProjectFinancialService);
  private lifecycleSvc = inject(ProjectLifecycleService);
  private foremanBonus = inject(ForemanBonusService);
  private importData = inject(ImportDataService);
  private importReview = inject(ImportReviewService);
  private cprData = inject(CertifiedPayrollDataService);
  private qbSync = inject(QuickBooksSyncDataService);

  showAllTools = signal(loadGlobalShowAllTools());
  pinnedTools = signal<GlobalModuleId[]>(loadPinnedTools());

  private projects = toSignal(this.data.getProjects(), { initialValue: [] });
  private tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });
  private changeRequests = toSignal(this.data.getChangeRequests(), { initialValue: [] });
  private changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  private rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  private submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  private dailyLogs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  private fieldIssues = toSignal(this.data.getFieldIssues(), { initialValue: [] });
  private arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });
  private reqDocs = toSignal(this.data.getRequiredDocuments(), { initialValue: [] });
  private projectFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  private laborActuals = toSignal(this.data.getProjectLaborActuals(), { initialValue: [] });
  private cprWeeks = toSignal(this.cprData.getWeeks(), { initialValue: [] });

  active2026Rows = computed(() =>
    buildActive2026ControlRows({
      projects: this.projects() ?? [],
      financialByProjectId: new Map((this.projects() ?? []).map(p => [p.id, this.financialSvc.computeForProject(p)])),
      lifecycleByProjectId: this.lifecycleSvc.snapshotMap(),
      wipByProjectId: new Map(this.financialSvc.computeWipRecords().map(w => [w.projectId, w])),
      changeOrders: this.data.changeOrdersSnapshot(),
      arRecords: this.data.arRecordsSnapshot(),
      laborActuals: this.data.projectLaborActualsSnapshot(),
      budgetLines: this.data.budgetLinesSnapshot(),
      projectSubcontractors: this.data.projectSubcontractorsSnapshot(),
      subcontractors: this.data.subcontractorsSnapshot(),
      subDocuments: this.data.subcontractorDocumentsSnapshot(),
      foremanAssignments: this.foremanBonus.assignments(),
      foremanRecords: this.foremanBonus.records(),
      laborBudgetImported: job => !!this.importData.flagsForJob(job)?.laborBudgetImported,
    }),
  );

  active2026Summary = computed(() => summarizeActive2026Control(this.active2026Rows()));

  needsInput = computed((): GlobalNeedsInput => {
    const today = new Date().toISOString().slice(0, 10);
    const activeProjects = (this.projects() ?? []).filter(p => !isOverheadJob(p) && !isClosedProject(p));
    const activeIds = new Set(activeProjects.map(p => p.id));

    const controlRows = this.active2026Rows();
    const summary = this.active2026Summary();

    const openTasks = (this.tasks() ?? []).filter(t =>
      activeIds.has(t.projectId)
      && isManualProjectTask(t)
      && t.status !== 'Complete'
      && t.status !== 'Canceled',
    );
    const overdueTasks = openTasks.filter(t => !!t.dueDate && t.dueDate < today);

    const openCrs = (this.changeRequests() ?? []).filter(cr => activeIds.has(cr.projectId) && isOpenChangeRequest(cr));
    const openCos = (this.changeOrders() ?? []).filter(co =>
      activeIds.has(co.projectId) && !['Rejected', 'Void', 'Billed'].includes(normalizeCoStatus(co.status)),
    );
    const changesNeedingAction =
      openCrs.filter(cr => cr.status === 'Submitted' || cr.status === 'Pricing' || cr.status === 'Needs Backup').length
      + openCos.filter(co => normalizeCoStatus(co.status) === 'Sent').length
      + openCos.filter(isApprovedUnbilledCo).length;

    const openRfis = (this.rfis() ?? []).filter(r => activeIds.has(r.projectId) && r.status !== 'Closed' && r.status !== 'Void');
    const overdueRfis = openRfis.filter(r => {
      const due = r.dueDate ?? r.neededByDate;
      return !!due && due.slice(0, 10) < today;
    });

    const closedSubmittalStatuses = new Set(['Approved', 'Approved as Noted', 'Closed', 'Rejected', 'Void']);
    const openSubmittals = (this.submittals() ?? []).filter(s => activeIds.has(s.projectId) && !closedSubmittalStatuses.has(s.status));
    const overdueSubmittals = openSubmittals.filter(s => {
      const due = s.dueDate ?? s.requiredDate;
      return !!due && due.slice(0, 10) < today;
    });

    const logs = (this.dailyLogs() ?? []).filter(l => activeIds.has(l.projectId));
    const issues = (this.fieldIssues() ?? []).filter(f => activeIds.has(f.projectId) && f.status !== 'Closed');

    const cprWeeks = (this.cprWeeks() ?? []).filter(w => activeIds.has(w.projectId));
    const cprExceptions = cprWeeks.reduce((n, w) => n + (w.exceptionCount ?? 0), 0);

    const cprRequiredJobs = activeProjects.filter(p => !!p.certifiedPayrollRequired || !!p.prevailingWage).length;
    const prevailingWageJobs = activeProjects.filter(p => !!p.prevailingWage).length;

    const safetyCount =
      issues.filter(i => i.issueType === 'Safety').length
      + logs.filter(l => !!l.safetyIssues?.trim()).length;
    const inspectionCount = logs.filter(l => !!l.inspections?.trim()).length;

    const wipNeedsReview = activeProjects.filter(p => p.wipStatus === 'Needs Review').length;

    const subComplianceGap = controlRows.reduce((n, r) => n + r.missingW9Count + r.missingCoiCount, 0);

    const bonusRecords = this.foremanBonus.records().filter(r => activeIds.has(r.projectId));
    const bonusReview = bonusRecords.filter(r => r.status === 'NeedsReview' || r.status === 'MissingData').length;
    const bonusEligible = this.foremanBonus.assignments().some(a => activeIds.has(a.projectId) && a.bonusEligible);

    const arPastDue = (this.arRecords() ?? []).filter(r =>
      activeIds.has(r.projectId)
      && isOpenArRecord(r.status)
      && r.dueDate
      && r.dueDate.slice(0, 10) < today,
    );
    const arPastDueProjects = new Set(arPastDue.map(r => r.projectId)).size;

    const missingRequired = (this.reqDocs() ?? []).filter(d =>
      activeIds.has(d.projectId) && (d.status === 'Missing' || d.status === 'Required'),
    ).length;

    const hasGeneratedDocs = (this.projectFiles() ?? []).some(f =>
      activeIds.has(f.projectId) && (!!f.generatedDocumentId || f.sourceType === 'generated'),
    );

    const hasCloseout = (this.projects() ?? []).some(p => p.status === 'Closeout');

    const hasSubsOrPos =
      this.data.projectSubcontractorsSnapshot().length > 0
      || this.data.posSnapshot().length > 0;

    const dailyLogsRequired = activeProjects.some(p =>
      p.projectProfile === 'TM'
      || p.projectProfile === 'FullContractGC'
      || p.projectProfile === 'FullProjectSubcontractor',
    );

    const seedIssues = controlRows.filter(r => r.seedCompletenessStatus && r.seedCompletenessStatus !== 'Complete').length;

    return {
      active2026JobCount: summary.activeJobs,
      atRiskJobCount: summary.jobsCriticalRisk,
      openArTotal: summary.openArTotal,
      arPastDueCount: arPastDueProjects,
      openTaskCount: openTasks.length,
      overdueTaskCount: overdueTasks.length,
      openChangeCount: openCrs.length + openCos.length,
      changesNeedingActionCount: changesNeedingAction,
      openRfiCount: openRfis.length,
      overdueRfiCount: overdueRfis.length,
      openSubmittalCount: openSubmittals.length,
      overdueSubmittalCount: overdueSubmittals.length,
      dailyLogCount: logs.length,
      dailyLogsRequiredOnActiveJob: dailyLogsRequired,
      openFieldIssueCount: issues.length,
      cprRequiredJobCount: cprRequiredJobs,
      prevailingWageJobCount: prevailingWageJobs,
      cprRecordCount: cprWeeks.length,
      cprExceptionCount: cprExceptions,
      safetyItemCount: safetyCount,
      inspectionItemCount: inspectionCount,
      wipNeedsReviewCount: wipNeedsReview,
      subComplianceGapCount: subComplianceGap,
      foremanBonusReviewCount: bonusReview,
      hasForemanBonusRecords: bonusRecords.length > 0,
      hasBonusEligibleJobs: bonusEligible,
      importReviewExceptionCount: this.importReview.unresolvedCount(),
      seedCompletenessIssueCount: seedIssues,
      hasQuickBooksDetailCosts: this.qbSync.detailCostTransactions().length > 0,
      hasSubInvoices: this.data.subcontractorInvoicesSnapshot().length > 0,
      hasGeneratedDocs,
      missingRequiredDocCount: missingRequired,
      hasLaborActuals: (this.laborActuals() ?? []).length > 0,
      hasCloseoutJobs: hasCloseout,
      hasSubsOrPos,
      billingActionCount: countBillingActions(controlRows),
      pinnedTools: this.pinnedTools(),
      showAllTools: this.showAllTools(),
    };
  });

  modules = computed(() => computeGlobalEnabledModules(this.needsInput()));

  setShowAllTools(value: boolean): void {
    this.showAllTools.set(value);
    saveGlobalShowAllTools(value);
  }

  togglePin(id: GlobalModuleId): void {
    const next = togglePinnedTool(id, this.pinnedTools());
    this.pinnedTools.set(next);
    savePinnedTools(next);
  }

  setPin(id: GlobalModuleId, pinned: boolean): void {
    const current = this.pinnedTools();
    const next = pinned
      ? current.includes(id) ? current : [...current, id]
      : current.filter(p => p !== id);
    this.pinnedTools.set(next);
    savePinnedTools(next);
  }

  resetPinnedTools(): void {
    const next = resetPinnedTools();
    this.pinnedTools.set(next);
    savePinnedTools(next);
  }

  isPinned(id: GlobalModuleId): boolean {
    return this.pinnedTools().includes(id);
  }

  isModuleVisible(id: GlobalModuleId): boolean {
    return !this.modules().hiddenModules.includes(id);
  }
}
