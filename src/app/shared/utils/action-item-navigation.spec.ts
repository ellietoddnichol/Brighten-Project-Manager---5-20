import { describe, expect, it } from 'vitest';
import { resolveActionItemNav } from '@shared/utils/action-item-navigation';
import { ActionItem } from '@shared/utils/action-items';

function item(overrides: Partial<ActionItem>): ActionItem {
  return {
    id: 'x',
    projectId: 'p1',
    projectName: 'Test',
    title: 'Test',
    description: 'Test',
    type: 'Budget',
    severity: 'warning',
    ...overrides,
  };
}

describe('action-item-navigation', () => {
  it('routes missing budget to budget view', () => {
    const hint = resolveActionItemNav(item({
      id: 'budget-est-p1',
      title: 'Missing Budget',
      type: 'Budget',
    }));
    expect(hint.nav.section).toBe('financials');
    expect(hint.nav.financialView).toBe('budget');
  });

  it('routes overbilling to wip view', () => {
    const hint = resolveActionItemNav(item({
      id: 'overbill-p1',
      title: 'Overbilling',
      type: 'WIP',
    }));
    expect(hint.nav.financialView).toBe('wip');
  });

  it('routes missing wage order to certified payroll', () => {
    const hint = resolveActionItemNav(item({
      id: 'cpr-wage-order-p1',
      title: 'Missing Wage Order',
      type: 'Certified Payroll',
    }));
    expect(hint.nav.section).toBe('workflows');
    expect(hint.nav.workflowView).toBe('certified-payroll');
  });

  it('routes foreman bonus assignment to labor bonus', () => {
    const hint = resolveActionItemNav(item({
      id: 'foreman-bonus-assign-p1',
      title: 'Assign foreman for labor bonus',
      type: 'Foreman Bonus',
    }));
    expect(hint.nav.financialView).toBe('labor-bonus');
  });
});
