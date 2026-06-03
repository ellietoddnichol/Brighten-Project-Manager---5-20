import { Project, ProjectStatus, ScheduleMilestone, ChangeOrder } from '@app/models/types';
import {
  BrightenSeedFinancial,
  BrightenSeedMilestone,
  BrightenSeedProject,
  BrightenSeedChangeOrder,
} from '@app/data/brighten-seed.types';

function mapWipStatus(status: string): ProjectStatus {
  switch (status.trim()) {
    case 'Pre Con':
      return 'Lead / Precon';
    case 'In Progress':
    case 'T&M':
      return 'Active';
    case 'Needs Review':
      return 'Setup Needed';
    case 'Complete':
    case 'Closed':
      return 'Closed';
    case 'Closeout':
      return 'Closeout';
    default:
      return 'Active';
  }
}

function normalizePercent(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  if (value === 0) return 0;
  // Seed file mixes ratios (0.49) and whole percents (49.2).
  if (Math.abs(value) <= 1.5) return value * 100;
  return value;
}

function normalizeMargin(value: number | null | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

export function resolveSeedProjectNumber(project: BrightenSeedProject): string {
  if (project.jobNumber != null && project.jobNumber !== '') {
    return String(project.jobNumber);
  }
  if (project.projectId === 'EXT_3RD_SPACE') return '228';
  return project.projectName.trim();
}

export function seedProjectToFirestore(
  project: BrightenSeedProject,
  financial?: BrightenSeedFinancial,
): Partial<Project> {
  const projectNumber = resolveSeedProjectNumber(project);
  const notes = [project.notes, project.actionRequired].filter(Boolean).join(' · ');

  const payload: Partial<Project> = {
    seedProjectId: project.projectId,
    projectNumber,
    projectName: project.projectName,
    customer: project.customer ?? 'Brighten Builders LLC',
    status: mapWipStatus(project.status),
    wipStatus: project.status,
    dashboardGroup: project.dashboardGroup,
    includeOnActiveDashboard: project.includeOnActiveDashboard,
    scopeSummary: project.scopeSummary ?? project.scopeType ?? undefined,
    phase: project.phase ?? undefined,
    currentActivity: project.currentActivity ?? undefined,
    priority: project.priority ?? undefined,
    riskLevel: project.riskLevel ?? undefined,
    seedActionRequired: project.actionRequired ?? undefined,
    targetCompletionDate: project.targetCompletionDate ?? undefined,
    startDate: project.nextMilestoneDate ?? undefined,
  };

  if (notes) {
    payload.scopeSummary = payload.scopeSummary
      ? `${payload.scopeSummary} — ${notes}`
      : notes;
  }

  if (financial) {
    payload.originalContractAmount = financial.contractAmount2026 ?? undefined;
    payload.fullContractReference = financial.fullContractReference ?? undefined;
    payload.estCostBudget = financial.estimatedCostBudget2026 ?? undefined;
    payload.actualCostToDate = financial.costToDate2026 ?? undefined;
    payload.wipPercentComplete = normalizePercent(financial.percentComplete);
    payload.earnedRevenue = financial.earnedRevenue ?? undefined;
    payload.billedToDate = financial.billedToDate2026 ?? undefined;
    payload.overUnderBilled = financial.overUnderBilled ?? undefined;
    payload.currentAR = financial.currentAR ?? undefined;
    payload.wipLeftToBill = financial.leftToBill2026 ?? undefined;
    payload.wipCostToComplete = financial.costToComplete ?? undefined;
    payload.forecastGP = financial.forecastGrossProfit ?? undefined;
    payload.forecastMargin = normalizeMargin(financial.forecastMargin);
  }

  return payload;
}

export function seedMilestoneToFirestore(
  milestone: BrightenSeedMilestone,
  firestoreProjectId: string,
): Partial<ScheduleMilestone> {
  let status: ScheduleMilestone['status'] = 'Upcoming';
  switch (milestone.status?.trim()) {
    case 'Complete':
      status = 'Complete';
      break;
    case 'In Progress':
      status = 'In Progress';
      break;
    case 'Delayed':
      status = 'Delayed';
      break;
    case 'Canceled':
      status = 'Canceled';
      break;
    case 'Planned':
    case 'Not Started':
    default:
      status = 'Upcoming';
  }

  return {
    projectId: firestoreProjectId,
    title: milestone.title,
    description: milestone.notes ?? undefined,
    milestoneType: 'Schedule',
    plannedEndDate: milestone.targetDate ?? undefined,
    status,
    notes: milestone.notes ?? undefined,
  };
}

function mapSeedChangeOrderStatus(status: BrightenSeedChangeOrder['status']): ChangeOrder['status'] {
  switch (status) {
    case 'Accepted':
      return 'Approved';
    case 'Paid':
      return 'Billed';
    case 'Pending':
      return 'Submitted';
    case 'Rejected':
      return 'Rejected';
    case 'Draft':
    default:
      return 'Draft';
  }
}

export function seedChangeOrderToFirestore(
  changeOrder: BrightenSeedChangeOrder,
  firestoreProjectId: string,
): Partial<ChangeOrder> {
  const appStatus = mapSeedChangeOrderStatus(changeOrder.status);
  const hasAmount = changeOrder.amount != null && !Number.isNaN(changeOrder.amount);
  const amount = hasAmount ? changeOrder.amount! : 0;
  const status: ChangeOrder['status'] =
    !hasAmount && changeOrder.status === 'Pending' ? 'Need Pricing' : appStatus;

  const sourceLinks = [
    changeOrder.sourceUrl,
    ...(changeOrder.sourceUrls ?? []),
  ].filter(Boolean) as string[];

  const isApprovedLike = status === 'Approved' || status === 'Billed';

  const payload: Partial<ChangeOrder> = {
    projectId: firestoreProjectId,
    coNumber: changeOrder.coNumber,
    changeOrderNumber: changeOrder.coNumber,
    title: changeOrder.title,
    description: changeOrder.description,
    status,
    sellPrice: hasAmount ? amount : undefined,
    approvedAmount: isApprovedLike && hasAmount ? amount : undefined,
    costImpact: hasAmount ? amount : undefined,
    linkedFile: changeOrder.sourceUrl ?? undefined,
    notes: [
      `seedChangeOrderId:${changeOrder.changeOrderId}`,
      !hasAmount ? 'Amount TBD' : null,
      sourceLinks.length > 1 ? `Sources: ${sourceLinks.join(' | ')}` : null,
    ].filter(Boolean).join('\n') || undefined,
  };

  if (changeOrder.dateSubmitted) payload.dateSubmitted = changeOrder.dateSubmitted;
  if (changeOrder.dateApproved) payload.dateApproved = changeOrder.dateApproved;
  if (isApprovedLike && hasAmount && !changeOrder.dateApproved) {
    payload.dateApproved = changeOrder.dateSubmitted ?? '2026-05-21';
  }
  if (status === 'Submitted' && !changeOrder.dateSubmitted) {
    payload.dateSubmitted = '2026-05-21';
  }
  if (changeOrder.status === 'Paid' || status === 'Billed') {
    payload.dateBilled = changeOrder.dateApproved ?? changeOrder.dateSubmitted ?? '2026-05-21';
  }

  return payload;
}
