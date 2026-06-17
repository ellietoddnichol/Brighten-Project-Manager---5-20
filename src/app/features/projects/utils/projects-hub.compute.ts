import { BRIGHTEN_PROFIT_TARGET } from '@app/config/active-2026-jobs.config';
import { ProjectFinancial } from '@app/models/financial.types';
import { ProjectLifecycleSnapshot, ProjectsListView } from '@app/models/project-lifecycle.types';
import { PROJECT_PROFILE_LABELS, ProjectProfile } from '@app/models/project-requirements.types';
import { Project } from '@app/models/types';
import { matchesProjectsListView } from '@features/projects/utils/project-lifecycle.compute';
import { manualFirstConfig } from '@app/config/manual-first.config';

export type ProjectWarningKind = 'critical' | 'setup';

export interface ProjectListWarning {
  id: string;
  label: string;
  kind: ProjectWarningKind;
}

export interface ProjectListRow {
  project: Project;
  lifecycle: ProjectLifecycleSnapshot;
  financial: ProjectFinancial;
  displayStatus: string;
  profileLabel: string;
  health: 'Green' | 'Yellow' | 'Red' | 'Neutral';
  warnings: ProjectListWarning[];
  nextActionLabel: string;
  nextActionRoute: string;
  moneySecondaryLabel: string;
  moneySecondaryValue: number;
  moneySecondaryAlert: boolean;
  quietRow: boolean;
  driveLinked: boolean;
}

export interface ProjectsHubSummary {
  activeJobs: number;
  upcoming: number;
  closeoutAr: number;
  needsReview: number;
  closed2026Hidden: number;
  archiveHidden: number;
  missingDrive: number;
  missingContract: number;
  missingSetup: number;
}

export type ProjectsAdvancedFilterId =
  | 'missingContract'
  | 'missingBudget'
  | 'missingDrive'
  | 'openAr'
  | 'under20Margin'
  | 'cprDecision'
  | 'sourceReview';

export interface ProjectsAdvancedFilters {
  customer: string;
  pm: string;
  foreman: string;
  profile: string;
  flags: Set<ProjectsAdvancedFilterId>;
}

export const PROJECTS_VIEW_OPTIONS: { id: ProjectsListView; label: string }[] = [
  { id: 'default', label: 'Active' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closeout', label: 'Closeout' },
  { id: 'closed2026', label: 'Closed 2026' },
  { id: 'archive', label: 'Archive' },
  { id: 'needsReview', label: 'Needs Review' },
  { id: 'all', label: 'All' },
];

export function normalizeProjectsViewParam(view: string | null | undefined): ProjectsListView {
  if (!view) return 'default';
  if (view === 'active') return 'default';
  const allowed = new Set(PROJECTS_VIEW_OPTIONS.map(o => o.id));
  return allowed.has(view as ProjectsListView) ? (view as ProjectsListView) : 'default';
}

export function projectDisplayStatus(snapshot: ProjectLifecycleSnapshot): string {
  switch (snapshot.projectLifecycleGroup) {
    case 'Active':
      return 'Active';
    case 'Upcoming':
      return 'Upcoming';
    case 'Closeout':
      return 'Closeout';
    case 'Closed2026':
      return 'Closed';
    case 'Archive':
      return 'Archived';
    case 'NeedsReview':
      return 'Needs Review';
    default:
      return snapshot.normalizedStatus === 'Archived' ? 'Archived' : 'Active';
  }
}

export function profileLabelFor(project: Project): string {
  if (project.projectProfile) {
    return PROJECT_PROFILE_LABELS[project.projectProfile as ProjectProfile] ?? project.projectProfile;
  }
  return '—';
}

function isQuietRow(snapshot: ProjectLifecycleSnapshot): boolean {
  return snapshot.includeInArchive
    || snapshot.includeInClosed2026
    || snapshot.projectLifecycleGroup === 'Archive'
    || snapshot.projectLifecycleGroup === 'Closed2026';
}

export function buildProjectWarnings(input: {
  project: Project;
  lifecycle: ProjectLifecycleSnapshot;
  financial: ProjectFinancial;
  sourceReviewIssue?: boolean;
}): ProjectListWarning[] {
  if (manualFirstConfig.hideMainWorkflowWarnings) {
    return [];
  }
  if (isQuietRow(input.lifecycle)) {
    return [];
  }

  const warnings: ProjectListWarning[] = [];
  const push = (id: string, label: string, kind: ProjectWarningKind) => {
    warnings.push({ id, label, kind });
  };

  const contract = input.financial.currentContractAmount;

  if ((!contract || input.financial.budgetBasis === 'MissingContract') && !input.project.contractPending) {
    push('missing-contract', 'Missing contract', 'critical');
  }
  if (input.financial.billedToDate > contract && contract > 0) {
    push('billed-over', 'Billed over contract', 'critical');
  }
  if (input.financial.budgetAmount > 0 && input.financial.costToDate > input.financial.budgetAmount) {
    push('over-budget', 'Over budget', 'critical');
  }

  if (!input.project.driveFolderId && !input.project.driveFolderUrl) {
    push('missing-drive', 'Missing Drive', 'setup');
  }
  if (!input.project.projectProfile) {
    push('missing-profile', 'Missing profile', 'setup');
  }
  if (input.financial.budgetIsEstimated || input.financial.budgetBasis === 'EstimatedFrom20PercentTarget') {
    push('budget-estimate', 'Confirm budget estimate', 'setup');
  }
  if (input.sourceReviewIssue) {
    push('source-review', 'Source review issue', 'setup');
  }

  const critical = warnings.filter(w => w.kind === 'critical');
  const setup = warnings.filter(w => w.kind === 'setup');
  return [...critical, ...setup].slice(0, 2);
}

export function deriveProjectHealth(warnings: ProjectListWarning[]): 'Green' | 'Yellow' | 'Red' | 'Neutral' {
  if (warnings.some(w => w.kind === 'critical')) return 'Red';
  if (warnings.some(w => w.kind === 'setup')) return 'Yellow';
  return 'Green';
}

function deriveNextAction(project: Project, lifecycle: ProjectLifecycleSnapshot, financial: ProjectFinancial, warnings: ProjectListWarning[]): { label: string; route: string } {
  const pid = project.id;
  const top = warnings[0];
  if (top?.id === 'missing-contract') return { label: 'Add contract', route: `/projects/${pid}`, };
  if (top?.id === 'missing-drive') return { label: 'Link Drive', route: `/projects/${pid}`, };
  if (financial.leftToBill > 0 && lifecycle.projectLifecycleGroup !== 'Archive') {
    return { label: 'Review billing', route: `/projects/${pid}`, };
  }
  if (project.currentActivity?.trim()) {
    return { label: project.currentActivity.trim().slice(0, 40), route: `/projects/${pid}` };
  }
  if (lifecycle.projectLifecycleGroup === 'Closeout' && lifecycle.hasOpenAr) {
    return { label: 'Closeout AR', route: `/projects/${pid}`, };
  }
  return { label: 'Open project', route: `/projects/${pid}` };
}

export function buildProjectListRow(input: {
  project: Project;
  lifecycle: ProjectLifecycleSnapshot;
  financial: ProjectFinancial;
  arRecords: { projectId: string; status: string; dueDate?: string; openBalance?: number }[];
  sourceReviewIssue?: boolean;
}): ProjectListRow {
  const warnings = buildProjectWarnings({
    project: input.project,
    lifecycle: input.lifecycle,
    financial: input.financial,
    sourceReviewIssue: input.sourceReviewIssue,
  });
  const next = deriveNextAction(input.project, input.lifecycle, input.financial, warnings);
  const leftToBill = input.financial.leftToBill ?? 0;

  return {
    project: input.project,
    lifecycle: input.lifecycle,
    financial: input.financial,
    displayStatus: projectDisplayStatus(input.lifecycle),
    profileLabel: profileLabelFor(input.project),
    health: isQuietRow(input.lifecycle) && !warnings.length ? 'Neutral' : deriveProjectHealth(warnings),
    warnings,
    nextActionLabel: next.label,
    nextActionRoute: next.route,
    moneySecondaryLabel: 'Left to bill',
    moneySecondaryValue: leftToBill,
    moneySecondaryAlert: false,
    quietRow: isQuietRow(input.lifecycle),
    driveLinked: !!(input.project.driveFolderId || input.project.driveFolderUrl),
  };
}

export function summarizeProjectsHub(
  snapshots: ProjectLifecycleSnapshot[],
  rows: ProjectListRow[],
): ProjectsHubSummary {
  const countView = (view: ProjectsListView) =>
    snapshots.filter(s => matchesProjectsListView(s, view)).length;

  const activeScope = rows.filter(r => r.lifecycle.includeInDefaultScope);
  const missingDrive = activeScope.filter(r => !r.driveLinked).length;
  const missingContract = activeScope.filter(r =>
    !r.project.contractPending
    && (!r.financial.currentContractAmount || r.financial.budgetBasis === 'MissingContract'),
  ).length;
  const missingSetup = activeScope.filter(r =>
    r.warnings.some(w => w.kind === 'setup'),
  ).length;

  return {
    activeJobs: countView('default'),
    upcoming: countView('upcoming'),
    closeoutAr: countView('closeout'),
    needsReview: countView('needsReview'),
    closed2026Hidden: countView('closed2026'),
    archiveHidden: countView('archive'),
    missingDrive,
    missingContract,
    missingSetup,
  };
}

export function matchesProjectsAdvancedFilters(
  row: ProjectListRow,
  filters: ProjectsAdvancedFilters,
): boolean {
  const { project, lifecycle, financial } = row;
  if (filters.customer !== 'all' && project.customer !== filters.customer) return false;
  if (filters.pm !== 'all' && (project.projectManager ?? '') !== filters.pm) return false;
  if (filters.foreman !== 'all' && (project.superintendent ?? '') !== filters.foreman) return false;
  if (filters.profile !== 'all' && (project.projectProfile ?? '') !== filters.profile) return false;

  if (!filters.flags.size) return true;

  for (const flag of filters.flags) {
    switch (flag) {
      case 'missingContract':
        if (project.contractPending) return false;
        if (financial.currentContractAmount && financial.budgetBasis !== 'MissingContract') return false;
        break;
      case 'missingBudget':
        if (financial.budgetAmount > 0 || financial.budgetIsEstimated) return false;
        break;
      case 'missingDrive':
        if (row.driveLinked) return false;
        break;
      case 'openAr':
        if (!(financial.arBalance > 0) && !lifecycle.hasOpenAr) return false;
        break;
      case 'under20Margin':
        if (!(financial.currentContractAmount > 0 && financial.forecastMargin < BRIGHTEN_PROFIT_TARGET * 100)) return false;
        break;
      case 'cprDecision':
        if (!(project.prevailingWage && !project.wageOrderNumber?.trim())) return false;
        break;
      case 'sourceReview':
        if (!row.warnings.some(w => w.id === 'source-review')) return false;
        break;
    }
  }
  return true;
}

export function projectsEmptyMessage(view: ProjectsListView, hasSearch: boolean): { title: string; hint?: string } {
  if (hasSearch) {
    return { title: 'No jobs match your search.' };
  }
  switch (view) {
    case 'default':
      return {
        title: 'No jobs in this view.',
        hint: 'Closed and archived jobs are hidden from Active. Use All to search every historical job.',
      };
    case 'upcoming':
      return { title: 'No upcoming jobs in this view.' };
    case 'closeout':
      return { title: 'No closeout or AR follow-up jobs right now.' };
    case 'closed2026':
      return { title: 'No Closed 2026 jobs in this view.' };
    case 'archive':
      return { title: 'No archived jobs in this view.' };
    case 'needsReview':
      return { title: 'No jobs need review right now.' };
    case 'all':
      return { title: 'No projects loaded.' };
    default:
      return { title: 'No jobs in this view.' };
  }
}

export function projectsCsvRows(rows: ProjectListRow[]): unknown[][] {
  return rows.map(r => [
    r.project.projectNumber,
    r.project.projectName,
    r.project.customer ?? '',
    r.displayStatus,
    r.profileLabel,
    r.financial.currentContractAmount,
    r.financial.billedToDate,
    r.moneySecondaryLabel === 'AR' ? r.moneySecondaryValue : '',
    r.moneySecondaryLabel === 'Left to bill' ? r.moneySecondaryValue : '',
    r.health,
    r.warnings.map(w => w.label).join('; '),
    r.nextActionLabel,
    r.driveLinked ? 'Linked' : 'Missing',
  ]);
}
