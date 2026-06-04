import { describe, expect, it } from 'vitest';
import { mapFinancialSummaryResponse } from './project-financial-api.mapper';

describe('mapFinancialSummaryResponse', () => {
  it('maps decimal strings and warnings from SQL financial summary', () => {
    const summary = mapFinancialSummaryResponse({
      ok: true,
      source: 'sql',
      asOfDate: '2026-06-03T05:00:00.000Z',
      item: {
        projectId: 'J158',
        jobNumber: '158',
        contract: {
          originalContractAmount: '167660.00',
          revisedContractAmount: '167660.00',
        },
        billing: {
          billedToDate: '0.00',
          remainingToBill: '167660.00',
          arBalance: '5188.50',
        },
        cost: {
          estimatedCost: null,
          actualCost: '522.33',
          laborActual: '212.41',
          materialsActual: '87.42',
          subcontractorsActual: '0.00',
          otherPreconActual: '222.50',
        },
        profit: {
          profit: '4666.17',
          marginPercent: '89.9329',
        },
        dataWarnings: ['Estimated cost is not available from SQL.'],
      },
    });

    expect(summary.source).toBe('sql');
    expect(summary.asOfDate).toBe('2026-06-03');
    expect(summary.contract.originalContractAmount).toBe(167660);
    expect(summary.billing.arBalance).toBe(5188.5);
    expect(summary.cost.estimatedCost).toBeNull();
    expect(summary.cost.subcontractorsActual).toBe(0);
    expect(summary.profit.marginPercent).toBe(89.9329);
    expect(summary.dataWarnings).toContain('Estimated cost is not available from SQL.');
  });

  it('keeps missing numeric fields as null', () => {
    const summary = mapFinancialSummaryResponse({
      ok: true,
      source: 'sql',
      asOfDate: null,
      item: {
        projectId: 'J220',
        jobNumber: '220',
        contract: { originalContractAmount: null, revisedContractAmount: null },
        billing: { billedToDate: null, remainingToBill: null, arBalance: null },
        cost: {
          estimatedCost: null,
          actualCost: null,
          laborActual: null,
          materialsActual: null,
          subcontractorsActual: null,
          otherPreconActual: null,
        },
        profit: { profit: null, marginPercent: null },
        dataWarnings: [],
      },
    });

    expect(summary.asOfDate).toBeNull();
    expect(summary.contract.revisedContractAmount).toBeNull();
    expect(summary.billing.remainingToBill).toBeNull();
    expect(summary.profit.profit).toBeNull();
  });
});
