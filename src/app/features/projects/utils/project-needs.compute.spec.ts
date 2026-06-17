import { describe, expect, it } from 'vitest';
import { computeProjectEnabledModules, workflowChipVisible } from '@features/projects/utils/project-needs.compute';
import { ProjectNeedsInput } from '@app/models/project-needs.types';

function baseInput(overrides: Partial<ProjectNeedsInput> = {}): ProjectNeedsInput {
  return {
    projectId: 'p1',
    isActive2026: true,
    prevailingWage: false,
    certifiedPayrollRequired: false,
    bonusEligible: false,
    hasForemanAssignment: false,
    hasLaborBudget: false,
    hasDriveFolder: true,
    hasRFIs: false,
    hasSubmittals: false,
    hasDailyLogs: false,
    hasFieldIssues: false,
    hasOpenTasks: false,
    hasCPRRecords: false,
    hasSubs: false,
    hasPOs: false,
    hasSubcontractorCosts: false,
    hasSubInvoices: false,
    hasAR: false,
    hasBilling: false,
    hasQuickBooksDetailCosts: false,
    hasApprovedCoNotBilled: false,
    hasBonusRecords: false,
    requiresRfis: false,
    requiresSubmittals: false,
    requiresDailyLogs: false,
    hasMaterialScope: false,
    hasSafetyRecords: false,
    hasInspectionRecords: false,
    isCloseoutOrClosed: false,
    showAllTools: false,
    projectProfile: 'SmallJob',
    ...overrides,
  };
}

describe('project-needs.compute', () => {
  it('hides RFIs and CPR for small install by default', () => {
    const modules = computeProjectEnabledModules(baseInput({ projectProfile: 'SmallJob' }));
    expect(modules.workMore).not.toContain('rfis');
    expect(modules.workMore).not.toContain('certified-payroll');
    expect(modules.moneyPrimary).not.toContain('pos');
  });

  it('shows commitments when subs exist', () => {
    const modules = computeProjectEnabledModules(baseInput({ hasSubs: true }));
    expect(modules.moneyPrimary).toContain('pos');
  });

  it('shows all tools when toggled', () => {
    const modules = computeProjectEnabledModules(baseInput({ showAllTools: true }));
    expect(modules.workMore).toContain('rfis');
    expect(modules.moneyMore.length).toBeGreaterThan(0);
  });

  it('hides CPR from project workflows for now', () => {
    const withRequired = computeProjectEnabledModules(baseInput({
      certifiedPayrollRequired: true,
    }));
    expect(withRequired.workMore).not.toContain('certified-payroll');

    const withRecords = computeProjectEnabledModules(baseInput({
      hasCPRRecords: true,
      showAllTools: true,
    }));
    expect(withRecords.workMore).not.toContain('certified-payroll');
  });

  it('shows daily logs when required by profile', () => {
    const modules = computeProjectEnabledModules(baseInput({ projectProfile: 'TM', requiresDailyLogs: true }));
    expect(modules.workMore).toContain('daily-logs');
    const withLogs = computeProjectEnabledModules(baseInput({ hasDailyLogs: true }));
    expect(withLogs.workMore).toContain('daily-logs');
  });

  it('filters zero-count optional workflow chips', () => {
    const modules = computeProjectEnabledModules(baseInput());
    expect(workflowChipVisible('rfis', modules, 0, false)).toBe(false);
    expect(workflowChipVisible('changes', modules, 0, false)).toBe(true);
  });
});
