import { describe, expect, it } from 'vitest';
import {
  buildHomePriorities,
  buildHomeSnapshotRows,
  countBillingActions,
} from './home-hub.compute';
import { Active2026ControlRow } from '../models/active-2026-control.types';

function baseRow(overrides: Partial<Active2026ControlRow> = {}): Active2026ControlRow {
  return {
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'LightEdge Data Center',
    customer: '',
    status: 'Active',
    lifecycleGroup: 'Active',
    pm: 'PM',
    foreman: 'Foreman',
    budgetType: 'FullConstruction',
    currentContract: 1_000_000,
    approvedCos: 0,
    pendingCos: 0,
    contract2026: 1_000_000,
    billedToDate: 500_000,
    leftToBill: 500_000,
    arBalance: 0,
    arPastDue: 0,
    retainage: 0,
    billingStatus: 'On track',
    budgetBasis: 'Imported',
    totalBudget: 800_000,
    actualCostToDate: 400_000,
    costToComplete: 400_000,
    estimatedFinalCost: 800_000,
    budgetVariance: 0,
    projectedProfit: 200_000,
    projectedMarginPct: 20,
    overUnderBilling: 0,
    wipStatus: 'Active',
    reviewFlags: [],
    laborBudget: 200_000,
    laborActualCost: 100_000,
    laborVariance: 100_000,
    foremanBonusEligible: false,
    foremanAssigned: 'Foreman',
    bonusStatus: 'N/A',
    subcontractorCount: 0,
    subcontractorCostToDate: 0,
    missingW9Count: 0,
    missingCoiCount: 0,
    lienWaiverNeededCount: 0,
    driveLinked: true,
    cprRequired: false,
    cprStatus: 'N/A',
    seedCompletenessStatus: 'Complete',
    missingItemCount: 0,
    healthStatus: 'Green',
    nextAction: { label: 'Review job', route: '/projects/p1' },
    hasApprovedCoNotBilled: false,
    missingContract: false,
    contractPending: false,
    missingBudget: false,
    missingLaborBudget: false,
    needsReview: false,
    ...overrides,
  };
}

describe('home-hub.compute', () => {
  it('prioritizes missing contract before other issues', () => {
    const rows = [
      baseRow({ projectId: 'p2', jobNumber: '210', missingContract: true }),
      baseRow({ projectId: 'p3', jobNumber: '215', projectedMarginPct: 10 }),
    ];
    const priorities = buildHomePriorities({ rows, qbSyncWarning: false, unmatchedSourceCount: 0 });
    expect(priorities[0]?.id).toContain('missing-contract');
    expect(priorities.some(p => p.issue.includes('Margin under'))).toBe(false);
  });

  it('includes global QB and source review items', () => {
    const priorities = buildHomePriorities({
      rows: [],
      qbSyncWarning: true,
      unmatchedSourceCount: 3,
    });
    expect(priorities.some(p => p.id === 'qb-sync-warning')).toBe(true);
    expect(priorities.some(p => p.id === 'unmatched-sources')).toBe(true);
  });

  it('ranks snapshot rows by health and AR', () => {
    const rows = [
      baseRow({ projectId: 'green', healthStatus: 'Green', arBalance: 0 }),
      baseRow({ projectId: 'red', healthStatus: 'Red', arBalance: 50_000, jobNumber: '206' }),
    ];
    const snapshot = buildHomeSnapshotRows(rows, 5);
    expect(snapshot[0]?.projectId).toBe('red');
  });

  it('counts billing segment jobs', () => {
    const rows = [
      baseRow({ projectId: 'bill', hasApprovedCoNotBilled: true }),
      baseRow({ projectId: 'ok', arBalance: 0, hasApprovedCoNotBilled: false, leftToBill: 0 }),
    ];
    expect(countBillingActions(rows)).toBe(1);
  });
});
