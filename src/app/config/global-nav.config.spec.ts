import { describe, expect, it } from 'vitest';
import {
  GLOBAL_MAIN_NAV,
  sidebarBadgeForNavItem,
} from '../config/global-nav.config';
import { GlobalModuleBadge } from '../models/global-enabled-modules.types';

describe('global-nav.config', () => {
  it('defines construction-style sidebar sections', () => {
    expect(GLOBAL_MAIN_NAV.map(n => n.label)).toEqual([
      'Home',
      'Jobs',
      'Money',
      'Field',
      'Documents',
      'People & Subs',
      'Payroll',
    ]);
  });

  it('highlights Home for dashboard and active 2026 control', () => {
    const home = GLOBAL_MAIN_NAV.find(n => n.id === 'home')!;
    expect(home.isActive('/')).toBe(true);
    expect(home.isActive('/active-2026-control')).toBe(true);
    expect(home.isActive('/projects')).toBe(false);
  });

  it('highlights Money for child financial routes', () => {
    const money = GLOBAL_MAIN_NAV.find(n => n.id === 'money')!;
    expect(money.isActive('/financials')).toBe(true);
    expect(money.isActive('/wip')).toBe(true);
    expect(money.isActive('/ar')).toBe(true);
    expect(money.isActive('/foreman-bonuses')).toBe(false);
  });

  it('highlights Payroll for payroll and labor routes', () => {
    const payroll = GLOBAL_MAIN_NAV.find(n => n.id === 'payroll')!;
    expect(payroll.isActive('/certified-payroll')).toBe(true);
    expect(payroll.isActive('/labor-actuals')).toBe(true);
    expect(payroll.isActive('/foreman-bonuses')).toBe(true);
  });

  it('shows no badge when counts are zero', () => {
    const field = GLOBAL_MAIN_NAV.find(n => n.id === 'field')!;
    expect(sidebarBadgeForNavItem(field, {})).toBeUndefined();
  });

  it('aggregates urgent badges for field section', () => {
    const field = GLOBAL_MAIN_NAV.find(n => n.id === 'field')!;
    const badges: Partial<Record<string, GlobalModuleBadge>> = {
      tasks: { count: 2, tone: 'urgent' },
      changes: { count: 3, tone: 'review' },
    };
    expect(sidebarBadgeForNavItem(field, badges)).toEqual({ count: 2, tone: 'urgent' });
  });
});
