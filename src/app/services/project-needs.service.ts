import { Injectable, inject } from '@angular/core';
import { Project } from '../models/types';
import { DataService } from './data.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { ProjectRequirementsService } from './project-requirements.service';
import { ForemanBonusService } from './foreman-bonus.service';
import { ImportDataService } from './import-data.service';
import { QuickBooksSyncDataService } from './quickbooks-sync-data.service';
import { ProjectFinancialService } from './project-financial.service';
import { isActive2026ControlJob } from '../config/active-2026-jobs.config';
import { isApprovedUnbilledCo } from '../utils/change-management';
import { isCertifiedPayrollProject } from '../utils/certified-payroll-week';
import { computeProjectEnabledModules } from '../utils/project-needs.compute';
import { ProjectEnabledModules, ProjectNeedsInput } from '../models/project-needs.types';
import { effectiveProfile } from '../utils/project-requirements.compute';
import { CertifiedPayrollDataService } from './certified-payroll-data.service';
import { buildActive2026ControlRow } from '../utils/active-2026-control.compute';
import type { Active2026ControlBuildInput } from '../utils/active-2026-control.compute';

@Injectable({ providedIn: 'root' })
export class ProjectNeedsService {
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private requirements = inject(ProjectRequirementsService);
  private foremanBonus = inject(ForemanBonusService);
  private importData = inject(ImportDataService);
  private qbSync = inject(QuickBooksSyncDataService);
  private financialSvc = inject(ProjectFinancialService);
  private cprData = inject(CertifiedPayrollDataService);

  enabledModules(project: Project, showAllTools = false): ProjectEnabledModules {
    return computeProjectEnabledModules(this.buildInput(project, showAllTools));
  }

  nextAction(project: Project) {
    const lifecycle = this.lifecycle.forProject(project);
    const financial = this.financialSvc.computeForProject(project);
    const wipRecords = this.financialSvc.computeWipRecords();
    const wip = wipRecords.find(w => w.projectId === project.id);
    const ctx: Active2026ControlBuildInput = {
      projects: [project],
      financialByProjectId: new Map([[project.id, financial]]),
      lifecycleByProjectId: new Map([[project.id, lifecycle]]),
      wipByProjectId: new Map(wip ? [[project.id, wip]] : []),
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
    };
    const row = buildActive2026ControlRow(project, ctx);
    return row?.nextAction ?? { label: 'Review project', route: `/projects/${project.id}` };
  }

  private buildInput(project: Project, showAllTools: boolean): ProjectNeedsInput {
    const pid = project.id;
    const reqCtx = this.requirements.buildContext(project);
    const profile = effectiveProfile(reqCtx);
    const lifecycle = this.lifecycle.forProject(project);
    const financial = this.financialSvc.computeForProject(project);
    const flags = this.importData.flagsForJob(project.projectNumber);
    const bonusEligible = this.foremanBonus.assignments().some(a => a.projectId === pid && a.bonusEligible);
    const hasForeman = this.foremanBonus.assignments().some(a => a.projectId === pid);

    const cos = this.data.changeOrdersSnapshot().filter(c => c.projectId === pid);
    const subs = this.data.projectSubcontractorsSnapshot().filter(p => p.projectId === pid);

    const logs = this.data.dailyLogsSnapshot().filter(l => l.projectId === pid);
    const issues = this.data.fieldIssuesSnapshot().filter(f => f.projectId === pid);

    return {
      projectId: pid,
      jobNumber: project.projectNumber,
      projectProfile: profile,
      lifecycleGroup: lifecycle.projectLifecycleGroup,
      isActive2026: isActive2026ControlJob(project.projectNumber),
      prevailingWage: !!project.prevailingWage,
      certifiedPayrollRequired: isCertifiedPayrollProject(project),
      bonusEligible,
      hasForemanAssignment: hasForeman,
      hasLaborBudget: !!(project.estLaborCost || flags?.laborBudgetImported),
      hasDriveFolder: !!(project.driveFolderId || project.driveFolderUrl),
      hasRFIs: this.data.rfisSnapshot().some(r => r.projectId === pid),
      hasSubmittals: this.data.submittalsSnapshot().some(s => s.projectId === pid),
      hasDailyLogs: logs.length > 0,
      hasFieldIssues: issues.length > 0,
      hasOpenTasks: this.data.projectTasksSnapshot().some(t => t.projectId === pid && t.status !== 'Complete'),
      hasCPRRecords: this.cprData.getWeeksSnapshot().some(w => w.projectId === pid),
      hasSubs: subs.length > 0,
      hasPOs: this.data.posSnapshot().some(p => p.projectId === pid),
      hasSubcontractorCosts: financial.subcontractorCostToDate > 0 || subs.some(s => (s.invoicedToDate ?? 0) > 0),
      hasSubInvoices: this.data.subcontractorInvoicesSnapshot().some(i => i.projectId === pid),
      hasAR: financial.arBalance > 0,
      hasBilling: financial.billedToDate > 0 || this.data.billingsSnapshot().some(b => b.projectId === pid),
      hasQuickBooksDetailCosts: this.qbSync.hasDetailCostsForProject(pid),
      hasApprovedCoNotBilled: cos.some(isApprovedUnbilledCo),
      hasBonusRecords: this.foremanBonus.records().some(r => r.projectId === pid),
      requiresRfis: profile === 'FullProject' || profile === 'Subcontracted',
      requiresSubmittals: profile === 'FullProject' || profile === 'Subcontracted' || profile === 'SmallInstall',
      requiresDailyLogs: profile === 'TMWorkOrder' || profile === 'FullProject' || profile === 'Subcontracted',
      hasMaterialScope: (project.estMaterialCost ?? 0) > 0,
      hasSafetyRecords: issues.some(i => i.issueType === 'Safety') || logs.some(l => !!l.safetyIssues?.trim()),
      hasInspectionRecords: logs.some(l => !!l.inspections?.trim()),
      isCloseoutOrClosed: ['Closeout', 'Closed2026', 'Archive'].includes(lifecycle.projectLifecycleGroup),
      showAllTools,
    };
  }
}
