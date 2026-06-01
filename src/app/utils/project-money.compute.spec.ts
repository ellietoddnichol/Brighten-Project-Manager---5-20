import { describe, expect, it } from 'vitest';
import {
  deriveMoneyNextAction,
  isMissingRealBudget,
  missingMoneyPrompts,
  moneyOverviewCards,
} from './project-money.compute';
import { ProjectFinancial } from '../models/financial.types';
import { Project } from '../models/types';

function fin(overrides: Partial<ProjectFinancial> = {}): ProjectFinancial {
  return {
    currentContractAmount: 100000,
    budgetAmount: 80000,
    costToDate: 50000,
    forecastMargin: 22,
    forecastGrossProfit: 22000,
    budgetIsEstimated: false,
    budgetBasis: 'Imported',
    leftToBill: 40000,
    arBalance: 0,
    retainageHeld: 0,
    ...overrides,
  } as ProjectFinancial;
}

const project = { id: 'p1', projectNumber: '204', projectName: 'Test', customer: 'C', status: 'Active' } as Project;

describe('project-money.compute', () => {
  it('does not treat estimated budget as missing', () => {
    expect(isMissingRealBudget(fin({ budgetIsEstimated: true, budgetAmount: 80000 }))).toBe(false);
  });

  it('shows at most 4 overview cards', () => {
    expect(moneyOverviewCards(fin()).length).toBe(4);
  });

  it('prioritizes missing contract action', () => {
    const action = deriveMoneyNextAction({
      projectId: 'p1',
      financial: fin({ currentContractAmount: 0, budgetBasis: 'MissingContract' }),
      missingContract: true,
      missingRealBudget: false,
      hasApprovedCoNotBilled: false,
      arPastDue: 0,
      arBalance: 0,
      costOverBudget: false,
      subComplianceGap: false,
      qbReviewNeeded: false,
      isCloseout: false,
    });
    expect(action.label).toBe('Add contract amount');
  });

  it('skips missing budget prompt when estimated', () => {
    const prompts = missingMoneyPrompts(project, fin({ budgetIsEstimated: true }), false);
    expect(prompts.some(p => p.id === 'missing-budget')).toBe(false);
  });
});
