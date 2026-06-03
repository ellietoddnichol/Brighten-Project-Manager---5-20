import { describe, expect, it } from 'vitest';
import {
  buildAllWorkList,
  buildChangeList,
  filterChangeListBySegment,
  filterTasksBySegment,
  requiredWorkPrompts,
  WorkBuildInput,
} from '@features/projects/utils/project-work.compute';

function baseInput(overrides: Partial<WorkBuildInput> = {}): WorkBuildInput {
  return {
    projectId: 'p1',
    showAllTools: false,
    requiresRfis: false,
    requiresSubmittals: false,
    requiresDailyLogs: false,
    certifiedPayrollRequired: false,
    prevailingWage: false,
    showRfis: false,
    showSubmittals: false,
    showDailyLogs: false,
    showFieldIssues: false,
    showCpr: false,
    hasRFIs: false,
    hasSubmittals: false,
    hasDailyLogs: false,
    hasFieldIssues: false,
    hasCPRRecords: false,
    tasks: [],
    changeRequests: [],
    changeOrders: [],
    rfis: [],
    submittals: [],
    dailyLogs: [],
    fieldIssues: [],
    cprWeeks: [],
    ...overrides,
  };
}

describe('project-work.compute', () => {
  it('builds prioritized all-work list from open items', () => {
    const rows = buildAllWorkList(baseInput({
      tasks: [{
        id: 't1', projectId: 'p1', title: 'Overdue task', status: 'In Progress',
        dueDate: '2020-01-01', priority: 'High', source: 'manual',
      }],
      changeOrders: [{
        id: 'co1', projectId: 'p1', coNumber: 'CO-001', status: 'Approved', billingStatus: 'Approved',
        title: 'Approved CO', approvedAmount: 5000,
      }],
    }));
    expect(rows.length).toBe(2);
    expect(rows[0].kind).toBe('task');
    expect(rows.some(r => r.kind === 'change-order')).toBe(true);
  });

  it('hides optional workflows when not visible', () => {
    const rows = buildAllWorkList(baseInput({
      showRfis: true,
      hasRFIs: true,
      rfis: [{ id: 'r1', projectId: 'p1', status: 'Submitted', title: 'Hidden RFI' }],
    }));
    expect(rows.some(r => r.kind === 'rfi')).toBe(true);

    const hidden = buildAllWorkList(baseInput({
      showRfis: false,
      hasRFIs: true,
      rfis: [{ id: 'r1', projectId: 'p1', status: 'Submitted', title: 'Hidden RFI' }],
    }));
    expect(hidden.some(r => r.kind === 'rfi')).toBe(false);
  });

  it('ignores auto-generated setup prompts', () => {
    const prompts = requiredWorkPrompts(baseInput({
      certifiedPayrollRequired: true,
      showCpr: true,
      requiresSubmittals: true,
      showSubmittals: true,
    }));
    expect(prompts).toEqual([]);
  });

  it('hides system tasks from all-work and filters', () => {
    const rows = buildAllWorkList(baseInput({
      tasks: [
        { id: 't1', projectId: 'p1', title: 'Manual', status: 'In Progress', source: 'manual' },
        { id: 't2', projectId: 'p1', title: 'Auto', status: 'In Progress', source: 'system' },
      ],
    }));
    expect(rows.filter(r => r.kind === 'task')).toHaveLength(1);
    expect(rows[0].title).toBe('Manual');

    const overdue = filterTasksBySegment([
      { id: 't1', projectId: 'p1', title: 'Manual', status: 'In Progress', dueDate: '2020-01-01', source: 'manual' },
      { id: 't2', projectId: 'p1', title: 'Auto', status: 'In Progress', dueDate: '2020-01-01', source: 'system' },
    ], 'p1', 'overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].id).toBe('t1');
  });

  it('filters tasks by overdue segment', () => {
    const tasks = filterTasksBySegment([
      { id: 't1', projectId: 'p1', title: 'Late', status: 'In Progress', dueDate: '2020-01-01', source: 'manual' },
      { id: 't2', projectId: 'p1', title: 'Future', status: 'In Progress', dueDate: '2099-01-01', source: 'manual' },
    ], 'p1', 'overdue');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('t1');
  });

  it('unifies CR and CO lists with change segments', () => {
    const items = buildChangeList(
      [{ id: 'cr1', projectId: 'p1', status: 'Pricing', title: 'CR' }],
      [{ id: 'co1', projectId: 'p1', coNumber: 'CO-001', status: 'Sent', title: 'CO' }],
      'p1',
    );
    expect(items).toHaveLength(2);
    const pricing = filterChangeListBySegment(items, 'pricing');
    expect(pricing.some(i => i.kind === 'cr')).toBe(true);
    const awaiting = filterChangeListBySegment(items, 'awaiting');
    expect(awaiting.some(i => i.kind === 'co')).toBe(true);
  });
});
