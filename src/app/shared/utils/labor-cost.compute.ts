import { Employee } from '@app/models/types';
import { ProjectLaborEntry } from '@app/models/job-record.types';

export function computeLaborCostFromHours(
  regularHours: number,
  overtimeHours: number,
  doubleTimeHours: number,
  ratePerHour: number,
): number {
  if (!ratePerHour || ratePerHour <= 0) return 0;
  return regularHours * ratePerHour
    + overtimeHours * ratePerHour * 1.5
    + doubleTimeHours * ratePerHour * 2;
}

export function findEmployeeByName(employees: Employee[], name?: string): Employee | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key) return undefined;
  return employees.find(e => (e.name ?? '').trim().toLowerCase() === key);
}

export function resolveHourlyRate(
  employees: Employee[],
  opts: { employeeId?: string; employeeName?: string; costRate?: number },
): number {
  if (opts.costRate != null && opts.costRate > 0) return opts.costRate;
  const employee = opts.employeeId
    ? employees.find(e => e.id === opts.employeeId)
    : findEmployeeByName(employees, opts.employeeName);
  return employee?.payPerHour ?? 0;
}

export function laborCostForManualEntry(entry: ProjectLaborEntry, employees: Employee[]): number {
  const rate = resolveHourlyRate(employees, {
    employeeId: entry.employeeId,
    employeeName: entry.employeeName,
    costRate: entry.costRate,
  });
  if (rate > 0) {
    return computeLaborCostFromHours(
      entry.regularHours ?? 0,
      entry.overtimeHours ?? 0,
      entry.doubleTimeHours ?? 0,
      rate,
    );
  }
  return entry.laborCost ?? 0;
}

export function laborCostForTimeEntry(
  entry: { employeeName?: string; regularHours?: number; overtimeHours?: number; doubleTimeHours?: number },
  employees: Employee[],
): number {
  const rate = resolveHourlyRate(employees, { employeeName: entry.employeeName });
  return computeLaborCostFromHours(
    entry.regularHours ?? 0,
    entry.overtimeHours ?? 0,
    entry.doubleTimeHours ?? 0,
    rate,
  );
}
