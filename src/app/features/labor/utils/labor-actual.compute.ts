import { NormalizedLaborEntry } from '@app/models/labor.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { Employee, Project, TimeEntry } from '@app/models/types';
import { weekEndingSaturday, weekStartSundayFromEnding, safeFirestoreId } from '@features/labor/utils/certified-payroll-week';

const APPROVED_STATUSES = new Set(['approved', 'approve', 'yes', 'y']);

export function isApprovedTimeStatus(status?: string): boolean {
  return APPROVED_STATUSES.has((status ?? 'approved').trim().toLowerCase());
}

export function weekStartFromEnding(weekEnd: string): string {
  return weekStartSundayFromEnding(weekEnd);
}

export function laborActualFromNormalizedEntry(
  entry: NormalizedLaborEntry,
  project?: Project,
): ProjectLaborActual | null {
  if (!entry.workDate || !entry.projectId) return null;
  const weekEnd = weekEndingSaturday(entry.workDate);
  return {
    id: safeFirestoreId(`norm-${entry.id}`),
    projectId: entry.projectId,
    jobNumber: entry.projectNumber ?? project?.projectNumber,
    projectName: entry.projectName ?? project?.projectName,
    employeeName: entry.employeeName,
    workDate: entry.workDate.slice(0, 10),
    weekStart: weekStartFromEnding(weekEnd),
    weekEnd,
    classification: entry.classification,
    laborCode: entry.laborCode,
    regularHours: entry.regularHours ?? 0,
    overtimeHours: entry.overtimeHours ?? 0,
    doubleTimeHours: entry.doubleTimeHours ?? 0,
    totalHours: entry.totalHours ?? 0,
    baseRate: entry.baseRate,
    fringeRate: entry.fringeRate,
    totalLaborCost: entry.estimatedLaborTotal ?? entry.wageCost ?? 0,
    sourceTimeLogIds: [entry.id],
    approvalStatus: 'Approved',
    source: 'TimeLog',
  };
}

export function laborActualFromTimeEntry(
  entry: TimeEntry,
  project?: Project,
  employee?: Employee,
): ProjectLaborActual | null {
  if (!entry.projectId || !entry.workDate) return null;
  if (!isApprovedTimeStatus(entry.approvalStatus)) return null;

  const weekEnd = weekEndingSaturday(entry.workDate);
  const baseRate = employee?.payPerHour ?? 0;
  const regularHours = entry.regularHours ?? 0;
  const overtimeHours = entry.overtimeHours ?? 0;
  const doubleTimeHours = entry.doubleTimeHours ?? 0;
  const totalHours = entry.totalHours ?? regularHours + overtimeHours + doubleTimeHours;
  const totalLaborCost = regularHours * baseRate
    + overtimeHours * baseRate * 1.5
    + doubleTimeHours * baseRate * 2;

  return {
    id: safeFirestoreId(`te-${entry.id}`),
    projectId: entry.projectId,
    jobNumber: project?.projectNumber,
    projectName: project?.projectName ?? entry.jobName,
    employeeId: employee?.id,
    employeeName: entry.employeeName,
    workDate: entry.workDate.slice(0, 10),
    weekStart: weekStartFromEnding(weekEnd),
    weekEnd,
    classification: entry.classification,
    regularHours,
    overtimeHours,
    doubleTimeHours,
    totalHours,
    baseRate: baseRate || undefined,
    totalLaborCost,
    sourceTimeLogIds: [entry.recordId ?? entry.id],
    approvalStatus: 'Approved',
    source: entry.source === 'manual' ? 'Manual' : 'Imported',
  };
}

export function buildLaborActuals(
  normalizedEntries: NormalizedLaborEntry[],
  timeEntries: TimeEntry[],
  projects: Project[],
  employees: Employee[] = [],
): ProjectLaborActual[] {
  const byId = new Map<string, ProjectLaborActual>();
  const projectById = new Map(projects.map(p => [p.id, p]));
  const employeeByName = new Map(
    employees.map(e => [(e.name ?? '').trim().toLowerCase(), e]),
  );

  for (const entry of normalizedEntries) {
    if (!entry.projectId) continue;
    const project = projectById.get(entry.projectId);
    const actual = laborActualFromNormalizedEntry(entry, project);
    if (actual) byId.set(actual.id, actual);
  }

  for (const entry of timeEntries) {
    if (!entry.projectId || !isApprovedTimeStatus(entry.approvalStatus)) continue;
    const project = projectById.get(entry.projectId);
    const employee = employeeByName.get((entry.employeeName ?? '').trim().toLowerCase());
    const actual = laborActualFromTimeEntry(entry, project, employee);
    if (!actual) continue;
    const existing = [...byId.values()].find(a =>
      a.projectId === actual.projectId
      && a.workDate === actual.workDate
      && (a.employeeName ?? '').toLowerCase() === (actual.employeeName ?? '').toLowerCase(),
    );
    if (!existing) byId.set(actual.id, actual);
  }

  return [...byId.values()];
}

export function laborCostFromActuals(projectId: string, actuals: ProjectLaborActual[]): number {
  return actuals
    .filter(a => a.projectId === projectId && a.approvalStatus === 'Approved')
    .reduce((s, a) => s + (a.totalLaborCost ?? 0), 0);
}
