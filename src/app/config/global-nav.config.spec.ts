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
      'Projects',
      'Tasks',
      'Financials',
      'Documents',
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
    const fin = GLOBAL_MAIN_NAV.find(n => n.id === 'financials')!;
    expect(fin.isActive('/financials')).toBe(true);
    expect(fin.isActive('/wip')).toBe(true);
    expect(fin.isActive('/ar')).toBe(true);
    expect(fin.isActive('/foreman-bonuses')).toBe(true);
  });

  it('shows no badge when counts are zero', () => {
    const tasks = GLOBAL_MAIN_NAV.find(n => n.id === 'tasks')!;
    expect(sidebarBadgeForNavItem(tasks, {})).toBeUndefined();
  });

  it('aggregates urgent badges for tasks section', () => {
    const tasks = GLOBAL_MAIN_NAV.find(n => n.id === 'tasks')!;
    const badges: Partial<Record<string, GlobalModuleBadge>> = {
      tasks: { count: 2, tone: 'urgent' },
      changes: { count: 3, tone: 'review' },
    };
    expect(sidebarBadgeForNavItem(tasks, badges)).toEqual({ count: 2, tone: 'urgent' });
  });
});
