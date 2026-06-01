import {
  ARRecord,
  ArWarningChip,
  ArWarningTone,
  ProjectFinancial,
} from '../models/financial.types';
import { Project } from '../models/types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { isOpenArRecord } from './wip.compute';

export type ArPageSegmentId =
  | 'open'
  | 'pastDue'
  | 'days30Plus'
  | 'closeout'
  | 'disputed'
  | 'closed'
  | 'all';

export interface ArAgingBuckets {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
}

export interface ArJobRow {
  projectId: string;
  jobNumber: string;
  projectName: string;
  customerName: string;
  lifecycleLabel: string;
  isCloseout: boolean;
  isUnmatched: boolean;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  totalOpen: number;
  collectionStatus: string;
  nextAction: string;
  sourceLabel: string;
  warningChips: ArWarningChip[];
  records: ARRecord[];
}

export interface ArPortfolioSummary extends ArAgingBuckets {
  openAr: number;
  pastDue: number;
  days30Plus: number;
  closeoutAr: number;
  disputed: number;
  missingArSource: boolean;
}

export interface ArComputeContext {
  records: ARRecord[];
  projects: Project[];
  lifecycles?: Map<string, ProjectLifecycleSnapshot>;
  qbHasArAgingTab: boolean;
  financials?: Map<string, ProjectFinancial>;
}

export const AR_PAGE_SEGMENT_OPTIONS: { id: ArPageSegmentId; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'pastDue', label: 'Past Due' },
  { id: 'days30Plus', label: '30+ Days' },
  { id: 'closeout', label: 'Closeout AR' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'closed', label: 'Paid / Closed' },
  { id: 'all', label: 'All' },
];

export function normalizeArPageSegment(value: string | null | undefined): ArPageSegmentId {
  if (!value) return 'open';
  const allowed = new Set(AR_PAGE_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as ArPageSegmentId) ? (value as ArPageSegmentId) : 'open';
}

export function arSourceLabel(source: ARRecord['source']): string {
  switch (source) {
    case 'QuickBooksArAging':
    case 'QuickBooks':
      return 'QuickBooks AR Aging';
    case 'PayApp':
    case 'App':
      return 'Pay App';
    case 'Imported':
      return 'Imported';
    case 'Manual':
      return 'Manual';
    default:
      return source ?? 'Unknown';
  }
}

export function isQuickBooksArSource(source?: ARRecord['source']): boolean {
  return source === 'QuickBooks' || source === 'QuickBooksArAging';
}

export function isPayAppArSource(source?: ARRecord['source']): boolean {
  return source === 'App' || source === 'PayApp';
}

export function bucketAmountsForRecord(record: ARRecord): ArAgingBuckets {
  if (
    record.currentAmount != null
    || record.days1To30 != null
    || record.days31To60 != null
    || record.days61To90 != null
    || record.days90Plus != null
  ) {
    return {
      current: record.currentAmount ?? 0,
      days1To30: record.days1To30 ?? 0,
      days31To60: record.days31To60 ?? 0,
      days61To90: record.days61To90 ?? 0,
      days90Plus: record.days90Plus ?? 0,
    };
  }
  const amt = record.openBalance ?? 0;
  return {
    current: record.agingBucket === 'Current' ? amt : 0,
    days1To30: record.agingBucket === '1-30' ? amt : 0,
    days31To60: record.agingBucket === '31-60' ? amt : 0,
    days61To90: record.agingBucket === '61-90' ? amt : 0,
    days90Plus: record.agingBucket === '90+' ? amt : 0,
  };
}

export function sumBuckets(records: ARRecord[]): ArAgingBuckets {
  return records.reduce(
    (acc, r) => {
      const b = bucketAmountsForRecord(r);
      return {
        current: acc.current + b.current,
        days1To30: acc.days1To30 + b.days1To30,
        days31To60: acc.days31To60 + b.days31To60,
        days61To90: acc.days61To90 + b.days61To90,
        days90Plus: acc.days90Plus + b.days90Plus,
      };
    },
    { current: 0, days1To30: 0, days31To60: 0, days61To90: 0, days90Plus: 0 },
  );
}

export function isArRecordPastDue(record: ARRecord): boolean {
  if (!isOpenArRecord(record.status)) return false;
  if (record.agingBucket !== 'Current') return true;
  if (record.dueDate) {
    const today = new Date().toISOString().slice(0, 10);
    return record.dueDate.slice(0, 10) < today;
  }
  return false;
}

export function isArRecord30Plus(record: ARRecord): boolean {
  if (!isOpenArRecord(record.status)) return false;
  return record.agingBucket === '31-60' || record.agingBucket === '61-90' || record.agingBucket === '90+';
}

export function arPastDueForProject(projectId: string, records: ARRecord[]): number {
  return records
    .filter(r => r.projectId === projectId && isArRecordPastDue(r))
    .reduce((s, r) => s + (r.openBalance ?? 0), 0);
}

export function isCloseoutArProject(
  project: Project | undefined,
  lifecycle?: ProjectLifecycleSnapshot,
): boolean {
  if (lifecycle?.includeInCloseoutAr) return true;
  if (!project) return false;
  return project.status === 'Closeout'
    || project.status === 'Closed'
    || !!project.dashboardGroup?.includes('Closeout');
}

export function lifecycleLabelForProject(
  project: Project | undefined,
  lifecycle?: ProjectLifecycleSnapshot,
): string {
  if (lifecycle?.projectLifecycleGroup) return lifecycle.projectLifecycleGroup;
  return project?.status ?? 'Active';
}

export function buildArWarningChips(input: {
  records: ARRecord[];
  buckets: ArAgingBuckets;
  isCloseout: boolean;
  isUnmatched: boolean;
  qbHasArAgingTab: boolean;
  financial?: ProjectFinancial;
  hasSummaryOnly: boolean;
}): ArWarningChip[] {
  const chips: ArWarningChip[] = [];
  const push = (label: string, tone: ArWarningTone) => {
    if (!chips.some(c => c.label === label)) chips.push({ label, tone });
  };

  if (input.buckets.days61To90 > 0) push('61–90 days', 'critical');
  if (input.buckets.days90Plus > 0) push('90+ days', 'critical');
  if (input.records.some(r => r.status === 'Disputed')) push('Disputed', 'critical');
  if (input.financial && input.financial.billedToDate > input.financial.currentContractAmount
    && input.financial.currentContractAmount > 0) {
    push('Billed over contract', 'critical');
  }
  if (input.isCloseout && input.buckets.current + input.buckets.days1To30
    + input.buckets.days31To60 + input.buckets.days61To90 + input.buckets.days90Plus > 10000) {
    push('Closeout AR outstanding', 'critical');
  }

  if (input.buckets.days1To30 > 0) push('1–30 past due', 'amber');
  if (input.records.some(r => isOpenArRecord(r.status) && !r.dueDate && !isQuickBooksArSource(r.source))) {
    push('Missing due date', 'amber');
  }
  if (input.hasSummaryOnly) push('Source summary only', 'amber');
  if (input.isUnmatched) push('Unmatched project', 'amber');
  if (!input.qbHasArAgingTab && input.records.some(r => isOpenArRecord(r.status))) {
    push('AR Aging Summary missing', 'amber');
  }

  return chips;
}

export function deriveArNextAction(input: {
  records: ARRecord[];
  buckets: ArAgingBuckets;
  isCloseout: boolean;
  isUnmatched: boolean;
  qbHasArAgingTab: boolean;
  chips: ArWarningChip[];
}): string {
  const labels = new Set(input.chips.map(c => c.label));
  if (input.records.every(r => !isOpenArRecord(r.status))) return 'Complete';
  if (labels.has('Unmatched project')) return 'Link unmatched AR row';
  if (!input.qbHasArAgingTab && labels.has('AR Aging Summary missing')) return 'Add AR Aging Summary tab';
  if (labels.has('Disputed')) return 'Review disputed invoice';
  if (labels.has('90+ days') || labels.has('61–90 days')) return 'Escalate collection';
  if (labels.has('1–30 past due') || input.buckets.days1To30 > 0) return 'Follow up AR';
  if (input.isCloseout && input.buckets.current + input.buckets.days1To30 > 0) return 'Follow up AR';
  if (input.records.some(r => isOpenArRecord(r.status))) return 'Follow up AR';
  return 'No action';
}

export const UNMATCHED_AR_PROJECT_PREFIX = 'unmatched-';

export function isUnmatchedArProjectId(projectId: string | undefined): boolean {
  return !!projectId && projectId.startsWith(UNMATCHED_AR_PROJECT_PREFIX);
}

function buildArJobRow(
  projectId: string,
  recs: ARRecord[],
  ctx: ArComputeContext,
): ArJobRow {
  const project = ctx.projects.find(p => p.id === projectId);
  const isUnmatched = isUnmatchedArProjectId(projectId) || (!!projectId && !project);
  const lifecycle = project ? ctx.lifecycles?.get(projectId) : undefined;
  const buckets = sumBuckets(recs);
  const totalOpen = recs.reduce((s, r) => s + (r.openBalance ?? 0), 0);
  const isCloseout = !isUnmatched && isCloseoutArProject(project, lifecycle);
  const hasSummaryOnly = recs.some(r => isQuickBooksArSource(r.source))
    && !recs.some(r => isPayAppArSource(r.source));
  const financial = project ? ctx.financials?.get(projectId) : undefined;
  const warningChips = buildArWarningChips({
    records: recs,
    buckets,
    isCloseout,
    isUnmatched,
    qbHasArAgingTab: ctx.qbHasArAgingTab,
    financial,
    hasSummaryOnly,
  });
  const worstCollection = recs.find(r => r.collectionStatus === 'Escalated')
    ?? recs.find(r => r.collectionStatus === 'Disputed')
    ?? recs[0];

  return {
    projectId,
    jobNumber: recs[0]?.jobNumber ?? project?.projectNumber ?? (isUnmatched ? '—' : '—'),
    projectName: recs[0]?.projectName ?? project?.projectName ?? (isUnmatched ? 'Unmatched Project' : '—'),
    customerName: recs[0]?.customerName ?? recs[0]?.customer ?? project?.customer ?? '—',
    lifecycleLabel: isUnmatched ? 'Unmatched' : lifecycleLabelForProject(project, lifecycle),
    isCloseout,
    isUnmatched,
    ...buckets,
    totalOpen,
    collectionStatus: worstCollection?.collectionStatus ?? 'NotStarted',
    nextAction: deriveArNextAction({
      records: recs,
      buckets,
      isCloseout,
      isUnmatched,
      qbHasArAgingTab: ctx.qbHasArAgingTab,
      chips: warningChips,
    }),
    sourceLabel: recs.length === 1
      ? arSourceLabel(recs[0].source)
      : recs.some(r => isPayAppArSource(r.source)) ? 'Mixed' : arSourceLabel(recs[0]?.source),
    warningChips,
    records: recs,
  };
}

export function buildArJobRows(ctx: ArComputeContext): ArJobRow[] {
  const open = ctx.records.filter(r => isOpenArRecord(r.status) && r.projectId);
  const byProject = new Map<string, ARRecord[]>();
  for (const r of open) {
    const list = byProject.get(r.projectId) ?? [];
    list.push(r);
    byProject.set(r.projectId, list);
  }

  const rows: ArJobRow[] = [];
  for (const [projectId, recs] of byProject.entries()) {
    rows.push(buildArJobRow(projectId, recs, ctx));
  }

  return rows.sort((a, b) => b.totalOpen - a.totalOpen || a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }));
}

export function computeArPortfolioSummary(ctx: ArComputeContext): ArPortfolioSummary {
  const openRecords = ctx.records.filter(r => isOpenArRecord(r.status));
  const buckets = sumBuckets(openRecords);
  const openAr = openRecords.reduce((s, r) => s + (r.openBalance ?? 0), 0);
  const pastDue = openRecords.filter(isArRecordPastDue).reduce((s, r) => s + (r.openBalance ?? 0), 0);
  const days30Plus = openRecords.filter(isArRecord30Plus).reduce((s, r) => s + (r.openBalance ?? 0), 0);
  const disputed = openRecords.filter(r => r.status === 'Disputed').reduce((s, r) => s + (r.openBalance ?? 0), 0);

  const jobRows = buildArJobRows(ctx);
  const closeoutAr = jobRows.filter(r => r.isCloseout).reduce((s, r) => s + r.totalOpen, 0);

  return {
    openAr,
    pastDue,
    days30Plus,
    closeoutAr,
    disputed,
    missingArSource: !ctx.qbHasArAgingTab,
    ...buckets,
  };
}

export function matchesArJobSegment(row: ArJobRow, segment: ArPageSegmentId): boolean {
  switch (segment) {
    case 'open':
      return row.totalOpen > 0;
    case 'pastDue':
      return row.days1To30 + row.days31To60 + row.days61To90 + row.days90Plus > 0;
    case 'days30Plus':
      return row.days31To60 + row.days61To90 + row.days90Plus > 0;
    case 'closeout':
      return row.isCloseout && row.totalOpen > 0;
    case 'disputed':
      return row.records.some(r => r.status === 'Disputed');
    case 'closed':
      return row.totalOpen <= 0;
    case 'all':
    default:
      return true;
  }
}

export function matchesArRecordSegment(record: ARRecord, segment: ArPageSegmentId, isCloseout: boolean): boolean {
  switch (segment) {
    case 'open':
      return isOpenArRecord(record.status) && record.status !== 'Disputed';
    case 'pastDue':
      return isOpenArRecord(record.status) && isArRecordPastDue(record);
    case 'days30Plus':
      return isOpenArRecord(record.status) && isArRecord30Plus(record);
    case 'closeout':
      return isCloseout && isOpenArRecord(record.status);
    case 'disputed':
      return record.status === 'Disputed';
    case 'closed':
      return record.status === 'Paid' || record.status === 'WrittenOff' || record.status === 'Void';
    case 'all':
    default:
      return true;
  }
}

export function arHubCsvRows(rows: ArJobRow[]): unknown[][] {
  return rows.map(r => [
    r.jobNumber,
    r.projectName,
    r.customerName,
    r.lifecycleLabel,
    r.current,
    r.days1To30,
    r.days31To60,
    r.days61To90,
    r.days90Plus,
    r.totalOpen,
    r.collectionStatus,
    r.nextAction,
    r.sourceLabel,
    r.warningChips.map(c => c.label).join('; '),
  ]);
}

export const AR_HUB_CSV_HEADERS = [
  'Job', 'Project', 'Customer', 'Lifecycle', 'Current', '1-30', '31-60', '61-90', '90+',
  'Total Open', 'Collection Status', 'Next Action', 'Source', 'Warnings',
];

export function computeProjectArBalance(projectId: string, records: ARRecord[], project?: Project): number {
  const fromRecords = records
    .filter(r => r.projectId === projectId && isOpenArRecord(r.status))
    .reduce((s, r) => s + (r.openBalance ?? 0), 0);
  if (fromRecords > 0) return fromRecords;
  return project?.currentAR ?? 0;
}
