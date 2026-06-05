import { describe, expect, it } from 'vitest';
import { NormalizedLaborEntry } from '@app/models/labor.types';
import {
  buildEmployeeHoursRows,
  buildProjectHoursRows,
  entryMatchesProject,
  filterEntriesForProject,
} from './labor-hours-summary.compute';

function entry(partial: Partial<NormalizedLaborEntry>): NormalizedLaborEntry {
  return {
    id: partial.id ?? '1',
    regularHours: 0,
    overtimeHours: 0,
    doubleTimeHours: 0,
    totalHours: 0,
    regularWageCost: 0,
    overtimeWageCost: 0,
    doubleTimeWageCost: 0,
    wageCost: 0,
    fringeCost: 0,
    estimatedLaborTotal: 0,
    month: '2026-06',
    rateSource: 'missing',
    rateMissing: false,
    ...partial,
  };
}

describe('labor-hours-summary.compute', () => {
  it('matches project by id or job number', () => {
    expect(entryMatchesProject(
      entry({ projectId: 'p1', projectNumber: '204' }),
      { id: 'p1', projectNumber: '204' },
    )).toBe(true);
    expect(entryMatchesProject(
      entry({ jobIdLabel: 'J204', projectNumber: undefined }),
      { id: 'p1', projectNumber: '204' },
    )).toBe(true);
  });

  it('builds employee hour rows', () => {
    const rows = buildEmployeeHoursRows([
      entry({ employeeName: 'Alex', regularHours: 8, totalHours: 8 }),
      entry({ employeeName: 'Alex', regularHours: 4, overtimeHours: 2, totalHours: 6 }),
      entry({ employeeName: 'Sam', regularHours: 10, totalHours: 10 }),
    ]);
    expect(rows[0].employeeName).toBe('Alex');
    expect(rows[0].totalHours).toBe(14);
    expect(rows[1].totalHours).toBe(10);
  });

  it('filters and rolls up project hours for a month', () => {
    const projects = [{ id: 'p1', projectNumber: '204', projectName: 'School' }];
    const rows = buildProjectHoursRows([
      entry({ projectId: 'p1', employeeName: 'Alex', regularHours: 8, totalHours: 8, month: '2026-06' }),
      entry({ projectId: 'p1', employeeName: 'Sam', regularHours: 6, totalHours: 6, month: '2026-06' }),
      entry({ projectId: 'p1', employeeName: 'Alex', regularHours: 4, totalHours: 4, month: '2026-05' }),
    ], projects as never[], '2026-06');

    expect(rows).toHaveLength(1);
    expect(rows[0].totalHours).toBe(14);
    expect(rows[0].employeeCount).toBe(2);
  });

  it('filters entries for one project', () => {
    const scoped = filterEntriesForProject([
      entry({ projectId: 'p1', totalHours: 5 }),
      entry({ projectId: 'p2', totalHours: 3 }),
    ], { id: 'p1', projectNumber: '204' }, 'all');
    expect(scoped).toHaveLength(1);
    expect(scoped[0].totalHours).toBe(5);
  });
});
