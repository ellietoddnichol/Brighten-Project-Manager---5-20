import {
  ARRecord,
  ProjectFinancial,
  WIPRecord,
  WipConfidence,
  WipGroup,
  WipRecordStatus,
  WipWarningChip,
  WipWarningTone,
} from '../models/financial.types';
import { Billing, ChangeOrder, Project, ProjectTask } from '../models/types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { isPendingCo, isApprovedUnbilledCo } from './change-management';
import { BRIGHTEN_PROFIT_TARGET } from '../config/active-2026-jobs.config';
import { safeDivide } from './project-financial.compute';
import { isClosedProject } from './project';

export interface WipGlobalSourceFlags {
  qbHasArAgingTab: boolean;
  qbHasCostDetailTab: boolean;
  projectIdsWithLaborActuals: Set<string>;
}

export interface WipComputeContext {
  project: Project;
  financial: ProjectFinancial;
  changeOrders: ChangeOrder[];
  billings: Billing[];
  arRecords: ARRecord[];
  tasks?: ProjectTask[];
  lifecycle?: ProjectLifecycleSnapshot;
  sourceFlags?: WipGlobalSourceFlags;
}

export function isArchiveJobNumber(jobNumber?: string): boolean {
  const n = parseInt(jobNumber ?? '', 10);
  if (!Number.isFinite(n)) return false;
  if (n === 158) return false;
  return n >= 140 && n <= 180;
}

export function mapWipStatus(project: Project): WipRecordStatus {
  switch (project.status) {
    case 'Lead / Precon':
    case 'Awarded':
    case 'Setup Needed':
      return 'Precon';
    case 'Closeout':
      return 'Closeout';
    case 'Closed':
      return 'Complete';
    default:
      return project.wipStatus === 'Needs Review' ? 'On Hold' : 'Active';
  }
}

export function lifecycleLabelFor(lifecycle?: ProjectLifecycleSnapshot, project?: Project): string {
  if (lifecycle?.projectLifecycleGroup) return lifecycle.projectLifecycleGroup;
  return project?.status ?? 'Active';
}

export function budgetBasisDisplayLabel(financial: ProjectFinancial): string {
  if (financial.budgetIsEstimated || financial.budgetBasis === 'EstimatedFrom20PercentTarget') {
    return 'Estimated 80%';
  }
  if (financial.budgetBasis === 'MissingContract') return 'Missing';
  if (financial.budgetBasis === 'Imported' || financial.budgetBasis === 'Workbook') return 'Imported';
  if (financial.budgetAmount > 0) return 'Manual';
  return 'Missing';
}

export function hasCurrentActivity(
  project: Project,
  changeOrders: ChangeOrder[],
  billings: Billing[],
): boolean {
  if (project.includeOnActiveDashboard === true
    && !isArchiveJobNumber(project.projectNumber)
    && !isClosedProject(project)) return true;
  if (project.currentActivity?.trim()) return true;
  if (project.wipStatus === 'In Progress') return true;

  const pid = project.id;
  const openCos = changeOrders.some(co => co.projectId === pid && isPendingCo(co));
  const openPayApps = billings.some(b =>
    b.projectId === pid && ['Draft', 'Submitted', 'Approved', 'Invoiced'].includes(b.status ?? ''),
  );
  const openTasks = (project as Project & { _openTasks?: number })._openTasks;
  return openCos || openPayApps || !!openTasks;
}

export function resolveEstimatedFinalCost(
  project: Project,
  financial: ProjectFinancial,
): number {
  if (project.wipEstimatedFinalCostOverride != null) {
    return project.wipEstimatedFinalCostOverride;
  }
  const budget = project.wipBudgetOverride ?? financial.budgetAmount;
  const cost = financial.costToDate;
  if (budget > 0 && cost > budget) return cost;
  if (financial.estimatedFinalCost > 0) return financial.estimatedFinalCost;
  return budget || cost;
}

export function hasArPastDue(projectId: string, arRecords: ARRecord[]): boolean {
  return arRecords.some(r =>
    r.projectId === projectId
    && isOpenArRecord(r.status)
    && r.agingBucket !== 'Current',
  );
}

export function expectsLaborActuals(financial: ProjectFinancial, wipGroup: WipGroup): boolean {
  if (wipGroup === 'ExcludedArchive' || wipGroup === 'UpcomingWIP') return false;
  return financial.selfPerformedBudget > 0 || financial.selfPerformedCostToDate > 0;
}

export function detectWipReviewFlags(ctx: WipComputeContext, wipGroup: WipGroup): string[] {
  const { project, financial, changeOrders, arRecords } = ctx;
  const flags: string[] = [];
  const isActiveGroup = wipGroup === 'ActiveWIP' || wipGroup === 'UpcomingWIP';

  if (!financial.currentContractAmount && isActiveGroup && project.status === 'Active' && !project.contractPending) {
    flags.push('Missing contract amount');
  }
  if (!financial.budgetAmount && !financial.budgetIsEstimated && isActiveGroup) {
    flags.push('Missing budget');
  }
  if (financial.budgetIsEstimated && financial.budgetBasis === 'MissingContract') {
    flags.push('Missing contract amount');
  }
  if (financial.costToDate > financial.budgetAmount && financial.budgetAmount > 0 && !financial.budgetIsEstimated) {
    flags.push('Actual cost exceeds budget');
  }
  if (financial.billedToDate > financial.currentContractAmount && financial.currentContractAmount > 0) {
    flags.push('Billed over contract');
  }
  if (financial.leftToBill < 0) flags.push('Negative left to bill');
  const efc = resolveEstimatedFinalCost(project, financial);
  const pct = safeDivide(financial.costToDate, efc) * 100;
  if (pct > 100) flags.push('Percent complete over 100%');
  if (Math.abs(financial.overUnderBilling) > 1000 && isActiveGroup) {
    flags.push(financial.overUnderBilling > 0 ? 'Overbilled vs earned' : 'Underbilled vs earned');
  }
  if (
    financial.currentContractAmount > 0
    && financial.forecastMargin < BRIGHTEN_PROFIT_TARGET * 100
    && isActiveGroup
  ) {
    flags.push('Projected margin under 20%');
  }
  const pid = project.id;
  if (changeOrders.some(co => co.projectId === pid && isApprovedUnbilledCo(co))) {
    flags.push('Approved CO not billed');
  }
  if (hasArPastDue(pid, arRecords)) flags.push('AR past due');
  if (project.seedActionRequired) flags.push('Source review needed');
  if (project.wipStatus === 'Needs Review') flags.push('WIP status needs review');
  if (isClosedProject(project) && wipGroup === 'ActiveWIP') {
    flags.push('Closed job in Active WIP');
  }

  return flags;
}

export function assignWipGroup(ctx: WipComputeContext, _reviewFlags: string[]): WipGroup {
  const { project, financial, lifecycle } = ctx;
  if (project.wipGroupOverride) return project.wipGroupOverride;

  const hasAr = financial.arBalance > 0;
  const hasLeftToBill = financial.leftToBill > 0;
  const activity = hasCurrentActivity(project, ctx.changeOrders, ctx.billings);

  if (lifecycle) {
    if (lifecycle.includeInCloseoutAr) {
      return 'CloseoutAR';
    }
    if (lifecycle.projectLifecycleGroup === 'Archive' || lifecycle.includeInArchive) {
      return hasAr ? 'CloseoutAR' : 'ExcludedArchive';
    }
    if (lifecycle.projectLifecycleGroup === 'Closed2026' || lifecycle.includeInClosed2026) {
      return hasAr ? 'CloseoutAR' : 'ExcludedArchive';
    }
    if (lifecycle.includeInActiveWip) {
      if (lifecycle.projectLifecycleGroup === 'Upcoming') return 'UpcomingWIP';
      return 'ActiveWIP';
    }
    if (hasAr) return 'CloseoutAR';
    return 'ExcludedArchive';
  }

  const isCloseout = project.status === 'Closeout' || project.dashboardGroup?.includes('Closeout');
  const isComplete = project.status === 'Closed' || project.wipStatus === 'Complete' || project.wipStatus === 'Closed';

  if (isComplete || isCloseout) {
    if (hasAr) return 'CloseoutAR';
    if (!hasLeftToBill && !activity) return 'ExcludedArchive';
  }

  if (isArchiveJobNumber(project.projectNumber) && !activity && !hasAr && !hasLeftToBill) {
    return 'ExcludedArchive';
  }

  if (project.includeOnActiveDashboard === false && !activity && !hasLeftToBill && !hasAr) {
    return 'ExcludedArchive';
  }

  if (project.status === 'Lead / Precon' || project.status === 'Awarded' || project.status === 'Setup Needed' || project.wipStatus === 'Pre Con') {
    return 'UpcomingWIP';
  }

  return 'ActiveWIP';
}

export function isQuietCompleteRecord(record: WIPRecord): boolean {
  if (record.arBalance > 0) return false;
  if (record.leftToBill > 100) return false;
  const fullyBilled = record.contractAmount > 0 && record.billedToDate >= record.contractAmount * 0.999;
  const complete = record.percentComplete >= 99.9 || fullyBilled;
  return complete && (record.wipGroup === 'ExcludedArchive' || record.wipGroup === 'CloseoutAR');
}

export function buildWipWarningChips(
  ctx: WipComputeContext,
  record: Pick<WIPRecord, 'wipGroup' | 'contractAmount' | 'forecastMargin' | 'costToDate' | 'budgetAmount'
    | 'billedToDate' | 'arBalance' | 'percentComplete' | 'leftToBill'>,
  reviewFlags: string[],
): WipWarningChip[] {
  if (isQuietCompleteRecord(record as WIPRecord)) return [];

  const { financial, sourceFlags } = ctx;
  const chips: WipWarningChip[] = [];
  const push = (label: string, tone: WipWarningTone) => {
    if (!chips.some(c => c.label === label)) chips.push({ label, tone });
  };

  if (reviewFlags.includes('Missing contract amount')) push('Missing contract', 'critical');
  if (reviewFlags.includes('Projected margin under 20%')) push('Margin under 20%', 'critical');
  if (reviewFlags.includes('Actual cost exceeds budget')) push('Cost exceeds budget', 'critical');
  if (reviewFlags.includes('Billed over contract')) push('Billed over contract', 'critical');
  if (reviewFlags.includes('AR past due')) push('AR past due', 'critical');
  if (reviewFlags.includes('Closed job in Active WIP')) push('Closed in Active WIP', 'critical');

  if (financial.budgetIsEstimated && financial.currentContractAmount > 0) {
    push('Estimated 80% budget', 'amber');
  }
  if (reviewFlags.includes('Missing budget') && !financial.budgetIsEstimated) {
    push('Missing imported budget', 'amber');
  }

  const laborExpected = expectsLaborActuals(financial, record.wipGroup);
  const hasLabor = sourceFlags?.projectIdsWithLaborActuals.has(ctx.project.id) ?? false;
  if (laborExpected && !hasLabor && record.wipGroup !== 'ExcludedArchive') {
    push('Labor actuals not synced', 'amber');
  }

  if (sourceFlags && !sourceFlags.qbHasCostDetailTab && record.costToDate > 0 && record.wipGroup === 'ActiveWIP') {
    push('Missing QB cost detail', 'amber');
  }
  if (sourceFlags && !sourceFlags.qbHasArAgingTab && record.arBalance > 0) {
    push('Missing AR Aging Summary', 'amber');
  }
  if (projectNeedsManualEfc(ctx.project, financial)) push('Manual EFC needed', 'amber');
  if (reviewFlags.includes('Source review needed')) push('Source review needed', 'amber');
  if (reviewFlags.includes('Overbilled vs earned') || reviewFlags.includes('Underbilled vs earned')) {
    push('Review over/under billing', 'amber');
  }

  return chips;
}

function projectNeedsManualEfc(project: Project, financial: ProjectFinancial): boolean {
  return !project.wipEstimatedFinalCostOverride
    && financial.costToDate > financial.budgetAmount
    && financial.budgetAmount > 0
    && !financial.budgetIsEstimated;
}

export function computeWipConfidence(
  ctx: WipComputeContext,
  record: WIPRecord,
  chips: WipWarningChip[],
): WipConfidence {
  if (isQuietCompleteRecord(record)) return 'NotApplicable';
  if (record.wipGroup === 'ExcludedArchive' && record.arBalance <= 0) return 'NotApplicable';

  const critical = chips.some(c => c.tone === 'critical');
  if (critical || record.needsReview) return 'NeedsReview';

  const { financial, sourceFlags } = ctx;
  const needsSource = chips.some(c =>
    c.label.includes('Labor actuals')
    || c.label.includes('QB cost detail')
    || c.label.includes('AR Aging'),
  );
  if (needsSource) return 'NeedsSource';

  if (financial.budgetIsEstimated && financial.currentContractAmount > 0 && financial.billedToDate >= 0) {
    return 'Estimated';
  }

  const hasContract = record.contractAmount > 0;
  const hasBudget = record.budgetAmount > 0 && !financial.budgetIsEstimated;
  const hasCost = record.costToDate > 0;
  const hasBilling = record.billedToDate > 0;
  if (hasContract && (hasBudget || financial.budgetIsEstimated) && hasCost && hasBilling) {
    return 'Good';
  }
  if (hasContract && record.wipGroup === 'UpcomingWIP') return 'Estimated';
  if (sourceFlags && !sourceFlags.qbHasCostDetailTab && !hasCost && record.wipGroup === 'ActiveWIP') {
    return 'NeedsSource';
  }
  return 'NeedsReview';
}

export function deriveWipNextAction(
  ctx: WipComputeContext,
  record: WIPRecord,
  chips: WipWarningChip[],
): string {
  if (isQuietCompleteRecord(record)) return 'Complete';

  const labels = new Set(chips.map(c => c.label));
  const { financial, project } = ctx;

  if (labels.has('Missing contract')) return 'Add contract amount';
  if (labels.has('Estimated 80% budget')) return 'Confirm 80% budget estimate';
  if (labels.has('Missing imported budget')) return 'Import budget later';
  if (labels.has('Missing QB cost detail')) return 'Add Project Cost Detail tab';
  if (labels.has('Missing AR Aging Summary')) return 'Re-sync QuickBooks';
  if (labels.has('Labor actuals not synced')) return 'Re-sync labor actuals';
  if (labels.has('Margin under 20%')) return 'Review margin under 20%';
  if (labels.has('Review over/under billing') || labels.has('Overbilled vs earned')) {
    return 'Review overbilling/underbilling';
  }
  if (labels.has('AR past due') || (record.arBalance > 0 && record.wipGroup === 'CloseoutAR')) {
    return 'Follow up AR';
  }
  if (labels.has('Closed in Active WIP')) return 'Move to Closeout AR';
  if (labels.has('Source review needed')) return 'Source Review';
  if (record.wipGroup === 'CloseoutAR' && record.arBalance <= 0 && record.leftToBill <= 0) {
    return 'Mark complete/closed';
  }
  if (record.leftToBill > 0 && record.wipGroup === 'ActiveWIP') return 'Review billing';
  if (financial.budgetIsEstimated && project.status === 'Active') return 'Confirm 80% budget estimate';
  return 'No action';
}

export function buildWipRecord(ctx: WipComputeContext): WIPRecord {
  const { project, financial } = ctx;

  const wipGroup = assignWipGroup(ctx, []);
  const reviewFlags = detectWipReviewFlags(ctx, wipGroup);

  const contractAmount = project.wipContractOverride ?? financial.currentContractAmount;
  const budgetAmount = project.wipBudgetOverride ?? financial.budgetAmount;
  const estimatedFinalCost = resolveEstimatedFinalCost(project, financial);
  const costToComplete = project.wipCostToComplete ?? Math.max(0, estimatedFinalCost - financial.costToDate);

  const rawPct = safeDivide(financial.costToDate, estimatedFinalCost) * 100;
  const percentComplete = reviewFlags.includes('Percent complete over 100%') ? rawPct : Math.min(100, rawPct);

  const earnedRevenue = project.earnedRevenue ?? (percentComplete / 100) * contractAmount;
  const leftToBill = Math.max(0, contractAmount - financial.billedToDate);
  const overUnderBilling = project.overUnderBilled ?? (financial.billedToDate - earnedRevenue);
  const forecastGrossProfit = contractAmount - estimatedFinalCost;
  const forecastMargin = safeDivide(forecastGrossProfit, contractAmount) * 100;

  const base: WIPRecord = {
    id: project.id,
    projectId: project.id,
    jobNumber: project.projectNumber,
    projectName: project.projectName,
    customer: project.customer,
    status: mapWipStatus(project),
    wipGroup,
    wipCategory: wipGroup === 'ActiveWIP' ? 'Active' : wipGroup === 'ExcludedArchive' ? 'Archive' : wipGroup,
    originalContractAmount: financial.originalContractAmount,
    approvedChangeOrderAmount: financial.approvedChangeOrderAmount,
    pendingChangeOrderAmount: financial.pendingChangeOrderAmount,
    currentContractAmount: contractAmount,
    contractAmount,
    budgetAmount,
    estimatedFinalCost,
    costToDate: financial.costToDate,
    costToComplete,
    percentComplete,
    earnedRevenue,
    billedToDate: financial.billedToDate,
    overUnderBilling,
    leftToBill,
    arBalance: financial.arBalance,
    retainageHeld: financial.retainageHeld,
    forecastGrossProfit,
    forecastMargin,
    selfPerformedAmount: financial.selfPerformedCostToDate,
    subcontractorAmount: financial.subcontractorCostToDate,
    materialAmount: financial.materialCostToDate,
    equipmentAmount: financial.equipmentCostToDate,
    otherAmount: financial.otherCostToDate,
    needsReview: reviewFlags.length > 0 || financial.needsReview,
    reviewNotes: project.wipReviewNotes ?? financial.reviewNotes,
    reviewFlags,
    source: financial.source,
    notes: project.scopeSummary,
    budgetBasisLabel: budgetBasisDisplayLabel(financial),
    lifecycleLabel: lifecycleLabelFor(ctx.lifecycle, project),
  };

  const warningChips = buildWipWarningChips(ctx, base, reviewFlags);
  const quiet = isQuietCompleteRecord(base);
  return {
    ...base,
    needsReview: quiet ? false : base.needsReview,
    warningChips,
    wipConfidence: computeWipConfidence(ctx, base, warningChips),
    nextAction: deriveWipNextAction(ctx, base, warningChips),
  };
}

export function wipGroupLabel(group: WipGroup): string {
  switch (group) {
    case 'ActiveWIP': return 'Active WIP';
    case 'UpcomingWIP': return 'Upcoming / Precon';
    case 'CloseoutAR': return 'Closeout AR';
    case 'NeedsReview': return 'Needs Review';
    case 'ExcludedArchive': return 'Archive / Excluded';
  }
}

export function wipConfidenceLabel(confidence?: WipConfidence): string {
  switch (confidence) {
    case 'Good': return 'Good';
    case 'Estimated': return 'Estimated';
    case 'NeedsSource': return 'Needs Source';
    case 'NeedsReview': return 'Needs Review';
    case 'NotApplicable': return 'Not Applicable';
    default: return '—';
  }
}

export function isOpenArRecord(status?: string): boolean {
  return status === 'Open' || status === 'PartiallyPaid' || status === 'Disputed';
}
