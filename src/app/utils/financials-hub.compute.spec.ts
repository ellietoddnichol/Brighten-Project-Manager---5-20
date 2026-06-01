import { describe, expect, it } from 'vitest';
import {
  budgetBasisLabel,
  buildFinancialsOverviewRows,
  countJobsUnderMargin,
  matchesWipHubFilter,
  normalizeFinancialsSegment,
} from './financials-hub.compute';
import { ProjectFinancial, WIPRecord } from '../models/financial.types';
import { Project } from '../models/types';

function wip(overrides: Partial<WIPRecord> = {}): WIPRecord {
  return {
    id: 'p1',
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'Test',
    contractAmount: 100000,
    forecastMargin: 15,
    forecastGrossProfit: 15000,
    leftToBill: 20000,
    wipGroup: 'ActiveWIP',
    needsReview: false,
    overUnderBilling: 0,
    billedToDate: 80000,
    costToDate: 50000,
    budgetAmount: 80000,
    estimatedFinalCost: 85000,
    costToComplete: 35000,
    percentComplete: 60,
    earnedRevenue: 60000,
    arBalance: 0,
    retainageHeld: 0,
    originalContractAmount: 100000,
    approvedChangeOrderAmount: 0,
    pendingChangeOrderAmount: 0,
    currentContractAmount: 100000,
    selfPerformedAmount: 0,
    subcontractorAmount: 0,
    materialAmount: 0,
    equipmentAmount: 0,
    otherAmount: 0,
    source: 'App',
    status: 'Active',
    ...overrides,
  };
}

describe('financials-hub.compute', () => {
  it('normalizes segment param', () => {
    expect(normalizeFinancialsSegment('wip')).toBe('wip');
    expect(normalizeFinancialsSegment(null)).toBe('overview');
  });

  it('labels estimated budget basis', () => {
    const financial = {
      budgetIsEstimated: true,
      budgetBasis: 'EstimatedFrom20PercentTarget',
      budgetAmount: 80000,
    } as ProjectFinancial;
    expect(budgetBasisLabel(financial)).toBe('Estimated 80%');
  });

  it('counts jobs under margin in active wip', () => {
    expect(countJobsUnderMargin([
      wip({ forecastMargin: 15 }),
      wip({ projectId: 'p2', forecastMargin: 25, wipGroup: 'ExcludedArchive' }),
    ])).toBe(1);
  });

  it('builds overview rows prioritized by section', () => {
    const rows = buildFinancialsOverviewRows({
      wipRecords: [wip({ forecastMargin: 10 })],
      arRecords: [],
      changeOrders: [],
      billings: [],
      projects: [{ id: 'p1', projectNumber: '204', projectName: 'Test', customer: 'C', status: 'Active' } as Project],
      importReviewCount: 0,
      qbWarnings: [],
    });
    expect(rows[0]?.section).toBe('underMargin');
  });

  it('filters wip active only', () => {
    const fin = new Map<string, ProjectFinancial>();
    const rows = [
      { record: wip(), budgetBasisLabel: 'Manual', warnings: [], nextAction: 'Open' },
      { record: wip({ projectId: 'x', wipGroup: 'ExcludedArchive' }), budgetBasisLabel: 'Manual', warnings: [], nextAction: 'Open' },
    ];
    expect(rows.filter(r => matchesWipHubFilter(r, 'activeOnly', fin.get(r.record.projectId)))).toHaveLength(1);
  });
});
