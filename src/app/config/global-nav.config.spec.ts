import { describe, expect, it } from 'vitest';
import {
  GLOBAL_MAIN_NAV,
  sidebarBadgeForNavItem,
} from '@app/config/global-nav.config';
import { GlobalModuleBadge } from '@app/models/global-enabled-modules.types';

describe('global-nav.config', () => {
  it('defines construction-style sidebar sections', () => {
    expect(GLOBAL_MAIN_NAV.map(n => n.label)).toEqual([
      'Home',
      'Projects',
      'Financials',
      'Tasks',
      'Documents',
      'Employees',
      'Directory',
    ]);
  });

  it('highlights Home for dashboard and active 2026 control', () => {
    const home = GLOBAL_MAIN_NAV.find(n => n.id === 'home')!;
    expect(home.isActive('/')).toBe(true);
    expect(home.isActive('/active-2026-control')).toBe(true);
    expect(home.isActive('/projects')).toBe(false);
  });

  it('highlights Financials for child financial routes', () => {
    const money = GLOBAL_MAIN_NAV.find(n => n.id === 'money')!;
    expect(money.isActive('/financials')).toBe(true);
    expect(money.isActive('/wip')).toBe(true);
    expect(money.isActive('/ar')).toBe(true);
    expect(money.isActive('/foreman-bonuses')).toBe(false);
  });

  it('highlights Directory for directory and subcontractor routes', () => {
    const people = GLOBAL_MAIN_NAV.find(n => n.id === 'people')!;
    expect(people.isActive('/directory')).toBe(true);
    expect(people.isActive('/subcontractors')).toBe(true);
    expect(people.isActive('/certified-payroll')).toBe(true);
    expect(people.isActive('/labor-actuals')).toBe(true);
    expect(people.isActive('/projects')).toBe(false);
  });

  it('shows no badge when counts are zero', () => {
    const field = GLOBAL_MAIN_NAV.find(n => n.id === 'field')!;
    expect(sidebarBadgeForNavItem(field, {})).toBeUndefined();
  });

  it('aggregates urgent badges when badge sources are configured', () => {
    const field: typeof GLOBAL_MAIN_NAV[number] = {
      id: 'field',
      label: 'Tasks',
      route: '/tasks',
      icon: 'assignment',
      group: 'field',
      badgeSources: ['tasks', 'changes'],
      isActive: () => false,
    };
    const badges: Partial<Record<string, GlobalModuleBadge>> = {
      tasks: { count: 2, tone: 'urgent' },
      changes: { count: 3, tone: 'review' },
    };
    expect(sidebarBadgeForNavItem(field, badges)).toEqual({ count: 2, tone: 'urgent' });
  });
});
