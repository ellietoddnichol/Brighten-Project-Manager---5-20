import { FinancialMetrics, WIPRecord, WipGroup } from '../models/financial.types';
import { BRIGHTEN_PROFIT_TARGET } from '../config/active-2026-jobs.config';
import { wipGroupLabel } from './wip.compute';

export type WipPageSegmentId =
  | 'activeWip'
  | 'upcoming'
  | 'closeoutAr'
  | 'needsReview'
  | 'archive'
  | 'all';

export interface WipHubSummary {
  activeWipJobs: number;
  activeWipContract: number;
  projectedMarginPct: number;
  overUnderBilling: number;
  closeoutAr: number;
  currentContract: number;
  budgetEfc: number;
  actualCost: number;
  billedToDate: number;
  openAr: number;
  jobsUnder20: number;
  missingContract: number;
  missingActualCostSource: number;
}

export const WIP_PAGE_SEGMENT_OPTIONS: { id: WipPageSegmentId; label: string }[] = [
  { id: 'activeWip', label: 'Active WIP' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closeoutAr', label: 'Closeout AR' },
  { id: 'needsReview', label: 'Needs Review' },
  { id: 'archive', label: 'Archive / Excluded' },
  { id: 'all', label: 'All' },
];

const MARGIN_TARGET = BRIGHTEN_PROFIT_TARGET * 100;

export function normalizeWipPageSegment(value: string | null | undefined): WipPageSegmentId {
  if (!value) return 'activeWip';
  const allowed = new Set(WIP_PAGE_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as WipPageSegmentId) ? (value as WipPageSegmentId) : 'activeWip';
}

export function wipGroupForSegment(segment: WipPageSegmentId): WipGroup | null {
  switch (segment) {
    case 'activeWip': return 'ActiveWIP';
    case 'upcoming': return 'UpcomingWIP';
    case 'closeoutAr': return 'CloseoutAR';
    case 'archive': return 'ExcludedArchive';
    default: return null;
  }
}

export function matchesWipPageSegment(record: WIPRecord, segment: WipPageSegmentId): boolean {
  switch (segment) {
    case 'activeWip':
      return record.wipGroup === 'ActiveWIP';
    case 'upcoming':
      return record.wipGroup === 'UpcomingWIP';
    case 'closeoutAr':
      return record.wipGroup === 'CloseoutAR';
    case 'needsReview':
      return !!record.needsReview || (record.warningChips?.some(c => c.tone === 'critical' || c.tone === 'amber') ?? false);
    case 'archive':
      return record.wipGroup === 'ExcludedArchive';
    case 'all':
    default:
      return true;
  }
}

export function activeWipRecords(records: WIPRecord[]): WIPRecord[] {
  return records.filter(r => r.wipGroup === 'ActiveWIP');
}

export function summarizeWipHub(records: WIPRecord[], metrics: FinancialMetrics): WipHubSummary {
  const active = records.filter(r => r.wipGroup === 'ActiveWIP' || r.wipGroup === 'UpcomingWIP');
  const activeOnly = records.filter(r => r.wipGroup === 'ActiveWIP');
  const closeout = records.filter(r => r.wipGroup === 'CloseoutAR');

  const sum = (list: WIPRecord[], pick: (r: WIPRecord) => number) =>
    list.reduce((s, r) => s + pick(r), 0);

  const activeContract = sum(activeOnly, r => r.contractAmount);
  const activeGp = sum(activeOnly, r => r.forecastGrossProfit);

  return {
    activeWipJobs: activeOnly.length,
    activeWipContract: activeContract,
    projectedMarginPct: activeContract > 0 ? (activeGp / activeContract) * 100 : metrics.forecastMargin,
    overUnderBilling: sum(activeOnly, r => r.overUnderBilling),
    closeoutAr: sum(closeout, r => r.arBalance),
    currentContract: sum(active, r => r.contractAmount),
    budgetEfc: sum(activeOnly, r => r.estimatedFinalCost),
    actualCost: sum(activeOnly, r => r.costToDate),
    billedToDate: sum(activeOnly, r => r.billedToDate),
    openAr: sum(records, r => r.arBalance),
    jobsUnder20: activeOnly.filter(r => r.contractAmount > 0 && r.forecastMargin < MARGIN_TARGET).length,
    missingContract: activeOnly.filter(r => !r.contractAmount).length,
    missingActualCostSource: activeOnly.filter(r =>
      r.wipConfidence === 'NeedsSource'
      || r.warningChips?.some(c => c.label.includes('Labor actuals') || c.label.includes('QB cost detail')),
    ).length,
  };
}

export function wipHubCsvRows(records: WIPRecord[]): unknown[][] {
  return records.map(r => [
    r.jobNumber,
    r.projectName,
    r.customer,
    wipGroupLabel(r.wipGroup),
    r.lifecycleLabel,
    r.budgetBasisLabel,
    r.wipConfidence,
    r.contractAmount,
    r.budgetAmount,
    r.estimatedFinalCost,
    r.costToDate,
    r.billedToDate,
    r.earnedRevenue,
    r.overUnderBilling,
    r.forecastMargin,
    r.arBalance,
    r.nextAction,
    (r.warningChips ?? []).map(c => c.label).join('; '),
  ]);
}

export const WIP_HUB_CSV_HEADERS = [
  'Job', 'Project', 'Customer', 'WIP Group', 'Lifecycle', 'Budget Basis', 'Confidence',
  'Contract', 'Budget', 'Est Final Cost', 'Actual Cost', 'Billed', 'Earned',
  'Over/Under', 'Projected Margin %', 'Open AR', 'Next Action', 'Warnings',
];

export function sortWipRecords(records: WIPRecord[]): WIPRecord[] {
  const groupRank = (g: WipGroup) => {
    switch (g) {
      case 'ActiveWIP': return 1;
      case 'UpcomingWIP': return 2;
      case 'CloseoutAR': return 3;
      case 'NeedsReview': return 4;
      default: return 5;
    }
  };
  return [...records].sort((a, b) =>
    groupRank(a.wipGroup) - groupRank(b.wipGroup)
    || (a.jobNumber ?? '').localeCompare(b.jobNumber ?? '', undefined, { numeric: true }),
  );
}
