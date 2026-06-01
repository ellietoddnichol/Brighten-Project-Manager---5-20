import { describe, expect, it } from 'vitest';
import {
  deriveHealthStatus,
  deriveNextAction,
  isFullyBilledCompleteJob,
  matchesControlFilter,
  rowWarningChips,
  summarizeActive2026Control,
} from './active-2026-control.compute';
import { Active2026ControlRow } from '../models/active-2026-control.types';
import { ProjectFinancial } from '../models/financial.types';
import { Project } from '../models/types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';

function sampleRow(overrides: Partial<Active2026ControlRow> = {}): Active2026ControlRow {
  return {
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'LightEdge',
    customer: 'Test',
    status: 'Active',
    lifecycleGroup: 'Active',
    pm: 'PM',
    foreman: 'Foreman',
    budgetType: 'FullConstruction',
    currentContract: 1_000_000,
    approvedCos: 0,
    pendingCos: 0,
    contract2026: 1_000_000,
    billedToDate: 200_000,
    leftToBill: 800_000,
    arBalance: 0,
    arPastDue: 0,
    retainage: 0,
    billingStatus: 'Current',
    budgetBasis: 'Imported',
    totalBudget: 800_000,
    actualCostToDate: 300_000,
    costToComplete: 500_000,
    estimatedFinalCost: 800_000,
    budgetVariance: 500_000,
    projectedProfit: 200_000,
    projectedMarginPct: 20,
    overUnderBilling: 0,
    wipStatus: 'ActiveWIP',
    reviewFlags: [],
    laborBudget: 200_000,
    laborActualCost: 100_000,
    laborVariance: 100_000,
    foremanBonusEligible: true,
    foremanAssigned: 'Foreman',
    bonusStatus: 'Calculated',
    subcontractorCount: 2,
    subcontractorCostToDate: 150_000,
    missingW9Count: 0,
    missingCoiCount: 0,
    lienWaiverNeededCount: 0,
    driveLinked: true,
    cprRequired: false,
    cprStatus: 'Not required',
    seedCompletenessStatus: 'Complete',
    missingItemCount: 0,
    healthStatus: 'Green',
    nextAction: { label: 'On track', route: '/projects/p1' },
    hasApprovedCoNotBilled: false,
    missingContract: false,
    missingBudget: false,
    missingLaborBudget: false,
    needsReview: false,
    ...overrides,
  };
}

describe('active-2026-control.compute', () => {
  it('flags under 20% margin filter', () => {
    const row = sampleRow({ projectedMarginPct: 18 });
    expect(matchesControlFilter(row, 'under20Margin')).toBe(true);
  });

  it('does not treat estimated budget as missing budget', () => {
    const row = sampleRow({ budgetBasis: 'EstimatedFrom20PercentTarget', missingBudget: false });
    expect(matchesControlFilter(row, 'missingBudget')).toBe(false);
  });

  it('summarizes portfolio totals', () => {
    const summary = summarizeActive2026Control([
      sampleRow(),
      sampleRow({ jobNumber: '206', currentContract: 500_000, projectedProfit: 100_000 }),
    ]);
    expect(summary.activeJobs).toBe(2);
    expect(summary.currentContractTotal).toBe(1_500_000);
    expect(summary.projectedProfitTotal).toBe(300_000);
  });

  it('prioritizes missing contract next action', () => {
    const project = { id: 'p1', projectNumber: '204', projectName: 'Test' } as Project;
    const financial = { forecastMargin: 25, currentContractAmount: 0 } as ProjectFinancial;
    const lifecycle = { seedGaps: [], reviewReasons: [] } as unknown as ProjectLifecycleSnapshot;
    const action = deriveNextAction({
      project,
      financial,
      lifecycle,
      missingContract: true,
      missingBudget: false,
      budgetBasis: 'Missing',
      missingLaborBudget: false,
      hasApprovedCoNotBilled: false,
      arPastDue: 0,
      arBalance: 0,
      foremanAssigned: true,
      bonusEligible: false,
      subComplianceGap: false,
      cprMissingSetup: false,
      driveLinked: true,
    });
    expect(action.label).toBe('Add contract amount');
  });

  it('marks red health for missing contract', () => {
    expect(deriveHealthStatus({
      projectedMarginPct: 25,
      currentContract: 0,
      missingContract: true,
      budgetVariance: 0,
      arPastDue: 0,
      billedOverContract: false,
      budgetBasis: 'Missing',
      missingPm: false,
      missingForeman: false,
      missingDrive: false,
      missingBudget: false,
      missingLaborBudget: false,
      cprMissingSetup: false,
      subComplianceGap: false,
      needsReview: false,
      missingNonCritical: false,
      closedInActiveView: false,
    })).toBe('Red');
  });

  it('marks yellow for setup issues not critical risk', () => {
    expect(deriveHealthStatus({
      projectedMarginPct: 25,
      currentContract: 1_000_000,
      missingContract: false,
      budgetVariance: 0,
      arPastDue: 0,
      billedOverContract: false,
      budgetBasis: 'Imported',
      missingPm: true,
      missingForeman: false,
      missingDrive: false,
      missingBudget: false,
      missingLaborBudget: false,
      cprMissingSetup: false,
      subComplianceGap: false,
      needsReview: false,
      missingNonCritical: false,
      closedInActiveView: false,
    })).toBe('Yellow');
  });

  it('suppresses warnings for complete fully-billed jobs', () => {
    const row = sampleRow({
      status: 'Complete',
      billedToDate: 1_000_000,
      currentContract: 1_000_000,
      leftToBill: 0,
      missingContract: true,
      arPastDue: 50_000,
      projectedMarginPct: 10,
    });
    expect(isFullyBilledCompleteJob(row)).toBe(true);
    expect(rowWarningChips(row)).toEqual([]);
    expect(deriveHealthStatus({
      projectedMarginPct: row.projectedMarginPct,
      currentContract: row.currentContract,
      missingContract: row.missingContract,
      budgetVariance: row.budgetVariance,
      arPastDue: row.arPastDue,
      billedOverContract: false,
      budgetBasis: row.budgetBasis,
      missingPm: true,
      missingForeman: true,
      missingDrive: true,
      missingBudget: true,
      missingLaborBudget: true,
      cprMissingSetup: true,
      subComplianceGap: true,
      needsReview: true,
      missingNonCritical: true,
      closedInActiveView: false,
      fullyBilledComplete: true,
    })).toBe('Green');
  });
});
