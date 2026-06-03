import { describe, expect, it } from 'vitest';
import {
  buildArJobRows,
  computeArPortfolioSummary,
  computeProjectArBalance,
  deriveArNextAction,
  isArRecordPastDue,
  matchesArJobSegment,
  normalizeArPageSegment,
  sumBuckets,
  UNMATCHED_AR_PROJECT_PREFIX,
} from '@features/financials/utils/ar.compute';
import { ARRecord } from '@app/models/financial.types';
import { Project } from '@app/models/types';

function ar(overrides: Partial<ARRecord> = {}): ARRecord {
  return {
    id: 'ar1',
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'Test Job',
    customer: 'Customer A',
    originalAmount: 10000,
    openBalance: 10000,
    agingBucket: '1-30',
    status: 'Open',
    source: 'QuickBooksArAging',
    currentAmount: 0,
    days1To30: 10000,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
    ...overrides,
  };
}

const project = { id: 'p1', projectNumber: '204', projectName: 'Test Job', customer: 'Customer A', status: 'Active' } as Project;

describe('ar.compute', () => {
  it('defaults segment to open', () => {
    expect(normalizeArPageSegment(null)).toBe('open');
    expect(normalizeArPageSegment('closeout')).toBe('closeout');
  });

  it('portfolio summary totals match row rollups', () => {
    const ctx = {
      records: [
        ar(),
        ar({ id: 'ar2', projectId: 'p2', jobNumber: '205', days1To30: 0, days31To60: 5000, openBalance: 5000, agingBucket: '31-60' }),
      ],
      projects: [
        project,
        { id: 'p2', projectNumber: '205', projectName: 'Other', customer: 'B', status: 'Closeout' } as Project,
      ],
      qbHasArAgingTab: true,
    };
    const summary = computeArPortfolioSummary(ctx);
    const rows = buildArJobRows(ctx);
    expect(summary.openAr).toBe(rows.reduce((s, r) => s + r.totalOpen, 0));
    expect(summary.pastDue).toBeGreaterThan(0);
  });

  it('shows closeout AR only for closed jobs', () => {
    const ctx = {
      records: [ar({ projectId: 'p2', openBalance: 8000, days1To30: 8000 })],
      projects: [{ id: 'p2', projectNumber: '300', projectName: 'Closed Job', customer: 'C', status: 'Closed' } as Project],
      qbHasArAgingTab: true,
    };
    const summary = computeArPortfolioSummary(ctx);
    expect(summary.closeoutAr).toBe(8000);
    const row = buildArJobRows(ctx)[0];
    expect(row.isCloseout).toBe(true);
    expect(matchesArJobSegment(row, 'closeout')).toBe(true);
  });

  it('flags unmatched project rows', () => {
    const unmatchedId = `${UNMATCHED_AR_PROJECT_PREFIX}key1`;
    const ctx = {
      records: [ar({ projectId: unmatchedId, projectName: 'Unmatched Project', jobNumber: '—' })],
      projects: [project],
      qbHasArAgingTab: true,
    };
    const row = buildArJobRows(ctx)[0];
    expect(row.isUnmatched).toBe(true);
    expect(row.nextAction).toBe('Link unmatched AR row');
  });

  it('detects past due from aging buckets', () => {
    expect(isArRecordPastDue(ar({ agingBucket: 'Current' }))).toBe(false);
    expect(isArRecordPastDue(ar({ agingBucket: '1-30' }))).toBe(true);
  });

  it('derives escalate action for 90+ aging', () => {
    const record = ar({ days90Plus: 12000, openBalance: 12000, agingBucket: '90+' });
    const buckets = sumBuckets([record]);
    const action = deriveArNextAction({
      records: [record],
      buckets,
      isCloseout: false,
      isUnmatched: false,
      qbHasArAgingTab: true,
      chips: [{ label: '90+ days', tone: 'critical' }],
    });
    expect(action).toBe('Escalate collection');
  });

  it('uses record sum before project fallback for project balance', () => {
    const records = [ar({ openBalance: 4000 })];
    expect(computeProjectArBalance('p1', records, { ...project, currentAR: 9000 } as Project)).toBe(4000);
    expect(computeProjectArBalance('p1', [], { ...project, currentAR: 9000 } as Project)).toBe(9000);
  });

  it('marks missing AR source when aging tab absent', () => {
    const summary = computeArPortfolioSummary({
      records: [ar()],
      projects: [project],
      qbHasArAgingTab: false,
    });
    expect(summary.missingArSource).toBe(true);
  });
});
