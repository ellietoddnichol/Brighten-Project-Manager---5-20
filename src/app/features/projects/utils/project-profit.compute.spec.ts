import { describe, expect, it } from 'vitest';
import { computeProjectProfitMetrics } from './project-profit.compute';

describe('computeProjectProfitMetrics', () => {
  it('computes billed and cost variance when billed percent is known', () => {
    const m = computeProjectProfitMetrics({
      revisedContractAmount: 100_000,
      billedToDate: 25_000,
      costToDate: 20_000,
      estimatedTotalCost: 80_000,
    });
    expect(m.billedPercent).toBeCloseTo(0.25);
    expect(m.profitToDate).toBe(5_000);
    expect(m.expectedCostAtBilledPercent).toBeCloseTo(20_000);
    expect(m.costVariance).toBeCloseTo(0);
    expect(m.projectedTotalCost).toBeCloseTo(80_000);
    expect(m.projectedProfit).toBeCloseTo(20_000);
    expect(m.projectedMargin).toBeCloseTo(0.2);
  });

  it('returns null projected cost when nothing billed yet', () => {
    const m = computeProjectProfitMetrics({
      revisedContractAmount: 50_000,
      billedToDate: 0,
      costToDate: 1_000,
      estimatedTotalCost: 40_000,
    });
    expect(m.billedPercent).toBeNull();
    expect(m.projectedTotalCost).toBeNull();
    expect(m.profitToDate).toBe(-1_000);
  });
});
