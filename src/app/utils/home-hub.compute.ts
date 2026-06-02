import { Active2026ControlRow } from '../models/active-2026-control.types';
import { matchesControlSegment } from './active-2026-control.compute';

export type HomePrioritySeverity = 'error' | 'warning';

export type HomePrioritySource = 'QB' | 'Drive' | 'Time' | 'Manual';

export interface HomePriorityItem {
  id: string;
  jobNumber?: string;
  projectName?: string;
  projectId?: string;
  issue: string;
  severity: HomePrioritySeverity;
  nextActionLabel: string;
  route: string;
  queryParams?: Record<string, string>;
  fragment?: string;
  source: HomePrioritySource;
  rank: number;
}

export interface HomeSnapshotRow {
  projectId: string;
  jobNumber: string;
  projectName: string;
  health: 'Green' | 'Yellow' | 'Red';
  marginPct: number;
  arBalance: number;
  leftToBill: number;
  nextActionLabel: string;
  nextActionRoute: string;
  importance: number;
}

const HOME_SOURCE_HEALTH_IDS = new Set([
  'master-time',
  'qb-workbook',
  'drive-folders',
  'labor-codes',
  'sub-discovery',
  'import-exceptions',
]);

export function isHomeSourceHealthRow(id: string): boolean {
  return HOME_SOURCE_HEALTH_IDS.has(id);
}

export function homeSourceHealthLabel(label: string): string {
  switch (label) {
    case 'Master Time Sheet':
      return 'Master Time';
    case 'QuickBooks Sync':
      return 'QuickBooks';
    case 'Drive Folder Links':
      return 'Drive';
    case 'Labor Code Discovery':
      return 'Labor Codes';
    case 'Subcontractor Discovery':
      return 'Subcontractor Discovery';
    case 'Source Review':
      return 'Source Review';
    default:
      return label;
  }
}

export function homeSourceHealthRoute(id: string): string {
  switch (id) {
    case 'master-time':
      return '/settings';
    case 'qb-workbook':
      return '/settings';
    case 'drive-folders':
      return '/settings';
    case 'labor-codes':
      return '/settings';
    case 'sub-discovery':
      return '/subcontractors';
    case 'import-exceptions':
      return '/settings';
    default:
      return '/settings';
  }
}

export function homeSourceHealthFragment(id: string): string | undefined {
  switch (id) {
    case 'master-time':
    case 'qb-workbook':
      return 'source-health';
    case 'drive-folders':
      return 'import-center';
    case 'labor-codes':
      return 'import-center';
    case 'import-exceptions':
      return 'review-center';
    default:
      return undefined;
  }
}

export function buildHomePriorities(input: {
  rows: Active2026ControlRow[];
  qbSyncWarning: boolean;
  unmatchedSourceCount: number;
}): HomePriorityItem[] {
  const items: HomePriorityItem[] = [];

  for (const row of input.rows) {
    if (row.missingContract && !row.contractPending) {
      items.push({
        id: `${row.projectId}-missing-contract`,
        jobNumber: row.jobNumber,
        projectName: row.projectName,
        projectId: row.projectId,
        issue: 'Missing contract on active job',
        severity: 'error',
        nextActionLabel: row.nextAction.label,
        route: row.nextAction.route,
        queryParams: row.nextAction.queryParams,
        fragment: row.nextAction.fragment,
        source: 'Manual',
        rank: 10,
      });
    }

    if (!row.driveLinked) {
      items.push({
        id: `${row.projectId}-missing-drive`,
        jobNumber: row.jobNumber,
        projectName: row.projectName,
        projectId: row.projectId,
        issue: 'Missing Drive link on active job',
        severity: 'warning',
        nextActionLabel: 'Link Drive folder',
        route: '/settings',
        fragment: 'drive-folders',
        source: 'Drive',
        rank: 70,
      });
    }

    if (row.budgetBasis === 'EstimatedFrom20PercentTarget' || (row.missingBudget && row.budgetBasis !== 'Missing')) {
      items.push({
        id: `${row.projectId}-budget-estimate`,
        jobNumber: row.jobNumber,
        projectName: row.projectName,
        projectId: row.projectId,
        issue: 'Budget estimate needs confirmation',
        severity: 'warning',
        nextActionLabel: 'Confirm budget',
        route: `/projects/${row.projectId}`,
        fragment: 'money',
        source: 'Manual',
        rank: 80,
      });
    }
  }

  if (input.qbSyncWarning) {
    items.push({
      id: 'qb-sync-warning',
      issue: 'QuickBooks sync warning',
      severity: 'warning',
      nextActionLabel: 'Re-sync QuickBooks',
      route: '/settings',
      fragment: 'source-health',
      source: 'QB',
      rank: 50,
    });
  }

  if (input.unmatchedSourceCount > 0) {
    items.push({
      id: 'unmatched-sources',
      issue: `${input.unmatchedSourceCount} unmatched source row${input.unmatchedSourceCount === 1 ? '' : 's'}`,
      severity: 'warning',
      nextActionLabel: 'Review sources',
      route: '/settings',
      fragment: 'review-center',
      source: 'Manual',
      rank: 60,
    });
  }

  return items
    .sort((a, b) => a.rank - b.rank || (a.severity === 'error' && b.severity !== 'error' ? -1 : 0))
    .slice(0, 12);
}

export function rankSnapshotImportance(row: Active2026ControlRow): number {
  let score = 0;
  if (row.healthStatus === 'Red') score += 1000;
  else if (row.healthStatus === 'Yellow') score += 500;
  if (row.missingContract) score += 400;
  score += row.missingItemCount * 15;
  return score;
}

export function buildHomeSnapshotRows(rows: Active2026ControlRow[], limit = 10): HomeSnapshotRow[] {
  return [...rows]
    .sort((a, b) => rankSnapshotImportance(b) - rankSnapshotImportance(a) || a.jobNumber.localeCompare(b.jobNumber))
    .slice(0, limit)
    .map(row => ({
      projectId: row.projectId,
      jobNumber: row.jobNumber,
      projectName: row.projectName,
      health: row.healthStatus,
      marginPct: row.projectedMarginPct,
      arBalance: row.arBalance,
      leftToBill: row.leftToBill,
      nextActionLabel: row.nextAction.label,
      nextActionRoute: row.nextAction.route,
      importance: rankSnapshotImportance(row),
    }));
}

export function countBillingActions(rows: Active2026ControlRow[]): number {
  return rows.filter(row => matchesControlSegment(row, 'billing')).length;
}
