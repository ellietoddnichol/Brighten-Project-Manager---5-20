import {
  computeLaborCostFromHours,
  findEmployeeByName,
  laborCostForManualEntry,
  laborCostForTimeEntry,
  resolveHourlyRate,
} from './labor-cost.compute';
import { Employee } from '@app/models/types';
import { ProjectLaborEntry } from '@app/models/job-record.types';

describe('labor-cost.compute', () => {
  const employees: Employee[] = [
    { id: 'e1', name: 'Jane Doe', payPerHour: 40 },
    { id: 'e2', name: 'John Smith', payPerHour: 55 },
  ];

  it('computes reg, OT, and DT from hourly rate', () => {
    expect(computeLaborCostFromHours(8, 2, 1, 40)).toBe(8 * 40 + 2 * 40 * 1.5 + 1 * 40 * 2);
  });

  it('matches employees case-insensitively', () => {
    expect(findEmployeeByName(employees, 'jane doe')?.id).toBe('e1');
    expect(findEmployeeByName(employees, 'Dustin Miller')?.id).toBe('e2');
    expect(findEmployeeByName([{ id: 'e3', name: 'Miller, Dustin', payPerHour: 50 }], 'Dustin Miller')?.payPerHour).toBe(50);
  });

  it('resolves rate from employee name', () => {
    expect(resolveHourlyRate(employees, { employeeName: 'John Smith' })).toBe(55);
  });

  it('prefers cost rate override', () => {
    expect(resolveHourlyRate(employees, { employeeName: 'Jane Doe', costRate: 60 })).toBe(60);
  });

  it('computes manual entry cost from employee pay', () => {
    const entry: ProjectLaborEntry = {
      id: '1',
      projectId: 'p1',
      workDate: '2026-01-01',
      employeeName: 'Jane Doe',
      regularHours: 8,
      overtimeHours: 0,
      doubleTimeHours: 0,
      totalHours: 8,
    };
    expect(laborCostForManualEntry(entry, employees)).toBe(320);
  });

  it('computes synced time entry cost from employee pay', () => {
    expect(
      laborCostForTimeEntry(
        { employeeName: 'John Smith', regularHours: 10, overtimeHours: 0, doubleTimeHours: 0 },
        employees,
      ),
    ).toBe(550);
  });
});
