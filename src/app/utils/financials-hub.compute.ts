import { BRIGHTEN_PROFIT_TARGET } from '../config/active-2026-jobs.config';
import {
  ARRecord,
  FinancialMetrics,
  ProjectFinancial,
  WIPRecord,
  WipGroup,
} from '../models/financial.types';
import { ForemanBonusRecord } from '../models/foreman-bonus.types';
import { Billing, ChangeOrder, PO, Project } from '../models/types';
import { isApprovedUnbilledCo } from '../utils/change-management';
import { resolveProjectLabel } from '../utils/project';
import { budgetBasisDisplayLabel, isOpenArRecord } from '../utils/wip.compute';
import { ArComputeContext, buildArJobRows } from './ar.compute';

export type FinancialsSegmentId =
  | 'overview'
  | 'wip'
  | 'ar'
  | 'billing'
  | 'commitments'
  | 'bonuses'
  | 'sources';

export type FinancialsOverviewSection =
  | 'underMargin'
  | 'collections'
  | 'billing'
  | 'approvedCo'
  | 'sources';

export type WipHubFilterId =
  | 'all'
  | 'under20'
  | 'missingBudget'
  | 'missingContract'
  | 'overbilled'
  | 'needsReview'
  | 'activeOnly';

export type CommitmentFilterId =
  | 'all'
  | 'open'
  | 'notInQb'
  | 'missingProject'
  | 'overBudget'
  | 'needsReview';

export interface FinancialsActionRow {
  id: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  issueType: string;
  amount: number;
  severity: 'error' | 'warning';
  nextAction: string;
  route: string;
  section?: FinancialsOverviewSection;
}

export interface FinancialsWipRow {
  record: WIPRecord;
  budgetBasisLabel: string;
  warnings: string[];
  nextAction: string;
}

export interface FinancialsArJobRow {
  projectId: string;
  jobNumber: string;
  projectName: string;
  customer: string;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  totalOpen: number;
  collectionStatus: string;
  nextAction: string;
  isCloseout: boolean;
}

export interface FinancialsBillingRow {
  id: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  issue: string;
  amount: number;
  status: string;
  group: 'approvedCo' | 'draftPayApp' | 'submitted' | 'leftToBill' | 'sourceWarning';
  nextAction: string;
}

export interface FinancialsCommitmentRow {
  id: string;
  poNumber: string;
  jobLabel: string;
  vendor: string;
  amount: number;
  status: string;
  source: string;
  matchStatus: string;
  nextAction: string;
  po: PO;
}

export interface FinancialsBonusRow {
  record: ForemanBonusRecord;
  jobNumber: string;
  projectName: string;
  nextAction: string;
}

export interface FinancialsSourceRow {
  id: string;
  label: string;
  detail: string;
  severity: 'error' | 'warning';
  route: string;
  fragment?: string;
}

export const FINANCIALS_SEGMENT_OPTIONS: { id: FinancialsSegmentId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'wip', label: 'WIP' },
  { id: 'ar', label: 'AR' },
  { id: 'billing', label: 'Billing' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'bonuses', label: 'Bonuses' },
  { id: 'sources', label: 'Sources' },
];

export const WIP_HUB_FILTER_OPTIONS: { id: WipHubFilterId; label: string }[] = [
  { id: 'activeOnly', label: 'Active only' },
  { id: 'all', label: 'All' },
  { id: 'under20', label: 'Under 20%' },
  { id: 'missingBudget', label: 'Missing budget' },
  { id: 'missingContract', label: 'Missing contract' },
  { id: 'overbilled', label: 'Overbilled' },
  { id: 'needsReview', label: 'Needs Review' },
];

export function normalizeFinancialsSegment(value: string | null | undefined): FinancialsSegmentId {
  if (!value) return 'overview';
  const allowed = new Set(FINANCIALS_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as FinancialsSegmentId) ? (value as FinancialsSegmentId) : 'overview';
}

export function budgetBasisLabel(financial: ProjectFinancial): string {
  return budgetBasisDisplayLabel(financial);
}

const MARGIN_TARGET = BRIGHTEN_PROFIT_TARGET * 100;

export function countJobsUnderMargin(wipRecords: WIPRecord[]): number {
  return wipRecords.filter(w =>
    w.wipGroup === 'ActiveWIP'
    && w.contractAmount > 0
    && w.forecastMargin < MARGIN_TARGET,
  ).length;
}

export function buildFinancialsOverviewRows(input: {
  wipRecords: WIPRecord[];
  arRecords: ARRecord[];
  changeOrders: ChangeOrder[];
  billings: Billing[];
  projects: Project[];
  importReviewCount: number;
  qbWarnings: string[];
}): FinancialsActionRow[] {
  const rows: FinancialsActionRow[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const w of input.wipRecords) {
    if (!['ActiveWIP', 'UpcomingWIP'].includes(w.wipGroup)) continue;
    if (w.contractAmount > 0 && w.forecastMargin < MARGIN_TARGET) {
      rows.push({
        id: `margin-${w.projectId}`,
        jobNumber: w.jobNumber ?? '—',
        projectName: w.projectName ?? '—',
        projectId: w.projectId,
        issueType: `Margin under ${MARGIN_TARGET}%`,
        amount: w.forecastGrossProfit,
        severity: w.forecastMargin < MARGIN_TARGET * 0.5 ? 'error' : 'warning',
        nextAction: 'Review margin',
        route: `/projects/${w.projectId}`,
        section: 'underMargin',
      });
    }
  }

  const openAr = input.arRecords.filter(r => isOpenArRecord(r.status));
  const arByProject = new Map<string, ARRecord[]>();
  for (const r of openAr) {
    const list = arByProject.get(r.projectId) ?? [];
    list.push(r);
    arByProject.set(r.projectId, list);
  }
  for (const [projectId, recs] of arByProject) {
    const total = recs.reduce((s, r) => s + r.openBalance, 0);
    const pastDue = recs.some(r => r.dueDate && r.dueDate.slice(0, 10) < today);
    const first = recs[0];
    rows.push({
      id: `ar-${projectId}`,
      jobNumber: first.jobNumber ?? '—',
      projectName: first.projectName ?? '—',
      projectId,
      issueType: pastDue ? 'AR past due — collections' : 'Open AR balance',
      amount: total,
      severity: pastDue ? 'error' : 'warning',
      nextAction: 'Follow up AR',
      route: '/ar',
      section: 'collections',
    });
  }

  for (const w of input.wipRecords) {
    if (!['ActiveWIP', 'UpcomingWIP'].includes(w.wipGroup)) continue;
    if (w.leftToBill > 5000) {
      rows.push({
        id: `ltb-${w.projectId}`,
        jobNumber: w.jobNumber ?? '—',
        projectName: w.projectName ?? '—',
        projectId: w.projectId,
        issueType: 'Left to bill',
        amount: w.leftToBill,
        severity: 'warning',
        nextAction: 'Create pay app',
        route: `/projects/${w.projectId}`,
        section: 'billing',
      });
    }
  }

  for (const co of input.changeOrders.filter(isApprovedUnbilledCo)) {
    const project = input.projects.find(p => p.id === co.projectId);
    rows.push({
      id: `co-${co.id}`,
      jobNumber: project?.projectNumber ?? '—',
      projectName: project?.projectName ?? co.title ?? 'Change order',
      projectId: co.projectId,
      issueType: 'Approved CO not billed',
      amount: co.approvedAmount ?? co.totalAmount ?? 0,
      severity: 'warning',
      nextAction: 'Bill change order',
      route: '/billing',
      section: 'approvedCo',
    });
  }

  for (const b of input.billings.filter(x => ['Draft', 'Submitted'].includes(x.status ?? ''))) {
    const project = input.projects.find(p => p.id === b.projectId);
    rows.push({
      id: `pa-${b.id}`,
      jobNumber: project?.projectNumber ?? '—',
      projectName: project?.projectName ?? '—',
      projectId: b.projectId,
      issueType: `${b.status} pay app`,
      amount: b.currentApplication ?? b.workCompletedThisPeriod ?? 0,
      severity: 'warning',
      nextAction: b.status === 'Draft' ? 'Submit pay app' : 'Invoice pay app',
      route: `/projects/${b.projectId}`,
      section: 'billing',
    });
  }

  if (input.importReviewCount > 0) {
    rows.push({
      id: 'source-review',
      jobNumber: '—',
      projectName: 'Source Review',
      projectId: '',
      issueType: `${input.importReviewCount} unmatched source row${input.importReviewCount === 1 ? '' : 's'}`,
      amount: input.importReviewCount,
      severity: 'warning',
      nextAction: 'Review sources',
      route: '/settings',
      section: 'sources',
    });
  }

  for (const warning of input.qbWarnings.slice(0, 3)) {
    rows.push({
      id: `qb-${warning.slice(0, 24)}`,
      jobNumber: '—',
      projectName: 'QuickBooks',
      projectId: '',
      issueType: warning,
      amount: 0,
      severity: 'warning',
      nextAction: 'Re-sync QuickBooks',
      route: '/settings',
      section: 'sources',
    });
  }

  const rank = (s?: FinancialsOverviewSection) => {
    switch (s) {
      case 'underMargin': return 1;
      case 'collections': return 2;
      case 'billing': return 3;
      case 'approvedCo': return 4;
      default: return 5;
    }
  };

  return rows
    .sort((a, b) => rank(a.section) - rank(b.section) || b.amount - a.amount)
    .slice(0, 24);
}

export function buildFinancialsWipRows(
  wipRecords: WIPRecord[],
  _financialByProjectId: Map<string, ProjectFinancial>,
): FinancialsWipRow[] {
  return wipRecords.map(record => ({
    record,
    budgetBasisLabel: record.budgetBasisLabel ?? '—',
    warnings: (record.warningChips ?? []).map(c => c.label).slice(0, 3),
    nextAction: record.nextAction ?? 'Open WIP',
  }));
}

export function matchesWipHubFilter(
  row: FinancialsWipRow,
  filter: WipHubFilterId,
  financial?: ProjectFinancial,
): boolean {
  const w = row.record;
  switch (filter) {
    case 'activeOnly':
      return w.wipGroup === 'ActiveWIP' || w.wipGroup === 'UpcomingWIP';
    case 'under20':
      return w.contractAmount > 0 && w.forecastMargin < MARGIN_TARGET;
    case 'missingBudget':
      return !!financial && financial.budgetAmount <= 0 && !financial.budgetIsEstimated;
    case 'missingContract':
      return !w.contractAmount || financial?.budgetBasis === 'MissingContract';
    case 'overbilled':
      return w.overUnderBilling > 0 && w.billedToDate > w.contractAmount && w.contractAmount > 0;
    case 'needsReview':
      return w.needsReview || !!(w.warningChips?.length);
    case 'all':
    default:
      return true;
  }
}

export function buildFinancialsArJobRows(ctx: ArComputeContext): FinancialsArJobRow[] {
  return buildArJobRows(ctx).map(r => ({
    projectId: r.projectId,
    jobNumber: r.jobNumber,
    projectName: r.projectName,
    customer: r.customerName,
    current: r.current,
    days1To30: r.days1To30,
    days31To60: r.days31To60,
    days61To90: r.days61To90,
    days90Plus: r.days90Plus,
    totalOpen: r.totalOpen,
    collectionStatus: r.collectionStatus,
    nextAction: r.nextAction,
    isCloseout: r.isCloseout,
  }));
}

export function buildFinancialsBillingRows(input: {
  wipRecords: WIPRecord[];
  changeOrders: ChangeOrder[];
  billings: Billing[];
  projects: Project[];
}): FinancialsBillingRow[] {
  const rows: FinancialsBillingRow[] = [];

  for (const co of input.changeOrders.filter(isApprovedUnbilledCo)) {
    const project = input.projects.find(p => p.id === co.projectId);
    rows.push({
      id: `co-${co.id}`,
      jobNumber: project?.projectNumber ?? '—',
      projectName: project?.projectName ?? '—',
      projectId: co.projectId,
      issue: 'Approved CO not billed',
      amount: co.approvedAmount ?? co.totalAmount ?? 0,
      status: co.status ?? 'Approved',
      group: 'approvedCo',
      nextAction: 'Bill CO',
    });
  }

  for (const b of input.billings) {
    if (b.status === 'Draft') {
      const project = input.projects.find(p => p.id === b.projectId);
      rows.push({
        id: `draft-${b.id}`,
        jobNumber: project?.projectNumber ?? '—',
        projectName: project?.projectName ?? '—',
        projectId: b.projectId,
        issue: `Draft pay app ${b.payAppNumber ?? ''}`.trim(),
        amount: b.currentApplication ?? 0,
        status: 'Draft',
        group: 'draftPayApp',
        nextAction: 'Submit pay app',
      });
    } else if (b.status === 'Submitted' || b.status === 'Invoiced') {
      const project = input.projects.find(p => p.id === b.projectId);
      rows.push({
        id: `sub-${b.id}`,
        jobNumber: project?.projectNumber ?? '—',
        projectName: project?.projectName ?? '—',
        projectId: b.projectId,
        issue: `${b.status} pay app`,
        amount: b.currentApplication ?? 0,
        status: b.status ?? 'Submitted',
        group: 'submitted',
        nextAction: 'Track invoice',
      });
    }
  }

  for (const w of input.wipRecords) {
    if (!['ActiveWIP', 'UpcomingWIP'].includes(w.wipGroup)) continue;
    if (w.leftToBill > 0) {
      rows.push({
        id: `ltb-${w.projectId}`,
        jobNumber: w.jobNumber ?? '—',
        projectName: w.projectName ?? '—',
        projectId: w.projectId,
        issue: 'Left to bill',
        amount: w.leftToBill,
        status: 'Open billing',
        group: 'leftToBill',
        nextAction: 'Create pay app',
      });
    }
  }

  return rows.sort((a, b) => b.amount - a.amount).slice(0, 40);
}

export function buildFinancialsCommitmentRows(projects: Project[], pos: PO[]): FinancialsCommitmentRow[] {
  return pos.map(po => {
    const label = po.projectName?.trim()
      || po.jobIdLabel?.trim()
      || resolveProjectLabel(projects, { projectId: po.projectId, projectNo: po.jobNumber });
    const unmatched = !po.projectName && !po.jobNumber && (label.includes('—') || label === 'Unmatched project');
    const jobLabel = unmatched ? 'Unmatched project' : label;
    const source = po.missingPo ? 'Sheet' : 'QuickBooks';
    let matchStatus = 'Matched';
    if (unmatched) matchStatus = 'Unmatched project';
    else if (po.missingPo) matchStatus = 'Not in QB';

    let nextAction = 'Review commitment';
    if (unmatched) nextAction = 'Match in Source Review';
    else if (po.invoiceExceedsPo) nextAction = 'Invoice exceeds PO';
    else if (po.status === 'Open' || po.status === 'Issued') nextAction = 'Track commitment';

    return {
      id: po.id,
      poNumber: po.poNumber,
      jobLabel,
      vendor: po.vendor,
      amount: po.originalAmount ?? 0,
      status: po.status ?? 'Open',
      source,
      matchStatus,
      nextAction,
      po,
    };
  });
}

export function matchesCommitmentFilter(row: FinancialsCommitmentRow, filter: CommitmentFilterId): boolean {
  switch (filter) {
    case 'open':
      return ['Open', 'Issued', 'Partial'].includes(row.status);
    case 'notInQb':
      return row.matchStatus === 'Not in QB';
    case 'missingProject':
      return row.matchStatus === 'Unmatched project';
    case 'overBudget':
      return !!row.po.invoiceExceedsPo;
    case 'needsReview':
      return row.matchStatus !== 'Matched' || !!row.po.invoiceExceedsPo;
    default:
      return true;
  }
}

export function buildFinancialsBonusRows(records: ForemanBonusRecord[], projects: Project[]): FinancialsBonusRow[] {
  return records.map(record => {
    const project = projects.find(p => p.id === record.projectId);
    let nextAction = 'Review bonus';
    if (record.status === 'NeedsReview' || record.status === 'MissingData') nextAction = 'Complete setup';
    else if (record.status === 'Approved') nextAction = 'Process payment';
    return {
      record,
      jobNumber: project?.projectNumber ?? record.jobNumber ?? '—',
      projectName: project?.projectName ?? record.projectName ?? '—',
      nextAction,
    };
  });
}

export function buildFinancialsSourceRows(input: {
  qbWarnings: string[];
  qbTabsMissing: string[];
  importReviewCount: number;
  hasArAgingTab: boolean;
  hasDetailCosts: boolean;
}): FinancialsSourceRow[] {
  const rows: FinancialsSourceRow[] = [];

  if (!input.hasArAgingTab) {
    rows.push({
      id: 'missing-ar-aging',
      label: 'QuickBooks AR Aging Summary',
      detail: 'AR Aging Summary tab missing — AR cannot be fully synced.',
      severity: 'error',
      route: '/settings',
      fragment: 'quickbooks-sync',
    });
  }

  if (!input.hasDetailCosts) {
    rows.push({
      id: 'missing-cost-detail',
      label: 'Project Cost Detail',
      detail: 'QuickBooks project cost detail not loaded — actual costs may be incomplete.',
      severity: 'warning',
      route: '/settings',
      fragment: 'quickbooks-sync',
    });
  }

  if (input.importReviewCount > 0) {
    rows.push({
      id: 'unmatched-rows',
      label: 'Unmatched source rows',
      detail: `${input.importReviewCount} row${input.importReviewCount === 1 ? '' : 's'} need review before overwriting manual fields.`,
      severity: 'warning',
      route: '/settings',
      fragment: 'import-review',
    });
  }

  for (const tab of input.qbTabsMissing.filter(t => t.includes('AR Aging'))) {
    rows.push({
      id: `tab-${tab}`,
      label: 'QuickBooks sync',
      detail: `Missing tab: ${tab}`,
      severity: 'error',
      route: '/settings',
      fragment: 'quickbooks-sync',
    });
  }

  for (const w of input.qbWarnings.slice(0, 5)) {
    if (rows.some(r => r.detail === w)) continue;
    rows.push({
      id: `qb-w-${rows.length}`,
      label: 'QuickBooks sync warning',
      detail: w,
      severity: 'warning',
      route: '/settings',
      fragment: 'quickbooks-sync',
    });
  }

  return rows;
}

export function financialsHubCsvRows(segment: FinancialsSegmentId, overview: FinancialsActionRow[], wip: FinancialsWipRow[]): unknown[][] {
  if (segment === 'wip') {
    return wip.map(r => [
      r.record.jobNumber,
      r.record.projectName,
      r.record.contractAmount,
      r.budgetBasisLabel,
      r.record.costToDate,
      r.record.forecastMargin,
      r.record.overUnderBilling,
      r.record.wipGroup,
      r.warnings.join('; '),
      r.nextAction,
    ]);
  }
  return overview.map(r => [
    r.jobNumber,
    r.projectName,
    r.issueType,
    r.amount,
    r.severity,
    r.nextAction,
  ]);
}

export function qbSyncStatusLabel(metrics: FinancialMetrics, lastSync?: string): string {
  if (lastSync) return 'Synced';
  return metrics.arBalance > 0 ? 'Check sync' : 'Not synced';
}

export function activeWipGroups(): WipGroup[] {
  return ['ActiveWIP', 'UpcomingWIP'];
}
