import { describe, expect, it } from 'vitest';
import { rollupJobCostBudgetLines } from '@features/financials/utils/job-cost-budget-parser';
import { JobCostBudgetLineSeed } from '@app/data/job-cost-budget.types';

describe('rollupJobCostBudgetLines', () => {
  it('collapses detailed lines into four summary categories', () => {
    const lines: JobCostBudgetLineSeed[] = [
      { costCode: '100', category: 'Labor', originalBudget: 1000, approvedCOBudget: 0, revisedBudget: 1000, actualCost: 200, costToComplete: 800, projectedFinalCost: 1000, variance: -800 },
      { costCode: '200', category: 'Labor', originalBudget: 500, approvedCOBudget: 0, revisedBudget: 500, actualCost: 100, costToComplete: 400, projectedFinalCost: 500, variance: -400 },
      { costCode: '300', category: 'Materials', originalBudget: 800, approvedCOBudget: 0, revisedBudget: 800, actualCost: 0, costToComplete: 800, projectedFinalCost: 800, variance: -800 },
      { costCode: '400', category: 'Subcontractors', originalBudget: 2000, approvedCOBudget: 0, revisedBudget: 2000, actualCost: 500, costToComplete: 1500, projectedFinalCost: 2000, variance: -1500 },
      { costCode: '500', category: 'Equipment', originalBudget: 300, approvedCOBudget: 0, revisedBudget: 300, actualCost: 50, costToComplete: 250, projectedFinalCost: 300, variance: -250 },
      { costCode: '600', category: 'Other', originalBudget: 100, approvedCOBudget: 0, revisedBudget: 100, actualCost: 0, costToComplete: 100, projectedFinalCost: 100, variance: -100 },
    ];

    const rolled = rollupJobCostBudgetLines(lines);
    expect(rolled).toHaveLength(4);
    expect(rolled.find(l => l.category === 'Labor')?.revisedBudget).toBe(1500);
    expect(rolled.find(l => l.category === 'Materials')?.revisedBudget).toBe(800);
    expect(rolled.find(l => l.category === 'Subcontractors')?.revisedBudget).toBe(2000);
    expect(rolled.find(l => l.category === 'Other')?.revisedBudget).toBe(400);
  });
});
