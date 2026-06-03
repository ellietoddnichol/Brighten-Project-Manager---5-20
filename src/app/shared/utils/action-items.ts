import { ARRecord } from '@app/models/financial.types';
import { CertifiedPayrollException } from '@app/models/certified-payroll.types';
import { ProjectSubcontractor, Subcontractor, SubcontractorDocument, SubcontractorInvoice } from '@app/models/subcontractor.types';
import { ChangeRequest, DailyLog, Submittal } from '@app/models/project-controls.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { ForemanBonusRecord, ProjectForemanAssignment } from '@app/models/foreman-bonus.types';
import { LaborCodeMapping } from '@app/models/labor-code-mapping.types';
import { NormalizedLaborEntry } from '@app/models/labor.types';
import { Project, ChangeOrder, Billing, PO, ProjectFile, RequiredDocument, ProjectIssue, ProjectTask, ScheduleMilestone, ProjectBudgetLine, ProjectFolder } from '@app/models/types';
import { ProjectException, getProjectExceptions, getProjectFinancialSummary } from '@shared/utils/financial';
import { getScheduleExceptions } from '@shared/utils/field';
import { isClosedProject, isOverheadJob } from '@shared/utils/project';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';
import {
  complianceTasksForProjectSub,
  isCoiExpiringSoon,
  isDocumentExpired,
} from '@features/subcontractors/utils/subcontractor-compliance.compute';
import { invoiceTaskDescriptors, coIsApprovedForInvoice } from '@features/subcontractors/utils/subcontractor-invoice.compute';
import { bonusTaskDescriptors, detectForemanBonusFlags } from '@features/labor/utils/foreman-bonus.compute';
import { setupGapActionItems } from '@features/projects/utils/setup-gap-items';
import { ProjectRequirementsContext } from '@features/projects/utils/project-requirements.compute';
import { computeBudgetRollup, derivePoStatus } from '@features/projects/utils/budget-line.compute';
import { isApprovedCo, normalizeCoStatus, coNumber } from '@features/projects/utils/change-management';
import { detectLaborCodeHealthFlags } from '@features/labor/utils/labor-code-mapping.compute';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

export interface ActionItem {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  type: string;
  severity: 'warning' | 'error';
}

export interface ActionItemContext {
  projects: Project[];
  changeOrders: ChangeOrder[];
  billings: Billing[];
  pos: PO[];
  budgetLines: ProjectBudgetLine[];
  arRecords: ARRecord[];
  laborActuals?: ProjectLaborActual[];
  cprExceptions?: CertifiedPayrollException[];
  subcontractors?: Subcontractor[];
  projectSubcontractors?: ProjectSubcontractor[];
  subcontractorDocuments?: SubcontractorDocument[];
  subcontractorInvoices?: SubcontractorInvoice[];
  foremanBonusRecords?: ForemanBonusRecord[];
  projectForemanAssignments?: ProjectForemanAssignment[];
  projectFolders?: ProjectFolder[];
  changeRequests?: ChangeRequest[];
  submittals?: Submittal[];
  dailyLogs?: DailyLog[];
  files: ProjectFile[];
  requiredDocuments: RequiredDocument[];
  issues: ProjectIssue[];
  tasks: ProjectTask[];
  milestones: ScheduleMilestone[];
  normalizedLaborEntries?: NormalizedLaborEntry[];
  laborCodeMappings?: LaborCodeMapping[];
  lifecycleByProjectId?: Map<string, ProjectLifecycleSnapshot>;
}

function isFieldActive(project: Project): boolean {
  return project.status === 'Active' || project.status === 'Closeout';
}

function isSetupEligible(project: Project): boolean {
  return project.status === 'Active' || project.status === 'Closeout' || project.status === 'Awarded' || project.status === 'Setup Needed';
}

function isIntegrationEligible(project: Project): boolean {
  return project.status === 'Active' || project.status === 'Closeout' || project.status === 'Awarded';
}

function projectInfoExceptions(project: Project): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const items: ActionItem[] = [];

  if (isSetupEligible(project) && !project.address?.trim()) {
    items.push({
      id: `addr-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Address',
      description: 'Site address is not on file.',
      type: 'Project Info',
      severity: 'warning',
    });
  }

  if (isFieldActive(project) && !project.originalContractAmount && !project.contractPending) {
    items.push({
      id: `contract-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'No Contract Amount',
      description: 'Active project is missing a contract amount.',
      type: 'Billing',
      severity: 'error',
    });
  }

  if (project.wipStatus === 'Needs Review' && !isClosedProject(project)) {
    items.push({
      id: `wip-review-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'WIP Needs Review',
      description: 'Job is flagged for WIP review.',
      type: 'WIP',
      severity: 'warning',
    });
  }

  return items;
}

function budgetPoHealthItems(
  project: Project,
  pos: PO[],
  budgetLines: ProjectBudgetLine[],
  changeOrders: ChangeOrder[],
  laborActuals: ProjectLaborActual[] = [],
  subcontractorInvoices: SubcontractorInvoice[] = [],
): ActionItem[] {
  if (isOverheadJob(project) || project.status === 'Closed') return [];

  const items: ActionItem[] = [];
  const rollup = computeBudgetRollup(project, budgetLines, pos, [], laborActuals, subcontractorInvoices);
  const projectPos = pos.filter(p => p.projectId === project.id);

  if (rollup.budgetIsEstimated && isFieldActive(project)) {
    items.push({
      id: `budget-est-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Budget',
      description: 'Budget is estimated — add budget lines for accurate tracking.',
      type: 'Budget',
      severity: 'warning',
    });
  }

  if (!rollup.budgetIsEstimated && rollup.budgetAmount > 0 && rollup.estimatedFinalCost > rollup.budgetAmount) {
    items.push({
      id: `budget-over-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Budget Overrun',
      description: 'Projected cost exceeds budget.',
      type: 'Budget',
      severity: 'error',
    });
  }

  for (const po of projectPos) {
    const status = derivePoStatus(po);
    if (status === 'Void' || status === 'Draft') continue;

    if (!po.linkedBudgetLineId && !po.category) {
      items.push({
        id: `po-unlinked-${po.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Unlinked PO',
        description: `PO ${po.poNumber} has no budget category.`,
        type: 'Cost',
        severity: 'warning',
      });
    }

    if (po.linkedChangeOrderId) {
      const co = changeOrders.find(c => c.id === po.linkedChangeOrderId);
      if (co) {
        const s = normalizeCoStatus(co.status);
        if (!isApprovedCo(co) && s !== 'Billed') {
          items.push({
            id: `po-co-warn-${po.id}`,
            projectId: project.id,
            projectName: project.projectName,
            title: 'PO Tied to Unapproved CO',
            description: `PO ${po.poNumber} linked to ${coNumber(co)}.`,
            type: 'Cost',
            severity: 'warning',
          });
        }
      }
    }
  }

  return items;
}

function wipArHealthItems(
  _project: Project,
  _arRecords: ARRecord[],
  _changeOrders: ChangeOrder[],
  _billings: Billing[],
  _budgetLines: ProjectBudgetLine[],
  _pos: PO[],
  _laborActuals: ProjectLaborActual[] = [],
): ActionItem[] {
  return [];
}

function laborActualHealthItems(
  project: Project,
  laborActuals: ProjectLaborActual[],
): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const items: ActionItem[] = [];
  const projectActuals = laborActuals.filter(a => a.projectId === project.id && a.approvalStatus === 'Approved');

  const missingClassification = projectActuals.filter(a => !a.classification?.trim());
  if (missingClassification.length) {
    items.push({
      id: `labor-no-class-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Labor Missing Classification',
      description: `${missingClassification.length} approved time row(s) lack classification.`,
      type: 'Labor',
      severity: 'warning',
    });
  }

  const missingRate = projectActuals.filter(a => !a.baseRate && !a.totalLaborCost);
  if (missingRate.length) {
    items.push({
      id: `labor-no-rate-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Labor Missing Rate',
      description: `${missingRate.length} approved time row(s) lack wage rate mapping.`,
      type: 'Labor',
      severity: 'warning',
    });
  }

  return items;
}

function cprHealthItems(
  project: Project,
  cprExceptions: CertifiedPayrollException[],
): ActionItem[] {
  if (isOverheadJob(project) || !isCertifiedPayrollProject(project)) return [];

  const items: ActionItem[] = [];
  const open = cprExceptions.filter(e => e.projectId === project.id && !e.resolved);

  if (open.length) {
    items.push({
      id: `cpr-exceptions-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Certified Payroll Exceptions',
      description: `${open.length} open CPR exception(s) need review.`,
      type: 'Certified Payroll',
      severity: open.some(e => e.severity === 'error') ? 'error' : 'warning',
    });
  }

  if (false && isCertifiedPayrollProject(project) && !project.wageOrderNumber) {
    items.push({
      id: `cpr-wage-order-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing Wage Order',
      description: 'Prevailing wage project is missing wage order / AWO.',
      type: 'Certified Payroll',
      severity: 'error',
    });
  }

  if (isCertifiedPayrollProject(project) && !project.county) {
    items.push({
      id: `cpr-county-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Missing County',
      description: 'Certified payroll project is missing county.',
      type: 'Certified Payroll',
      severity: 'warning',
    });
  }

  if (
    isCertifiedPayrollProject(project)
    && (project.status === 'Closeout' || project.status === 'Closed')
    && project.certifiedPayrollStatus !== 'Complete'
  ) {
    items.push({
      id: `cpr-final-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Final Certified Payroll Needed',
      description: 'Project closeout requires final CPR submission.',
      type: 'Certified Payroll',
      severity: 'error',
    });
  }

  return items;
}

function subcontractorHealthItems(
  project: Project,
  projectSubs: ProjectSubcontractor[],
  subcontractors: Subcontractor[],
  documents: SubcontractorDocument[],
): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const items: ActionItem[] = [];
  const projectActive = project.status === 'Active' || project.status === 'Closeout';

  for (const ps of projectSubs.filter(p => p.projectId === project.id)) {
    const master = subcontractors.find(s => s.id === ps.subcontractorId);
    if (!master) continue;

    const taskDescs = complianceTasksForProjectSub(master, ps, documents, projectActive);
    for (const desc of taskDescs) {
      items.push({
        id: desc.triggerKey,
        projectId: project.id,
        projectName: project.projectName,
        title: desc.title,
        description: desc.title,
        type: 'Subcontractors',
        severity: desc.severity,
      });
    }

    if (ps.complianceStatus !== 'Complete' && ps.status === 'ApprovedToStart') {
      items.push({
        id: `sub-compliance-${ps.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Subcontractor Compliance Incomplete',
        description: `${ps.subcontractorName} is Approved to Start with ${ps.complianceStatus} compliance.`,
        type: 'Subcontractors',
        severity: 'warning',
      });
    }

    if (master.coiExpirationDate && isCoiExpiringSoon(master.coiExpirationDate) && !isDocumentExpired(master.coiExpirationDate)) {
      items.push({
        id: `sub-coi-soon-${ps.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Subcontractor COI Expiring Soon',
        description: `${master.companyName} COI expires ${master.coiExpirationDate}.`,
        type: 'Subcontractors',
        severity: 'warning',
      });
    }
  }

  return items;
}

function subcontractorInvoiceHealthItems(
  project: Project,
  projectSubs: ProjectSubcontractor[],
  pos: PO[],
  changeOrders: ChangeOrder[],
  invoices: SubcontractorInvoice[],
): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const items: ActionItem[] = [];
  const projectInvoices = invoices.filter(i => i.projectId === project.id);
  const projectSubMap = new Map(projectSubs.filter(p => p.projectId === project.id).map(p => [p.id, p]));

  for (const inv of projectInvoices) {
    const ps = projectSubMap.get(inv.projectSubcontractorId);
    const po = inv.linkedPurchaseOrderId ? pos.find(p => p.id === inv.linkedPurchaseOrderId) : undefined;
    const coApproved = coIsApprovedForInvoice(inv.linkedChangeOrderId, changeOrders);

    for (const desc of invoiceTaskDescriptors(inv, ps, po, coApproved, projectInvoices)) {
      items.push({
        id: desc.triggerKey,
        projectId: project.id,
        projectName: project.projectName,
        title: desc.title,
        description: desc.title,
        type: 'Subcontractor AP',
        severity: desc.severity,
      });
    }
  }

  const totalOpenAp = projectSubs
    .filter(p => p.projectId === project.id)
    .reduce((sum, ps) => sum + (ps.openBalance ?? 0), 0);

  if (totalOpenAp >= 25000 && isFieldActive(project)) {
    items.push({
      id: `sub-ap-open-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'High Subcontractor AP Open Balance',
      description: `Subcontractor open AP balance is ${totalOpenAp.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`,
      type: 'Subcontractor AP',
      severity: 'warning',
    });
  }

  return items;
}

const DEFAULT_FOREMAN_BONUS_POLICY = {
  id: 'default',
  name: 'Brighten Foreman Labor Savings Bonus',
  defaultBonusRate: 0.10,
  laborCostBasis: 'WagesPlusFringe' as const,
  releaseBasis: 'BilledPercent' as const,
  defaultPayoutTiming: 'Quarterly' as const,
  allowSplits: true,
  allowNegativePayThisTerm: false,
  active: true,
};

function foremanBonusHealthItems(
  project: Project,
  records: ForemanBonusRecord[],
  assignments: ProjectForemanAssignment[],
): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const items: ActionItem[] = [];
  const projectRecords = records.filter(r => r.projectId === project.id);
  const projectAssignments = assignments.filter(a => a.projectId === project.id && a.bonusEligible);

  if (false && !projectAssignments.length && isFieldActive(project)) {
    items.push({
      id: `foreman-bonus-assign-${project.id}`,
      projectId: project.id,
      projectName: project.projectName,
      title: 'Assign foreman for labor bonus',
      description: 'No foreman assignment exists for labor bonus tracking.',
      type: 'Foreman Bonus',
      severity: 'warning',
    });
  }

  for (const record of projectRecords) {
    const flags = detectForemanBonusFlags(record, projectAssignments, DEFAULT_FOREMAN_BONUS_POLICY);
    for (const desc of bonusTaskDescriptors(record, flags)) {
      items.push({
        id: desc.triggerKey,
        projectId: project.id,
        projectName: project.projectName,
        title: desc.title,
        description: desc.title,
        type: 'Foreman Bonus',
        severity: desc.severity,
      });
    }
  }

  return items;
}

function laborCodeHealthItems(
  project: Project,
  entries: NormalizedLaborEntry[],
  actuals: ProjectLaborActual[],
  mappings: LaborCodeMapping[],
  bonusRecords: ForemanBonusRecord[],
): ActionItem[] {
  const hasBonus = bonusRecords.some(r => r.projectId === project.id);
  return detectLaborCodeHealthFlags({
    entries: entries.filter(e => e.projectId === project.id),
    actuals: actuals.filter(a => a.projectId === project.id),
    mappings,
    projects: [project],
    bonusProjectIds: hasBonus ? [project.id] : [],
  })
    .filter(flag => flag.projectId === project.id || !flag.projectId)
    .map(flag => ({
      id: `${project.id}-${flag.id}`,
      projectId: flag.projectId ?? project.id,
      projectName: flag.projectName ?? project.projectName,
      title: flag.title,
      description: flag.description,
      type: 'Labor Code',
      severity: flag.severity,
    }));
}

function globalLaborCodeHealthItems(
  entries: NormalizedLaborEntry[],
  mappings: LaborCodeMapping[],
): ActionItem[] {
  return detectLaborCodeHealthFlags({ entries, mappings })
    .filter(flag => !flag.projectId)
    .map(flag => ({
      id: flag.id,
      projectId: 'workspace',
      projectName: 'Workspace',
      title: flag.title,
      description: flag.description,
      type: 'Labor Code',
      severity: flag.severity,
    }));
}

function driveFolderHealthItems(
  project: Project,
  _ctx: ProjectRequirementsContext,
  lifecycle?: ProjectLifecycleSnapshot,
): ActionItem[] {
  if (!lifecycle?.seedGaps?.length) return [];
  return setupGapActionItems(project, lifecycle.seedGaps);
}

function poExceptions(pos: PO[], projectMap: Map<string, Project>): ActionItem[] {
  const items: ActionItem[] = [];
  pos.forEach(po => {
    const proj = projectMap.get(po.projectId);
    if (!proj || proj.status === 'Closed') return;
    if (po.invoiceExceedsPo) {
      items.push({
        id: `po-inv-${po.id}`,
        projectId: po.projectId,
        projectName: proj.projectName,
        title: 'Invoice Exceeds PO',
        description: `PO ${po.poNumber} (${po.vendor}) has an invoice over the PO amount.`,
        type: 'Cost',
        severity: 'error',
      });
    }
    if (po.missingPo) {
      items.push({
        id: `po-miss-${po.id}`,
        projectId: po.projectId,
        projectName: proj.projectName,
        title: 'Missing PO',
        description: `Quote or invoice for ${po.vendor} has no matching PO.`,
        type: 'Cost',
        severity: 'warning',
      });
    }
  });
  return items;
}

/** Operational action items only — excludes informational schedule alerts. */
export function getScheduleActionItems(project: Project, milestones: ScheduleMilestone[]): ActionItem[] {
  if (isOverheadJob(project) || !isFieldActive(project)) return [];

  return getScheduleExceptions(project, milestones)
    .filter(ex => ex.title !== 'Milestone Upcoming')
    .map(ex => ({
      id: ex.id,
      projectId: ex.projectId,
      projectName: ex.projectName || project.projectName,
      title: ex.title,
      description: ex.description,
      type: ex.type,
      severity: ex.severity as 'warning' | 'error',
    }));
}

function filterFinancialExceptions(exceptions: ProjectException[], project: Project): ActionItem[] {
  return exceptions
    .filter(ex => {
      if (project.status === 'Closed' && (ex.type === 'Setup' || ex.title === 'No Upcoming Milestone')) {
        return false;
      }
      if (!isIntegrationEligible(project) && ex.type === 'Setup') {
        return false;
      }
      return true;
    })
    .map(ex => ({
      id: ex.id,
      projectId: ex.projectId,
      projectName: ex.projectName || project.projectName,
      title: ex.title,
      description: ex.description,
      type: ex.type,
      severity: ex.severity,
    }));
}

export function collectProjectActionItems(
  project: Project,
  ctx: {
    changeOrders: ChangeOrder[];
    billings: Billing[];
    pos?: PO[];
    budgetLines?: ProjectBudgetLine[];
    arRecords?: ARRecord[];
    laborActuals?: ProjectLaborActual[];
    cprExceptions?: CertifiedPayrollException[];
    subcontractors?: Subcontractor[];
    projectSubcontractors?: ProjectSubcontractor[];
    subcontractorDocuments?: SubcontractorDocument[];
    subcontractorInvoices?: SubcontractorInvoice[];
    foremanBonusRecords?: ForemanBonusRecord[];
    projectForemanAssignments?: ProjectForemanAssignment[];
    projectFolders?: ProjectFolder[];
    changeRequests?: ChangeRequest[];
    submittals?: Submittal[];
    dailyLogs?: DailyLog[];
    files: ProjectFile[];
    requiredDocuments: RequiredDocument[];
    issues: ProjectIssue[];
    tasks: ProjectTask[];
    milestones: ScheduleMilestone[];
    normalizedLaborEntries?: NormalizedLaborEntry[];
    laborCodeMappings?: LaborCodeMapping[];
    lifecycleByProjectId?: Map<string, ProjectLifecycleSnapshot>;
  },
): ActionItem[] {
  if (isOverheadJob(project)) return [];

  const pCOs = ctx.changeOrders.filter(c => c.projectId === project.id);
  const pBills = ctx.billings.filter(b => b.projectId === project.id);
  const pFiles = ctx.files.filter(f => f.projectId === project.id);
  const pReqs = ctx.requiredDocuments.filter(r => r.projectId === project.id);
  const pIssues = ctx.issues.filter(i => i.projectId === project.id);
  const pTasks = ctx.tasks.filter(t => t.projectId === project.id && isManualProjectTask(t));
  const pMilestones = ctx.milestones.filter(m => m.projectId === project.id);
  const pPos = (ctx.pos ?? []).filter(p => p.projectId === project.id);
  const pBudgetLines = (ctx.budgetLines ?? []).filter(l => l.projectId === project.id);
  const pInvoices = (ctx.subcontractorInvoices ?? []).filter(i => i.projectId === project.id);
  const pFolders = (ctx.projectFolders ?? []).filter(f => f.projectId === project.id);

  const requirementsCtx: ProjectRequirementsContext = {
    project,
    folders: pFolders,
    changeOrders: pCOs,
    changeRequests: (ctx.changeRequests ?? []).filter(c => c.projectId === project.id),
    billings: pBills,
    arRecords: (ctx.arRecords ?? []).filter(r => r.projectId === project.id),
    projectSubcontractors: (ctx.projectSubcontractors ?? []).filter(p => p.projectId === project.id),
    subcontractorInvoices: pInvoices,
    pos: pPos,
    submittals: (ctx.submittals ?? []).filter(s => s.projectId === project.id),
    dailyLogs: (ctx.dailyLogs ?? []).filter(d => d.projectId === project.id),
    projectFiles: pFiles,
    laborActuals: (ctx.laborActuals ?? []).filter(a => a.projectId === project.id),
  };

  const summary = getProjectFinancialSummary(project, pCOs, pBills);
  const financial = filterFinancialExceptions(
    getProjectExceptions(project, summary, pCOs, pBills, pFiles, pReqs, pIssues, pTasks),
    project,
  );

  return [
    ...financial,
    ...budgetPoHealthItems(project, pPos, pBudgetLines, pCOs, ctx.laborActuals ?? [], pInvoices),
    ...wipArHealthItems(project, ctx.arRecords ?? [], pCOs, pBills, pBudgetLines, pPos, ctx.laborActuals ?? []),
    ...laborActualHealthItems(project, ctx.laborActuals ?? []),
    ...cprHealthItems(project, ctx.cprExceptions ?? []),
    ...subcontractorHealthItems(
      project,
      ctx.projectSubcontractors ?? [],
      ctx.subcontractors ?? [],
      ctx.subcontractorDocuments ?? [],
    ),
    ...subcontractorInvoiceHealthItems(
      project,
      ctx.projectSubcontractors ?? [],
      pPos,
      pCOs,
      pInvoices,
    ),
    ...foremanBonusHealthItems(
      project,
      ctx.foremanBonusRecords ?? [],
      ctx.projectForemanAssignments ?? [],
    ),
    ...laborCodeHealthItems(
      project,
      ctx.normalizedLaborEntries ?? [],
      ctx.laborActuals ?? [],
      ctx.laborCodeMappings ?? [],
      ctx.foremanBonusRecords ?? [],
    ),
    ...driveFolderHealthItems(project, requirementsCtx, ctx.lifecycleByProjectId?.get(project.id)),
    ...getScheduleActionItems(project, pMilestones),
    ...projectInfoExceptions(project),
  ];
}

export function collectAllActionItems(ctx: ActionItemContext): ActionItem[] {
  const projectMap = new Map(ctx.projects.map(p => [p.id, p]));
  const shared = {
    changeOrders: ctx.changeOrders,
    billings: ctx.billings,
    pos: ctx.pos,
    budgetLines: ctx.budgetLines,
    arRecords: ctx.arRecords,
    laborActuals: ctx.laborActuals,
    cprExceptions: ctx.cprExceptions,
    subcontractors: ctx.subcontractors,
    projectSubcontractors: ctx.projectSubcontractors,
    subcontractorDocuments: ctx.subcontractorDocuments,
    subcontractorInvoices: ctx.subcontractorInvoices,
    foremanBonusRecords: ctx.foremanBonusRecords,
    projectForemanAssignments: ctx.projectForemanAssignments,
    projectFolders: ctx.projectFolders,
    changeRequests: ctx.changeRequests,
    submittals: ctx.submittals,
    dailyLogs: ctx.dailyLogs,
    files: ctx.files,
    requiredDocuments: ctx.requiredDocuments,
    issues: ctx.issues,
    tasks: ctx.tasks,
    milestones: ctx.milestones,
    normalizedLaborEntries: ctx.normalizedLaborEntries,
    laborCodeMappings: ctx.laborCodeMappings,
    lifecycleByProjectId: ctx.lifecycleByProjectId,
  };
  const perProject = ctx.projects.flatMap(p => collectProjectActionItems(p, shared));
  const globalLabor = globalLaborCodeHealthItems(ctx.normalizedLaborEntries ?? [], ctx.laborCodeMappings ?? []);
  return [...perProject, ...globalLabor, ...poExceptions(ctx.pos, projectMap)];
}

export function countActionItemsByProject(items: ActionItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  items.forEach(item => {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
  });
  return counts;
}

export function countActionItemsBySeverity(items: ActionItem[]): { errors: number; warnings: number } {
  return items.reduce(
    (acc, item) => {
      if (item.severity === 'error') acc.errors++;
      else acc.warnings++;
      return acc;
    },
    { errors: 0, warnings: 0 },
  );
}
