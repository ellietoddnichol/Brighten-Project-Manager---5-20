import {
  ACTIVE_2026_JOBS,
  BRIGHTEN_PROFIT_TARGET,
  active2026JobMeta,
  isActive2026ControlJob,
  normalizeJobNumber,
} from '../config/active-2026-jobs.config';
import { ARRecord, ProjectFinancial, WIPRecord } from '../models/financial.types';
import {
  Active2026ControlRow,
  Active2026ControlSummary,
  ControlBudgetBasis,
  ControlFilterId,
  ControlNextAction,
  ControlSegmentId,
  ControlSortKey,
  JobHealthStatus,
} from '../models/active-2026-control.types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { ProjectLaborActual } from '../models/labor-actual.types';
import {
  Project,
  ChangeOrder,
  ProjectBudgetLine,
} from '../models/types';
import { effectiveForeman, isForemanSetupMissing } from './project-setup.util';
import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorDocument,
} from '../models/subcontractor.types';
import {
  ForemanBonusRecord,
  ProjectForemanAssignment,
} from '../models/foreman-bonus.types';
import { isApprovedUnbilledCo } from './change-management';
import { isOpenArRecord } from './wip.compute';
import {
  computeProjectSubComplianceStatus,
} from './subcontractor-compliance.compute';
import { laborBudgetFromLines, wagesAndFringeFromActuals } from './foreman-bonus.compute';
import { arPastDueForProject } from './ar.compute';

export interface Active2026ControlBuildInput {
  projects: Project[];
  financialByProjectId: Map<string, ProjectFinancial>;
  lifecycleByProjectId: Map<string, ProjectLifecycleSnapshot>;
  wipByProjectId: Map<string, WIPRecord>;
  changeOrders: ChangeOrder[];
  arRecords: ARRecord[];
  laborActuals: ProjectLaborActual[];
  budgetLines: ProjectBudgetLine[];
  projectSubcontractors: ProjectSubcontractor[];
  subcontractors: Subcontractor[];
  subDocuments: SubcontractorDocument[];
  foremanAssignments: ProjectForemanAssignment[];
  foremanRecords: ForemanBonusRecord[];
  laborBudgetImported?: (jobNumber: string) => boolean;
}

function mapBudgetBasis(financial: ProjectFinancial): ControlBudgetBasis {
  switch (financial.budgetBasis) {
    case 'Imported':
    case 'Workbook':
      return 'Imported';
    case 'Manual':
      return 'Manual';
    case 'EstimatedFrom20PercentTarget':
      return 'EstimatedFrom20PercentTarget';
    default:
      if (financial.budgetIsEstimated && financial.currentContractAmount > 0) {
        return 'EstimatedFrom20PercentTarget';
      }
      if (financial.budgetAmount > 0) return 'Manual';
      return 'Missing';
  }
}

function isMissingContract(financial: ProjectFinancial): boolean {
  return !financial.currentContractAmount
    || financial.budgetBasis === 'MissingContract';
}

function isMissingBudget(financial: ProjectFinancial, budgetBasis: ControlBudgetBasis): boolean {
  return budgetBasis === 'Missing'
    && !financial.budgetIsEstimated
    && financial.budgetAmount <= 0;
}

function subComplianceCounts(
  projectId: string,
  projectSubs: ProjectSubcontractor[],
  subcontractors: Subcontractor[],
  docs: SubcontractorDocument[],
): { missingW9: number; missingCoi: number; lienWaiverNeeded: number; activeCount: number } {
  let missingW9 = 0;
  let missingCoi = 0;
  let lienWaiverNeeded = 0;
  const scoped = projectSubs.filter(ps =>
    ps.projectId === projectId
    && ps.status !== 'Closed',
  );

  for (const ps of scoped) {
    const master = subcontractors.find(s => s.id === ps.subcontractorId);
    if (!master) continue;

    if (master.w9Status === 'Missing' || master.w9Status === 'Expired') missingW9++;
    if (
      master.insuranceStatus === 'Missing'
      || master.insuranceStatus === 'Expired'
      || master.insuranceStatus === 'Review'
    ) missingCoi++;

    const compliance = computeProjectSubComplianceStatus(master, docs, ps.id);
    if (compliance !== 'Complete' && ['ApprovedToStart', 'Active'].includes(ps.status)) {
      if (master.w9Status === 'Missing') missingW9++;
      if (master.insuranceStatus === 'Missing' || master.insuranceStatus === 'Expired') missingCoi++;
    }

    if (ps.invoicedToDate && ps.invoicedToDate > 0) {
      const waiver = docs.some(d =>
        d.projectSubcontractorId === ps.id
        && (d.documentType === 'LienWaiver' || d.documentType === 'FinalLienWaiver')
        && d.status === 'Valid',
      );
      if (!waiver) lienWaiverNeeded++;
    }
  }

  return {
    missingW9,
    missingCoi,
    lienWaiverNeeded,
    activeCount: scoped.length,
  };
}

function deriveBillingStatus(financial: ProjectFinancial, hasApprovedCoNotBilled: boolean): string {
  if (financial.billedToDate > financial.currentContractAmount && financial.currentContractAmount > 0) {
    return 'Overbilled';
  }
  if (hasApprovedCoNotBilled || financial.leftToBill > 5000) return 'Needs billing';
  if (financial.arBalance > 0) return 'Open AR';
  return 'Current';
}

function deriveCprStatus(project: Project): { required: boolean; status: string; missingSetup: boolean } {
  if (!project.prevailingWage) {
    return { required: false, status: 'Not required', missingSetup: false };
  }
  const missingSetup = !project.wageOrderNumber?.trim();
  return {
    required: true,
    status: missingSetup ? 'Setup needed' : 'Configured',
    missingSetup,
  };
}

const COMPLETE_JOB_STATUSES = new Set(['Complete', 'Closed', 'Closeout']);

/** Complete / fully-billed jobs should not surface control warnings. */
export function isFullyBilledCompleteJob(row: Pick<
  Active2026ControlRow,
  'status' | 'lifecycleGroup' | 'billedToDate' | 'currentContract' | 'leftToBill'
>): boolean {
  if (COMPLETE_JOB_STATUSES.has(row.status)) return true;
  if (row.lifecycleGroup === 'Closed2026' || row.lifecycleGroup === 'Archive') return true;
  if (row.currentContract > 0 && row.leftToBill <= 0 && row.billedToDate >= row.currentContract) {
    return true;
  }
  return false;
}

export function deriveNextAction(input: {
  project: Project;
  financial: ProjectFinancial;
  lifecycle: ProjectLifecycleSnapshot;
  missingContract: boolean;
  missingBudget: boolean;
  budgetBasis: ControlBudgetBasis;
  missingLaborBudget: boolean;
  hasApprovedCoNotBilled: boolean;
  arPastDue: number;
  arBalance: number;
  foremanAssigned: boolean;
  bonusEligible: boolean;
  subComplianceGap: boolean;
  cprMissingSetup: boolean;
  driveLinked: boolean;
}): ControlNextAction {
  const pid = input.project.id;
  const openProject = (view: string, extra: Record<string, string> = {}) => ({
    label: '',
    route: `/projects/${pid}`,
    queryParams: { section: 'financials', view, ...extra },
  });

  if (input.missingContract) {
    return { ...openProject('summary'), label: 'Add contract amount' };
  }
  if (input.missingBudget) {
    return { ...openProject('budget'), label: 'Import budget' };
  }
  if (input.budgetBasis === 'EstimatedFrom20PercentTarget') {
    return { ...openProject('budget'), label: 'Confirm budget estimate' };
  }
  if (input.financial.forecastMargin < BRIGHTEN_PROFIT_TARGET * 100 && input.financial.currentContractAmount > 0) {
    return { ...openProject('wip'), label: 'Review margin under 20%' };
  }
  if (input.hasApprovedCoNotBilled) {
    return { ...openProject('billing'), label: 'Bill approved CO' };
  }
  if (input.arPastDue > 0) {
    return { ...openProject('ar'), label: 'Follow up AR (past due)' };
  }
  if (input.arBalance > 0) {
    return { ...openProject('ar'), label: 'Follow up AR' };
  }
  if (input.bonusEligible && !input.foremanAssigned) {
    return { label: 'Assign foreman', route: `/projects/${pid}`, queryParams: { tab: 'budget' } };
  }
  if (input.missingLaborBudget) {
    return { ...openProject('budget'), label: 'Add labor budget' };
  }
  if (input.subComplianceGap) {
    return { ...openProject('pos'), label: 'Review subcontractor compliance' };
  }
  if (!input.driveLinked) {
    return { label: 'Link Drive folder', route: `/projects/${pid}`, queryParams: { tab: 'drive-mapping' } };
  }
  if (input.lifecycle.seedGaps.some(g => g.field.startsWith('qbo'))) {
    return { label: 'Review QB unmatched rows', route: '/settings', fragment: 'import-review' };
  }
  if (input.lifecycle.reviewReasons.length) {
    return { label: 'Review job data', route: `/projects/${pid}` };
  }
  return { label: 'On track', route: `/projects/${pid}` };
}

export function isCriticalRisk(input: {
  projectedMarginPct: number;
  currentContract: number;
  missingContract: boolean;
  budgetVariance: number;
  arPastDue: number;
  billedOverContract: boolean;
  closedInActiveView: boolean;
  fullyBilledComplete?: boolean;
}): boolean {
  if (input.fullyBilledComplete) return false;
  if (input.closedInActiveView) return true;
  return input.missingContract
    || (input.projectedMarginPct < BRIGHTEN_PROFIT_TARGET * 100 && input.currentContract > 0)
    || input.budgetVariance < -1000
    || input.arPastDue > 0
    || input.billedOverContract;
}

export function isSetupNeededRow(row: Pick<Active2026ControlRow,
  'pm' | 'foreman' | 'driveLinked' | 'missingBudget' | 'missingLaborBudget' | 'cprRequired' | 'cprStatus'
  | 'status' | 'lifecycleGroup' | 'billedToDate' | 'currentContract' | 'leftToBill'
>): boolean {
  if (isFullyBilledCompleteJob(row)) return false;
  return !row.foreman.trim()
    || !row.driveLinked
    || row.missingBudget
    || row.missingLaborBudget;
}

export function isReviewNeededRow(row: Pick<Active2026ControlRow,
  'budgetBasis' | 'needsReview' | 'missingItemCount' | 'missingW9Count' | 'missingCoiCount' | 'reviewFlags'
  | 'status' | 'lifecycleGroup' | 'billedToDate' | 'currentContract' | 'leftToBill'
>): boolean {
  if (isFullyBilledCompleteJob(row)) return false;
  return row.budgetBasis === 'EstimatedFrom20PercentTarget'
    || row.needsReview
    || row.missingItemCount > 0
    || row.missingW9Count > 0
    || row.missingCoiCount > 0
    || row.reviewFlags.some(f => f.toLowerCase().includes('qb') || f.toLowerCase().includes('seed'));
}

export function deriveHealthStatus(input: {
  projectedMarginPct: number;
  currentContract: number;
  missingContract: boolean;
  budgetVariance: number;
  arPastDue: number;
  billedOverContract: boolean;
  budgetBasis: ControlBudgetBasis;
  missingPm: boolean;
  missingForeman: boolean;
  missingDrive: boolean;
  missingBudget: boolean;
  missingLaborBudget: boolean;
  cprMissingSetup: boolean;
  subComplianceGap: boolean;
  needsReview: boolean;
  missingNonCritical: boolean;
  closedInActiveView: boolean;
  fullyBilledComplete?: boolean;
}): JobHealthStatus {
  if (input.fullyBilledComplete) return 'Green';
  if (isCriticalRisk({
    projectedMarginPct: input.projectedMarginPct,
    currentContract: input.currentContract,
    missingContract: input.missingContract,
    budgetVariance: input.budgetVariance,
    arPastDue: input.arPastDue,
    billedOverContract: input.billedOverContract,
    closedInActiveView: input.closedInActiveView,
    fullyBilledComplete: input.fullyBilledComplete,
  })) {
    return 'Red';
  }
  if (
    input.missingForeman
    || input.missingDrive
    || input.missingBudget
    || input.missingLaborBudget
    || input.subComplianceGap
    || input.budgetBasis === 'EstimatedFrom20PercentTarget'
    || input.needsReview
    || input.missingNonCritical
  ) {
    return 'Yellow';
  }
  return 'Green';
}

export function buildActive2026ControlRow(
  project: Project,
  ctx: Active2026ControlBuildInput,
): Active2026ControlRow | null {
  if (!isActive2026ControlJob(project.projectNumber)) return null;

  const lifecycle = ctx.lifecycleByProjectId.get(project.id);
  if (!lifecycle) return null;
  if (lifecycle.includeInClosed2026 || lifecycle.includeInArchive) return null;

  const financial = ctx.financialByProjectId.get(project.id)
    ?? {
      projectId: project.id,
      currentContractAmount: 0,
      approvedChangeOrderAmount: 0,
      pendingChangeOrderAmount: 0,
      budgetAmount: 0,
      costToDate: 0,
      costToComplete: 0,
      estimatedFinalCost: 0,
      billedToDate: 0,
      leftToBill: 0,
      arBalance: 0,
      retainageHeld: 0,
      forecastGrossProfit: 0,
      forecastMargin: 0,
      overUnderBilling: 0,
      selfPerformedBudget: 0,
      selfPerformedCostToDate: 0,
      subcontractorCostToDate: 0,
      budgetIsEstimated: false,
    } as ProjectFinancial;

  const wip = ctx.wipByProjectId.get(project.id);
  const meta = active2026JobMeta(project.projectNumber);
  const budgetBasis = mapBudgetBasis(financial);
  const missingContract = isMissingContract(financial);
  const missingBudget = isMissingBudget(financial, budgetBasis);

  const projectCos = ctx.changeOrders.filter(co => co.projectId === project.id);
  const hasApprovedCoNotBilled = projectCos.some(isApprovedUnbilledCo);
  const arPastDue = arPastDueForProject(project.id, ctx.arRecords);

  const laborActuals = ctx.laborActuals.filter(
    a => a.projectId === project.id && a.approvalStatus === 'Approved',
  );
  const laborBudget = laborBudgetFromLines(project.id, ctx.budgetLines)
    || financial.selfPerformedBudget
    || project.estLaborCost
    || 0;
  const laborParts = wagesAndFringeFromActuals(laborActuals);
  const laborActualCost = laborParts.wages + laborParts.fringe || financial.selfPerformedCostToDate;
  const laborBudgetImported = ctx.laborBudgetImported?.(project.projectNumber) ?? false;
  const missingLaborBudget = laborBudget <= 0 && !laborBudgetImported
    && ctx.foremanAssignments.some(a => a.projectId === project.id && a.bonusEligible);

  const subs = subComplianceCounts(
    project.id,
    ctx.projectSubcontractors,
    ctx.subcontractors,
    ctx.subDocuments,
  );
  const subComplianceGap = subs.missingW9 > 0 || subs.missingCoi > 0;

  const cpr = deriveCprStatus(project);
  const driveLinked = !!(project.driveFolderId || project.driveFolderUrl);
  const foremanAssignment = ctx.foremanAssignments.find(a => a.projectId === project.id);
  const bonusEligible = !!foremanAssignment?.bonusEligible;
  const bonusRecord = ctx.foremanRecords.find(r => r.projectId === project.id);
  const bonusStatus = bonusRecord?.status ?? (bonusEligible ? 'Not calculated' : 'N/A');

  const budgetVariance = financial.budgetAmount - financial.costToDate;
  const billedOverContract = financial.billedToDate > financial.currentContractAmount
    && financial.currentContractAmount > 0;
  const missingNonCritical = lifecycle.seedGaps.some(g => !g.blocksWorkflow);

  const closedInActiveView = lifecycle.includeInClosed2026 || lifecycle.includeInArchive;

  const rowPreview = {
    status: project.status ?? lifecycle.normalizedStatus,
    lifecycleGroup: lifecycle.projectLifecycleGroup,
    billedToDate: financial.billedToDate,
    currentContract: financial.currentContractAmount,
    leftToBill: financial.leftToBill,
  };
  const fullyBilledComplete = isFullyBilledCompleteJob(rowPreview);

  const healthStatus = deriveHealthStatus({
    projectedMarginPct: financial.forecastMargin,
    currentContract: financial.currentContractAmount,
    missingContract,
    budgetVariance,
    arPastDue,
    billedOverContract,
    budgetBasis,
    missingPm: false,
    missingForeman: isForemanSetupMissing(project, !!foremanAssignment),
    missingDrive: !driveLinked,
    missingBudget,
    missingLaborBudget,
    cprMissingSetup: cpr.missingSetup,
    subComplianceGap,
    needsReview: lifecycle.projectLifecycleGroup === 'NeedsReview' || (wip?.needsReview ?? false),
    missingNonCritical: lifecycle.seedGaps.some(g => !g.blocksWorkflow),
    closedInActiveView,
    fullyBilledComplete,
  });

  const nextAction = fullyBilledComplete
    ? { label: 'Complete', route: `/projects/${project.id}` }
    : deriveNextAction({
    project,
    financial,
    lifecycle,
    missingContract,
    missingBudget,
    budgetBasis,
    missingLaborBudget,
    hasApprovedCoNotBilled,
    arPastDue,
    arBalance: financial.arBalance,
    foremanAssigned: !!foremanAssignment,
    bonusEligible,
    subComplianceGap,
    cprMissingSetup: cpr.missingSetup,
    driveLinked,
  });

  return {
    projectId: project.id,
    jobNumber: normalizeJobNumber(project.projectNumber),
    projectName: project.projectName,
    customer: project.customer ?? '',
    status: project.status ?? lifecycle.normalizedStatus,
    lifecycleGroup: lifecycle.projectLifecycleGroup,
    pm: project.projectManager ?? '',
    foreman: foremanAssignment?.foremanName ?? effectiveForeman(project) ?? '',
    budgetType: meta?.budgetType ?? 'FullConstruction',

    currentContract: financial.currentContractAmount,
    approvedCos: financial.approvedChangeOrderAmount,
    pendingCos: financial.pendingChangeOrderAmount,
    contract2026: financial.currentContractAmount,
    billedToDate: financial.billedToDate,
    leftToBill: financial.leftToBill,
    arBalance: financial.arBalance,
    arPastDue,
    retainage: financial.retainageHeld,
    billingStatus: deriveBillingStatus(financial, hasApprovedCoNotBilled),

    budgetBasis,
    totalBudget: financial.budgetAmount,
    actualCostToDate: financial.costToDate,
    costToComplete: financial.costToComplete,
    estimatedFinalCost: financial.estimatedFinalCost,
    budgetVariance,

    projectedProfit: financial.forecastGrossProfit,
    projectedMarginPct: financial.forecastMargin,
    overUnderBilling: financial.overUnderBilling,
    wipStatus: wip?.wipGroup ?? lifecycle.projectLifecycleGroup,
    reviewFlags: wip?.reviewFlags ?? lifecycle.reviewReasons,

    laborBudget,
    laborActualCost,
    laborVariance: laborBudget - laborActualCost,
    foremanBonusEligible: bonusEligible,
    foremanAssigned: foremanAssignment?.foremanName ?? '',
    bonusStatus,

    subcontractorCount: subs.activeCount,
    subcontractorCostToDate: financial.subcontractorCostToDate,
    missingW9Count: subs.missingW9,
    missingCoiCount: subs.missingCoi,
    lienWaiverNeededCount: subs.lienWaiverNeeded,

    driveLinked,
    cprRequired: cpr.required,
    cprStatus: cpr.status,
    seedCompletenessStatus: lifecycle.seedCompletenessStatus,
    missingItemCount: lifecycle.seedGaps.length,

    healthStatus,
    nextAction,
    hasApprovedCoNotBilled,
    missingContract,
    missingBudget,
    missingLaborBudget,
    needsReview: lifecycle.projectLifecycleGroup === 'NeedsReview' || (wip?.needsReview ?? false),
  };
}

export function buildActive2026ControlRows(ctx: Active2026ControlBuildInput): Active2026ControlRow[] {
  const jobOrder = new Map(ACTIVE_2026_JOBS.map((j, i) => [j.jobNumber, i]));
  const rows: Active2026ControlRow[] = [];

  for (const project of ctx.projects) {
    const row = buildActive2026ControlRow(project, ctx);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => (jobOrder.get(a.jobNumber) ?? 999) - (jobOrder.get(b.jobNumber) ?? 999));
  return rows;
}

export function summarizeActive2026Control(rows: Active2026ControlRow[]): Active2026ControlSummary {
  const contract = rows.reduce((s, r) => s + r.currentContract, 0);
  const budget = rows.reduce((s, r) => s + r.totalBudget, 0);
  const actual = rows.reduce((s, r) => s + r.actualCostToDate, 0);
  const profit = rows.reduce((s, r) => s + r.projectedProfit, 0);
  const billed = rows.reduce((s, r) => s + r.billedToDate, 0);
  const left = rows.reduce((s, r) => s + r.leftToBill, 0);
  const ar = rows.reduce((s, r) => s + r.arBalance, 0);

  const critical = rows.filter(r => isCriticalRisk({
    projectedMarginPct: r.projectedMarginPct,
    currentContract: r.currentContract,
    missingContract: r.missingContract,
    budgetVariance: r.budgetVariance,
    arPastDue: r.arPastDue,
    billedOverContract: r.billedToDate > r.currentContract && r.currentContract > 0,
    closedInActiveView: false,
    fullyBilledComplete: isFullyBilledCompleteJob(r),
  }));
  const setup = rows.filter(r => isSetupNeededRow(r) && !critical.includes(r));
  const review = rows.filter(r => isReviewNeededRow(r) && !critical.includes(r) && !setup.includes(r));

  return {
    activeJobs: rows.length,
    jobsCriticalRisk: critical.length,
    jobsSetupNeeded: setup.length,
    jobsReviewNeeded: review.length,
    jobsAtRisk: critical.length,
    currentContractTotal: contract,
    budgetTotal: budget,
    actualCostTotal: actual,
    projectedProfitTotal: profit,
    projectedMarginPct: contract > 0 ? (profit / contract) * 100 : 0,
    billedToDateTotal: billed,
    leftToBillTotal: left,
    openArTotal: ar,
    jobsUnder20Margin: rows.filter(r => r.projectedMarginPct < BRIGHTEN_PROFIT_TARGET * 100 && r.currentContract > 0).length,
    jobsMissingContract: rows.filter(r => r.missingContract).length,
    jobsMissingBudget: rows.filter(r => r.missingBudget).length,
    jobsMissingLaborBudget: rows.filter(r => r.missingLaborBudget).length,
    jobsArPastDue: rows.filter(r => r.arPastDue > 0).length,
    jobsMissingSubCompliance: rows.filter(r => r.missingW9Count > 0 || r.missingCoiCount > 0).length,
    jobsMissingCprSetup: rows.filter(r => r.cprRequired && r.cprStatus === 'Missing setup').length,
  };
}

export function matchesControlFilter(row: Active2026ControlRow, filter: ControlFilterId): boolean {
  switch (filter) {
    case 'under20Margin':
      return row.currentContract > 0 && row.projectedMarginPct < BRIGHTEN_PROFIT_TARGET * 100;
    case 'missingContract':
      return row.missingContract;
    case 'missingBudget':
      return row.missingBudget;
    case 'missingLaborBudget':
      return row.missingLaborBudget;
    case 'missingPmForeman':
      return !row.pm.trim() || !row.foreman.trim();
    case 'missingDrive':
      return !row.driveLinked;
    case 'openAr':
      return row.arBalance > 0;
    case 'arPastDue':
      return row.arPastDue > 0;
    case 'approvedCoNotBilled':
      return row.hasApprovedCoNotBilled;
    case 'cprRequired':
      return row.cprRequired;
    case 'cprMissingSetup':
      return row.cprRequired && row.cprStatus === 'Missing setup';
    case 'missingSubCompliance':
      return row.missingW9Count > 0 || row.missingCoiCount > 0;
    case 'needsReview':
      return row.needsReview;
    case 'tmDemo':
      return row.budgetType === 'TmDemoRepair';
    case 'smallInstall':
      return row.budgetType === 'SmallInstall';
    case 'fullConstruction':
      return row.budgetType === 'FullConstruction';
    case 'specialtySubHeavy':
      return row.budgetType === 'SpecialtySubHeavy';
    default:
      return true;
  }
}

export function sortControlRows(rows: Active2026ControlRow[], sortKey: ControlSortKey): Active2026ControlRow[] {
  const copy = [...rows];
  switch (sortKey) {
    case 'highestAr':
      return copy.sort((a, b) => b.arBalance - a.arBalance || a.jobNumber.localeCompare(b.jobNumber));
    case 'lowestMargin':
      return copy.sort((a, b) => a.projectedMarginPct - b.projectedMarginPct || a.jobNumber.localeCompare(b.jobNumber));
    case 'largestContract':
      return copy.sort((a, b) => b.currentContract - a.currentContract || a.jobNumber.localeCompare(b.jobNumber));
    case 'largestCostOverrun':
      return copy.sort((a, b) => a.budgetVariance - b.budgetVariance || a.jobNumber.localeCompare(b.jobNumber));
    case 'mostMissing':
      return copy.sort((a, b) => b.missingItemCount - a.missingItemCount || a.jobNumber.localeCompare(b.jobNumber));
    case 'nextBilling':
      return copy.sort((a, b) => {
        const score = (r: Active2026ControlRow) =>
          (r.hasApprovedCoNotBilled ? 100 : 0) + (r.leftToBill > 0 ? 50 : 0) + r.leftToBill / 1000;
        return score(b) - score(a) || a.jobNumber.localeCompare(b.jobNumber);
      });
    case 'projectName':
      return copy.sort((a, b) => a.projectName.localeCompare(b.projectName));
    case 'jobNumber':
    default:
      return copy.sort((a, b) => parseInt(a.jobNumber, 10) - parseInt(b.jobNumber, 10));
  }
}

export const CONTROL_FILTER_OPTIONS: { id: ControlFilterId; label: string }[] = [
  { id: 'under20Margin', label: 'Under 20% margin' },
  { id: 'missingContract', label: 'Missing contract' },
  { id: 'openAr', label: 'Open AR' },
  { id: 'arPastDue', label: 'AR past due' },
  { id: 'approvedCoNotBilled', label: 'Approved CO not billed' },
  { id: 'tmDemo', label: 'T&M / demo' },
  { id: 'smallInstall', label: 'Small install' },
  { id: 'fullConstruction', label: 'Full construction' },
  { id: 'specialtySubHeavy', label: 'Specialty sub-heavy' },
];

export function matchesControlSegment(row: Active2026ControlRow, segment: ControlSegmentId): boolean {
  switch (segment) {
    case 'all':
      return true;
    case 'criticalRisk':
      return row.healthStatus === 'Red';
    case 'setupNeeded':
      return isSetupNeededRow(row);
    case 'reviewNeeded':
      return isReviewNeededRow(row);
    case 'billing':
      return row.arBalance > 0 || row.arPastDue > 0 || row.hasApprovedCoNotBilled;
    case 'cpr':
      return row.cprRequired;
    case 'subs':
      return row.subcontractorCount > 0 || row.missingW9Count > 0 || row.missingCoiCount > 0;
    default:
      return true;
  }
}

export function rowWarningChips(row: Active2026ControlRow): string[] {
  if (isFullyBilledCompleteJob(row)) return [];
  const chips: string[] = [];
  if (row.missingContract) chips.push('No contract');
  if (row.arPastDue > 0) chips.push('AR past due');
  if (row.hasApprovedCoNotBilled) chips.push('CO not billed');
  if (row.projectedMarginPct < BRIGHTEN_PROFIT_TARGET * 100 && row.currentContract > 0) chips.push('Low margin');
  return chips.slice(0, 2);
}
