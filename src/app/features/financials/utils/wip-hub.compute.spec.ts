import { describe, expect, it } from 'vitest';
import { matchesWipPageSegment, normalizeWipPageSegment, summarizeWipHub } from '@features/financials/utils/wip-hub.compute';
import { WIPRecord } from '@app/models/financial.types';
import { FinancialMetrics } from '@app/models/financial.types';

function wip(overrides: Partial<WIPRecord> = {}): WIPRecord {
  return {
    id: 'p1',
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'Test',
    contractAmount: 100000,
    forecastMargin: 22,
    forecastGrossProfit: 22000,
    leftToBill: 20000,
    wipGroup: 'ActiveWIP',
    needsReview: false,
    overUnderBilling: 1000,
    billedToDate: 80000,
    costToDate: 50000,
    budgetAmount: 80000,
    estimatedFinalCost: 78000,
    costToComplete: 28000,
    percentComplete: 64,
    earnedRevenue: 64000,
    arBalance: 0,
    retainageHeld: 0,
    originalContractAmount: 100000,
    approvedChangeOrderAmount: 0,
    pendingChangeOrderAmount: 0,
    currentContractAmount: 100000,
    selfPerformedAmount: 50000,
    subcontractorAmount: 0,
    materialAmount: 0,
    equipmentAmount: 0,
    otherAmount: 0,
    source: 'App',
    status: 'Active',
    ...overrides,
  };
}

const emptyMetrics = {} as FinancialMetrics;

describe('wip-hub.compute', () => {
  it('defaults segment to activeWip', () => {
    expect(normalizeWipPageSegment(null)).toBe('activeWip');
  });

  it('summarizes active wip totals', () => {
    const summary = summarizeWipHub([
      wip(),
      wip({ projectId: 'p2', wipGroup: 'CloseoutAR', arBalance: 5000 }),
    ], emptyMetrics);
    expect(summary.activeWipJobs).toBe(1);
    expect(summary.closeoutAr).toBe(5000);
  });

  it('filters needs review segment without hiding active group', () => {
    const row = wip({ needsReview: true, warningChips: [{ label: 'Margin under 20%', tone: 'critical' }] });
    expect(matchesWipPageSegment(row, 'activeWip')).toBe(true);
    expect(matchesWipPageSegment(row, 'needsReview')).toBe(true);
  });
});
