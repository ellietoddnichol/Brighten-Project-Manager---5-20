import { describe, expect, it } from 'vitest';
import { computeGlobalEnabledModules, isGlobalModuleVisible } from './global-enabled-modules.compute';
import { GlobalNeedsInput } from '../models/global-enabled-modules.types';
import { DEFAULT_PINNED_TOOLS } from './global-pinned-tools';

function baseInput(overrides: Partial<GlobalNeedsInput> = {}): GlobalNeedsInput {
  return {
    active2026JobCount: 5,
    atRiskJobCount: 1,
    openArTotal: 10000,
    arPastDueCount: 0,
    openTaskCount: 3,
    overdueTaskCount: 0,
    openChangeCount: 2,
    changesNeedingActionCount: 0,
    openRfiCount: 0,
    overdueRfiCount: 0,
    openSubmittalCount: 0,
    overdueSubmittalCount: 0,
    dailyLogCount: 0,
    dailyLogsRequiredOnActiveJob: false,
    openFieldIssueCount: 0,
    cprRequiredJobCount: 0,
    cprRecordCount: 0,
    cprExceptionCount: 0,
    safetyItemCount: 0,
    inspectionItemCount: 0,
    wipNeedsReviewCount: 0,
    subComplianceGapCount: 0,
    foremanBonusReviewCount: 0,
    hasForemanBonusRecords: false,
    hasBonusEligibleJobs: false,
    importReviewExceptionCount: 0,
    seedCompletenessIssueCount: 0,
    hasQuickBooksDetailCosts: false,
    hasSubInvoices: false,
    hasGeneratedDocs: false,
    missingRequiredDocCount: 0,
    hasLaborActuals: false,
    hasCloseoutJobs: false,
    hasSubsOrPos: false,
    billingActionCount: 0,
    pinnedTools: [...DEFAULT_PINNED_TOOLS],
    showAllTools: false,
    ...overrides,
  };
}

describe('global-enabled-modules.compute', () => {
  it('hides RFIs when none exist globally', () => {
    expect(isGlobalModuleVisible('rfis', baseInput())).toBe(false);
    const modules = computeGlobalEnabledModules(baseInput());
    expect(modules.hiddenModules).toContain('rfis');
  });

  it('shows RFIs when open RFIs exist', () => {
    const input = baseInput({ openRfiCount: 2 });
    expect(isGlobalModuleVisible('rfis', input)).toBe(true);
    const modules = computeGlobalEnabledModules(input);
    const workMore = modules.groups.find(g => g.id === 'work')?.subgroups?.flatMap(s => s.items) ?? [];
    expect(workMore.some(i => i.id === 'rfis')).toBe(true);
  });

  it('hides certified payroll in the UI for now', () => {
    const input = baseInput({ cprRequiredJobCount: 1, cprExceptionCount: 5 });
    expect(isGlobalModuleVisible('certified-payroll', input)).toBe(false);
  });

  it('does not badge AR as urgent when past due exists', () => {
    const modules = computeGlobalEnabledModules(baseInput({ arPastDueCount: 3 }));
    expect(modules.badges.ar).toBeUndefined();
    expect(modules.urgentModules).not.toContain('ar');
  });

  it('shows import review when exceptions exist', () => {
    expect(isGlobalModuleVisible('import-review', baseInput({ importReviewExceptionCount: 4 }))).toBe(true);
  });

  it('keeps pinned tools visible even when module would hide', () => {
    const input = baseInput({
      pinnedTools: [...DEFAULT_PINNED_TOOLS, 'rfis'],
      openRfiCount: 0,
    });
    expect(isGlobalModuleVisible('rfis', input)).toBe(true);
  });

  it('shows all tools when toggled', () => {
    const modules = computeGlobalEnabledModules(baseInput({ showAllTools: true }));
    expect(modules.hiddenModules.length).toBe(0);
  });

  it('keeps pinned hidden tools visible and dedupes groups', () => {
    const input = baseInput({
      pinnedTools: ['rfis', 'tasks', 'wip', 'ar', 'projects', 'active-2026-control'],
      openRfiCount: 0,
    });
    const modules = computeGlobalEnabledModules(input);
    expect(modules.pinned.some(p => p.id === 'rfis')).toBe(true);
    const workItems = modules.groups.find(g => g.id === 'work')?.items ?? [];
    expect(workItems.some(i => i.id === 'tasks')).toBe(false);
    const finItems = modules.groups.find(g => g.id === 'financials')?.items ?? [];
    expect(finItems.some(i => i.id === 'wip')).toBe(false);
  });

  it('builds simplified dashboard cards', () => {
    const modules = computeGlobalEnabledModules(baseInput({ atRiskJobCount: 2, arPastDueCount: 1 }));
    expect(modules.dashboardCards).toHaveLength(4);
    expect(modules.dashboardList.some(i => i.id === 'ar-past-due')).toBe(false);
    expect(modules.dashboardCards.find(c => c.id === 'open-ar')?.alert).toBeFalsy();
  });
});
