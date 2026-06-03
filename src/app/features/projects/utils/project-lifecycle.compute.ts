import { ARRecord } from '@app/models/financial.types';
import {
  NormalizedProjectStatus,
  ProjectLifecycleGroup,
  ProjectLifecycleSnapshot,
  SeedCompletenessGap,
  SeedCompletenessStatus,
} from '@app/models/project-lifecycle.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { Billing, ChangeOrder, Project, ProjectBudgetLine, ProjectTask } from '@app/models/types';
import { isActive2026ControlJob } from '@app/config/active-2026-jobs.config';
import { isArchiveJobNumber, isOpenArRecord } from '@features/financials/utils/wip.compute';
import { isOverheadJob, isClosedProject } from '@shared/utils/project';
import { isPendingCo } from '@features/projects/utils/change-management';
import { isForemanSetupMissing, deriveProjectStartDate } from '@features/projects/utils/project-setup.util';
import { PROJECT_SETUP_DEFAULTS } from '@app/config/project-setup-defaults.config';

/** Gaps that should not block project setup completion (June 2026 rules). */
const SETUP_INFORMATIONAL_FIELDS = new Set([
  'contractPending',
  'billingHistory',
  'arStatus',
  'actualCostSummary',
  'totalBudget',
  'estLaborCost',
  'estSubCost',
  'qboCustomer',
  'closedDate',
]);

export function isSetupBlockingGap(gap: SeedCompletenessGap): boolean {
  if (SETUP_INFORMATIONAL_FIELDS.has(gap.field)) return false;
  if (gap.field === 'contractPending') return false;
  return gap.blocksWorkflow || ['identity', 'drive', 'team'].includes(gap.category);
}

export const LIFECYCLE_ACTIVITY_YEAR = 2026;

export interface ProjectLifecycleInput {
  project: Project;
  billings?: Billing[];
  arRecords?: ARRecord[];
  laborActuals?: ProjectLaborActual[];
  changeOrders?: ChangeOrder[];
  tasks?: ProjectTask[];
  budgetLines?: ProjectBudgetLine[];
  bonusEligible?: boolean;
  hasForemanAssignment?: boolean;
  subcontractorsExpected?: boolean;
  budgetImported?: boolean;
  laborBudgetImported?: boolean;
  subcontractorDataImported?: boolean;
  actualCostsImported?: boolean;
  qbCustomerLinked?: boolean;
  qbBillingPresent?: boolean;
  qbArPresent?: boolean;
  qbIncomeSummaryPresent?: boolean;
  qbDetailCostPresent?: boolean;
}

function yearFrom(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? undefined : d.getFullYear();
}

function isInYear(value: string | undefined, year: number): boolean {
  return yearFrom(value) === year;
}

function billingYear(b: Billing): number | undefined {
  return yearFrom(b.billingPeriodEnd)
    ?? yearFrom(b.billingPeriodStart)
    ?? yearFrom(b.paymentDate)
    ?? (b.billingPeriod?.includes(String(LIFECYCLE_ACTIVITY_YEAR)) ? LIFECYCLE_ACTIVITY_YEAR : undefined);
}

export function normalizeProjectStatus(project: Project): NormalizedProjectStatus {
  if (project.projectStatus) {
    const s = project.projectStatus;
    if (s === 'OnHold') return 'OnHold';
    if (s === 'Archived') return 'Archived';
    return s as NormalizedProjectStatus;
  }

  const wip = project.wipStatus?.trim();
  if (wip === 'Complete') return 'Complete';
  if (wip === 'Closed' || project.status === 'Closed') return 'Closed';
  if (wip === 'Needs Review') return 'OnHold';
  if (wip === 'Pre Con') return 'Precon';
  if (wip === 'In Progress' || wip === 'T&M') return 'Active';

  switch (project.status) {
    case 'Lead / Precon':
      return 'Precon';
    case 'Awarded':
    case 'Setup Needed':
      return 'Upcoming';
    case 'Active':
      return 'Active';
    case 'Closeout':
      return 'Closeout';
    default:
      return 'Active';
  }
}

export function hasOpenProjectTasks(projectId: string, tasks: ProjectTask[] = []): boolean {
  return tasks.some(t =>
    t.projectId === projectId
    && t.status !== 'Complete'
    && t.status !== 'Canceled',
  );
}

export function detect2026Activity(input: ProjectLifecycleInput): {
  has2026Activity: boolean;
  billed2026: number;
  cost2026: number;
  ar2026: number;
} {
  const pid = input.project.id;
  let billed2026 = 0;
  let cost2026 = 0;
  let ar2026 = 0;
  let has2026Activity = false;

  for (const b of input.billings ?? []) {
    if (b.projectId !== pid) continue;
    if (billingYear(b) === LIFECYCLE_ACTIVITY_YEAR) {
      has2026Activity = true;
      billed2026 += b.currentApplication ?? b.workCompletedThisPeriod ?? 0;
    }
  }

  for (const ar of input.arRecords ?? []) {
    if (ar.projectId !== pid) continue;
    if (isInYear(ar.invoiceDate, LIFECYCLE_ACTIVITY_YEAR) || isInYear(ar.dueDate, LIFECYCLE_ACTIVITY_YEAR)) {
      has2026Activity = true;
      ar2026 += ar.openBalance ?? 0;
    }
  }

  for (const a of input.laborActuals ?? []) {
    if (a.projectId !== pid || a.approvalStatus !== 'Approved') continue;
    if (isInYear(a.workDate, LIFECYCLE_ACTIVITY_YEAR)) {
      has2026Activity = true;
      cost2026 += a.totalLaborCost ?? 0;
    }
  }

  for (const co of input.changeOrders ?? []) {
    if (co.projectId !== pid) continue;
      const date = co.dateApproved ?? co.dateSent ?? co.dateCreated;
    const dateStr = typeof date === 'string' ? date : undefined;
    if (isInYear(dateStr, LIFECYCLE_ACTIVITY_YEAR)) has2026Activity = true;
  }

  if (isInYear(input.project.closedDate, LIFECYCLE_ACTIVITY_YEAR)) has2026Activity = true;
  if (isInYear(input.project.qboCostDetailSyncedAt, LIFECYCLE_ACTIVITY_YEAR)) has2026Activity = true;
  if (isInYear(input.project.lastTimelogDate, LIFECYCLE_ACTIVITY_YEAR)) has2026Activity = true;
  if (input.project.status === 'Closeout' && (input.project.currentActivity?.includes('2026') || input.project.dashboardGroup?.includes('2026'))) {
    has2026Activity = true;
  }

  return { has2026Activity, billed2026, cost2026, ar2026 };
}

export function inferClosedDate(input: ProjectLifecycleInput): string | undefined {
  if (input.project.closedDate?.trim()) return input.project.closedDate.trim();
  const status = normalizeProjectStatus(input.project);
  if (!['Complete', 'Closed', 'Archived'].includes(status) && !isClosedProject(input.project)) return undefined;

  const pid = input.project.id;
  const dates: string[] = [];
  if (input.project.targetCompletionDate) dates.push(input.project.targetCompletionDate);

  for (const b of input.billings ?? []) {
    if (b.projectId !== pid) continue;
    if (b.billingPeriodEnd) dates.push(b.billingPeriodEnd);
    if (b.paymentDate) dates.push(b.paymentDate);
  }

  dates.sort();
  return dates.at(-1);
}

/** Legacy dashboard pin — does not override closed/archive lifecycle rules. */
export function isDashboardPinned(project: Project): boolean {
  return project.includeOnActiveDashboard === true;
}

/** User explicitly reopened a closed job (projectStatus Active overrides legacy closed fields). */
export function isExplicitlyReopened(project: Project): boolean {
  if (project.projectStatus !== 'Active') return false;
  return isClosedProject(project) || project.status === 'Closed';
}

/** Only explicit reopen counts as manually active for Active 2026 / WIP scope. */
export function isManuallyReopened(project: Project): boolean {
  return isExplicitlyReopened(project);
}

/** @deprecated Use isManuallyReopened — includeOnActiveDashboard alone does not reopen closed jobs. */
export function isManuallyActive(project: Project): boolean {
  return isManuallyReopened(project);
}

/** Closed / complete / archived — unless manually reopened. */
export function isExplicitlyClosed(project: Project): boolean {
  if (isManuallyReopened(project)) return false;
  if (project.projectStatus === 'Complete' || project.projectStatus === 'Closed' || project.projectStatus === 'Archived') {
    return true;
  }
  const wip = project.wipStatus?.trim();
  if (wip === 'Complete' || wip === 'Closed') return true;
  if (project.status === 'Closed') return true;
  const ns = normalizeProjectStatus(project);
  return ['Complete', 'Closed', 'Archived'].includes(ns);
}

function resolveClosedLifecycleGroup(
  input: {
    hasOpenAr: boolean;
    hasRetainage: boolean;
    has2026Activity: boolean;
    closedYear?: number;
    normalizedStatus: NormalizedProjectStatus;
    project: Project;
  },
): ProjectLifecycleGroup {
  const { hasOpenAr, hasRetainage, has2026Activity, closedYear, normalizedStatus, project } = input;
  const hasCloseoutAction = hasOpenAr
    || hasRetainage
    || normalizedStatus === 'Closeout'
    || project.status === 'Closeout';
  if (hasCloseoutAction) return 'Closeout';
  if (has2026Activity || closedYear === LIFECYCLE_ACTIVITY_YEAR) return 'Closed2026';
  return 'Archive';
}

function determineControlListGroup(
  project: Project,
  normalizedStatus: NormalizedProjectStatus,
  openWipWork: boolean,
  hasOpenAr: boolean,
): ProjectLifecycleGroup {
  if (normalizedStatus === 'Closeout' || project.status === 'Closeout') {
    return openWipWork || hasOpenAr ? 'Closeout' : 'NeedsReview';
  }
  if (normalizedStatus === 'Upcoming' || normalizedStatus === 'Precon') return 'Upcoming';
  if (normalizedStatus === 'OnHold') return 'NeedsReview';
  return 'Active';
}

export function hasOpenWipWork(input: ProjectLifecycleInput, hasOpenAr: boolean): boolean {
  const { project } = input;
  const pid = project.id;

  if (isManuallyReopened(project)) return true;

  if (isExplicitlyClosed(project)) {
    const openCos = (input.changeOrders ?? []).some(co => co.projectId === pid && isPendingCo(co));
    const openPayApps = (input.billings ?? []).some(b =>
      b.projectId === pid && ['Draft', 'Submitted'].includes(b.status ?? ''),
    );
    const openTasks = hasOpenProjectTasks(pid, input.tasks);
    return openCos || openPayApps || openTasks || hasOpenAr;
  }

  if (project.currentActivity?.trim()) return true;

  const openCos = (input.changeOrders ?? []).some(co => co.projectId === pid && isPendingCo(co));
  const openPayApps = (input.billings ?? []).some(b =>
    b.projectId === pid && ['Draft', 'Submitted', 'Approved', 'Invoiced'].includes(b.status ?? ''),
  );
  const openTasks = hasOpenProjectTasks(pid, input.tasks);
  const leftToBill = (project.wipLeftToBill ?? 0) > 0;
  const contract = project.originalContractAmount ?? project.fullContractReference ?? 0;
  const billed = project.billedToDate ?? 0;
  const hasBillingWork = contract > 0 && billed < contract;

  return openCos || openPayApps || openTasks || leftToBill || hasBillingWork || hasOpenAr;
}

export function upcomingHasWipSignals(project: Project, budgetLines: ProjectBudgetLine[] = []): boolean {
  const hasBudget = budgetLines.some(l => l.projectId === project.id)
    || (project.estCostBudget ?? 0) > 0
    || (project.originalContractAmount ?? 0) > 0
    || (project.fullContractReference ?? 0) > 0;
  return !!(
    hasBudget
    || project.startDate
    || project.targetCompletionDate
    || project.scopeSummary
    || project.dashboardGroup?.toLowerCase().includes('upcoming')
    || project.dashboardGroup?.toLowerCase().includes('pre')
  );
}

export function computeRetainageHeld(projectId: string, billings: Billing[] = []): number {
  return billings
    .filter(b => b.projectId === projectId && b.status !== 'Void' && b.status !== 'Draft')
    .reduce((s, b) => s + (b.retainageAmount ?? 0), 0);
}

export function hasDefaultScopeException(input: {
  hasOpenAr: boolean;
  projectLifecycleGroup: ProjectLifecycleGroup;
  hasRetainage: boolean;
  manuallyReopened: boolean;
}): boolean {
  if (input.manuallyReopened) return true;
  return input.projectLifecycleGroup === 'Closeout'
    && (input.hasOpenAr || input.hasRetainage);
}

export function shouldTrackActiveJobControls(snapshot: ProjectLifecycleSnapshot): boolean {
  if (snapshot.includeInArchive || snapshot.includeInClosed2026) return false;
  if (snapshot.isActive2026ControlJob) return true;
  return snapshot.includeInDefaultScope;
}

export function computeIncludeInDefaultScope(
  project: Project,
  group: ProjectLifecycleGroup,
  inControlList: boolean,
  manuallyReopened: boolean,
): boolean {
  if (isOverheadJob(project)) return false;
  if (group === 'Archive' || group === 'Closed2026') return false;
  if (isExplicitlyClosed(project) && !manuallyReopened) return false;
  if (inControlList && ['Active', 'Upcoming', 'Closeout', 'NeedsReview'].includes(group)) return true;
  if (manuallyReopened && ['Active', 'Upcoming', 'Closeout', 'NeedsReview'].includes(group)) return true;
  return false;
}

export function computeSeedGaps(input: ProjectLifecycleInput, group: ProjectLifecycleGroup): SeedCompletenessGap[] {
  const { project } = input;
  const gaps: SeedCompletenessGap[] = [];
  const activeLike = ['Active', 'Upcoming', 'Closeout', 'NeedsReview'].includes(group);
  const push = (field: string, label: string, category: SeedCompletenessGap['category'], blocksWorkflow = false) => {
    gaps.push({ field, label, category, blocksWorkflow });
  };

  if (!project.projectNumber?.trim()) push('projectNumber', 'Job number', 'identity');
  if (!project.projectName?.trim()) push('projectName', 'Project name', 'identity');
  if (!project.customer?.trim()) push('customer', 'Customer', 'identity', activeLike);
  if (!project.address?.trim()) push('address', 'Address', 'identity');
  if (!project.county?.trim() && activeLike) push('county', 'County', 'identity', activeLike);
  if (!project.status?.trim()) push('status', 'Project status', 'status', activeLike);
  if (!project.projectProfile && activeLike) push('projectProfile', 'Project profile', 'drive');
  if (!project.driveFolderId && !project.driveFolderUrl && activeLike) {
    push('driveFolderId', 'Drive folder link', 'drive', group === 'Active' || group === 'Closeout');
  }
  if (project.contractPending) {
    push(
      'contractPending',
      project.contractPendingNote ?? 'Pending — waiting on awarded contract / proposal amount.',
      'financials',
      false,
    );
  } else if (!(project.originalContractAmount ?? project.fullContractReference)) {
    push('originalContractAmount', 'Original contract amount', 'financials', group === 'Active');
  }
  if (!PROJECT_SETUP_DEFAULTS.budgetRequiredForSetup
    && !(project.estCostBudget ?? project.estLaborCost)
    && !input.budgetImported) {
    push('totalBudget', 'Total budget', 'financials', false);
  }
  if (!(project.estLaborCost ?? 0) && input.bonusEligible && !input.laborBudgetImported) {
    push('estLaborCost', 'Labor budget', 'financials', false);
  }
  if (!PROJECT_SETUP_DEFAULTS.qboSyncBlocksSetup && !input.qbCustomerLinked && activeLike && !project.customer?.trim()) {
    push('qboCustomer', 'QBO customer reference', 'identity', false);
  }
  if (['Complete', 'Closed', 'Archived'].includes(normalizeProjectStatus(project)) && !project.closedDate && !inferClosedDate(input)) {
    push('closedDate', 'Closed date', 'status');
  }
  if (isForemanSetupMissing(project, !!input.hasForemanAssignment)) {
    push('foreman', 'Foreman', 'team', input.bonusEligible === true);
  }
  // Wage order numbers are future compliance items — not setup completion blockers (June 2026).
  if (project.prevailingWage && !(project.estSubCost ?? 0)) {
    push('estSubCost', 'Subcontractor budget', 'financials', false);
  }
  if (activeLike && !project.billingNotStarted && !(project.billedToDate ?? 0) && !(input.billings ?? []).some(b => b.projectId === project.id) && !input.qbBillingPresent) {
    push('billingHistory', 'Billing / pay app history', 'reporting', false);
  }
  if (!PROJECT_SETUP_DEFAULTS.qboSyncBlocksSetup && activeLike && !(input.arRecords ?? []).some(a => a.projectId === project.id) && !input.qbArPresent) {
    push('arStatus', 'AR status', 'reporting', false);
  }
  if (!PROJECT_SETUP_DEFAULTS.qboSyncBlocksSetup && !input.actualCostsImported && !input.qbIncomeSummaryPresent && !input.qbDetailCostPresent && activeLike && !(project.actualCostToDate ?? 0)) {
    push('actualCostSummary', 'Actual cost summary', 'financials', false);
  }

  return gaps;
}

export function deriveSeedCompletenessStatus(gaps: SeedCompletenessGap[]): SeedCompletenessStatus {
  const blocking = gaps.filter(isSetupBlockingGap);
  if (!blocking.length) return 'Complete';
  if (blocking.some(g => g.field === 'customer')) return 'MissingCustomer';
  if (blocking.some(g => g.field === 'status')) return 'MissingStatus';
  if (blocking.some(g => g.field === 'driveFolderId' || g.field === 'projectProfile')) return 'MissingDrive';
  if (blocking.some(g => g.blocksWorkflow)) return 'NeedsReview';
  if (blocking.some(g => g.category === 'financials' && g.field !== 'contractPending')) return 'MissingFinancials';
  return 'NeedsReview';
}

export function setupBlockingGaps(gaps: SeedCompletenessGap[]): SeedCompletenessGap[] {
  return gaps.filter(isSetupBlockingGap);
}

export function computeProjectLifecycle(input: ProjectLifecycleInput): ProjectLifecycleSnapshot {
  const { project } = input;
  const normalizedStatus = normalizeProjectStatus(project);
  const reviewReasons: string[] = [];

  const openArRecords = (input.arRecords ?? []).filter(a =>
    a.projectId === project.id && isOpenArRecord(a.status),
  );
  const hasOpenAr = openArRecords.length > 0;
  const hasOpenTasks = hasOpenProjectTasks(project.id, input.tasks);
  const activity2026 = detect2026Activity(input);
  const closedDate = inferClosedDate(input);
  const closedYear = yearFrom(closedDate);
  const openWipWork = hasOpenWipWork(input, hasOpenAr);
  const hasRetainage = computeRetainageHeld(project.id, input.billings) > 0;
  const inControlList = isActive2026ControlJob(project.projectNumber);
  const manuallyReopened = isManuallyReopened(project);
  const explicitlyClosed = isExplicitlyClosed(project);

  let group: ProjectLifecycleGroup = 'Active';

  if (!project.projectNumber?.trim() || !project.projectName?.trim()) {
    group = 'NeedsReview';
    reviewReasons.push('Missing job number or project name');
  } else if (explicitlyClosed && !manuallyReopened) {
    group = resolveClosedLifecycleGroup({
      hasOpenAr,
      hasRetainage,
      has2026Activity: activity2026.has2026Activity,
      closedYear,
      normalizedStatus,
      project,
    });
  } else if (!inControlList && !manuallyReopened && isArchiveJobNumber(project.projectNumber)) {
    group = 'Archive';
  } else if (!inControlList && !manuallyReopened) {
    if (hasOpenAr || hasRetainage) {
      group = 'Closeout';
    } else {
      group = 'Archive';
    }
  } else {
    group = determineControlListGroup(project, normalizedStatus, openWipWork, hasOpenAr);
    if (project.seedActionRequired?.toLowerCase().includes('review')) {
      reviewReasons.push(project.seedActionRequired);
      if (group === 'Active' || group === 'Upcoming') group = 'NeedsReview';
    }
  }

  const includeInClosed2026 = group === 'Closed2026';
  const includeInArchive = group === 'Archive';
  const includeInDefaultScope = computeIncludeInDefaultScope(project, group, inControlList, manuallyReopened);

  const upcomingWipEligible = group === 'Upcoming' && upcomingHasWipSignals(project, input.budgetLines);
  const closeoutLiveWork = group === 'Closeout' && openWipWork && !(hasOpenAr && !openWipWork);
  const includeInActiveWip = !isOverheadJob(project)
    && !includeInArchive
    && !includeInClosed2026
    && !(explicitlyClosed && !manuallyReopened)
    && (inControlList || manuallyReopened)
    && (
      group === 'Active'
      || group === 'NeedsReview'
      || upcomingWipEligible
      || closeoutLiveWork
    );

  const includeInCloseoutAr = (explicitlyClosed || includeInArchive || includeInClosed2026 || group === 'Closeout')
    && (hasOpenAr || hasRetainage)
    && !includeInActiveWip;

  const includeInProjectsList = includeInDefaultScope;

  const trackControls = shouldTrackActiveJobControls({
    projectId: project.id,
    jobNumber: project.projectNumber,
    projectName: project.projectName,
    normalizedStatus,
    projectLifecycleGroup: group,
    isActive2026ControlJob: inControlList,
    includeInDefaultScope,
    includeInProjectsList,
    includeInActiveWip,
    includeInClosed2026,
    includeInArchive,
    includeInCloseoutAr,
    hasRetainage,
    closedDate,
    fiscalYear: closedYear ?? yearFrom(project.startDate),
    has2026Activity: activity2026.has2026Activity || closedYear === LIFECYCLE_ACTIVITY_YEAR,
    hasOpenWipWork: openWipWork,
    hasOpenAr,
    hasOpenTasks,
    hasOpenCompliance: false,
    seedCompletenessStatus: 'Complete',
    seedGaps: [],
    reviewReasons,
  });
  const seedGaps = trackControls ? computeSeedGaps(input, group) : [];
  const seedCompletenessStatus = deriveSeedCompletenessStatus(seedGaps);
  const derivedStartDate = deriveProjectStartDate(input);

  return {
    projectId: project.id,
    jobNumber: project.projectNumber,
    projectName: project.projectName,
    normalizedStatus,
    projectLifecycleGroup: group,
    isActive2026ControlJob: inControlList,
    includeInDefaultScope,
    includeInProjectsList,
    includeInActiveWip,
    includeInCloseoutAr,
    hasRetainage,
    includeInClosed2026,
    includeInArchive,
    closedDate,
    fiscalYear: closedYear ?? yearFrom(derivedStartDate ?? project.startDate),
    has2026Activity: activity2026.has2026Activity || closedYear === LIFECYCLE_ACTIVITY_YEAR,
    hasOpenWipWork: openWipWork,
    hasOpenAr,
    hasOpenTasks,
    hasOpenCompliance: false,
    seedCompletenessStatus,
    seedGaps,
    derivedStartDate,
    billed2026: activity2026.billed2026,
    cost2026: activity2026.cost2026,
    ar2026: activity2026.ar2026,
    reviewReasons,
  };
}

export function matchesProjectsListView(snapshot: ProjectLifecycleSnapshot, view: string, searchQuery = ''): boolean {
  if (searchQuery.trim()) return true;
  switch (view) {
    case 'all':
      return true;
    case 'default':
    case 'active':
      return snapshot.includeInDefaultScope;
    case 'upcoming':
      return snapshot.includeInDefaultScope && snapshot.projectLifecycleGroup === 'Upcoming';
    case 'closeout':
      return snapshot.projectLifecycleGroup === 'Closeout'
        && (snapshot.includeInDefaultScope || snapshot.includeInCloseoutAr);
    case 'closed2026':
      return snapshot.includeInClosed2026;
    case 'archive':
      return snapshot.includeInArchive;
    case 'needsReview':
      return snapshot.projectLifecycleGroup === 'NeedsReview'
        && snapshot.includeInDefaultScope;
    default:
      return snapshot.includeInDefaultScope;
  }
}

export function shouldCreateDriveLinkTask(snapshot: ProjectLifecycleSnapshot, project: Project): boolean {
  if (isOverheadJob(project)) return false;
  if (!shouldTrackActiveJobControls(snapshot)) return false;
  if (!snapshot.includeInDefaultScope) return false;
  if (project.driveFolderId || project.driveFolderUrl) return false;
  return snapshot.projectLifecycleGroup === 'Active'
    || snapshot.projectLifecycleGroup === 'Closeout'
    || snapshot.projectLifecycleGroup === 'Upcoming';
}

export function shouldCreateDriveFolderTasks(snapshot: ProjectLifecycleSnapshot, project: Project): boolean {
  if (isOverheadJob(project) || !project.driveFolderId) return false;
  if (!shouldTrackActiveJobControls(snapshot)) return false;
  return snapshot.includeInProjectsList || snapshot.projectLifecycleGroup === 'Closeout';
}
