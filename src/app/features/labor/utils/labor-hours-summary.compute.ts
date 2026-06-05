import { NormalizedLaborEntry } from '@app/models/labor.types';
import { Project } from '@app/models/types';
import { normalizeJobNumberKey } from '@features/labor/utils/labor-by-classification.compute';

export interface ProjectHoursRow {
  projectNumber: string;
  projectName: string;
  projectId?: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  employeeCount: number;
}

export interface EmployeeHoursRow {
  employeeName: string;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
}

export function currentLaborMonthKey(ref = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

export function entryMatchesProject(
  entry: NormalizedLaborEntry,
  project: Pick<Project, 'id' | 'projectNumber'>,
): boolean {
  if (entry.projectId && entry.projectId === project.id) return true;
  const entryNum = normalizeJobNumberKey(entry.projectNumber ?? entry.jobIdLabel);
  const projectNum = normalizeJobNumberKey(project.projectNumber);
  return !!entryNum && !!projectNum && entryNum === projectNum;
}

export function filterEntriesForProject(
  entries: NormalizedLaborEntry[],
  project: Pick<Project, 'id' | 'projectNumber'>,
  month: string | 'all' = 'all',
): NormalizedLaborEntry[] {
  return entries.filter(entry => {
    if (month !== 'all' && entry.month !== month) return false;
    return entryMatchesProject(entry, project);
  });
}

export function buildEmployeeHoursRows(entries: NormalizedLaborEntry[]): EmployeeHoursRow[] {
  const byEmployee = new Map<string, EmployeeHoursRow>();
  for (const entry of entries) {
    const name = entry.employeeName?.trim() || 'Unknown';
    const row = byEmployee.get(name) ?? {
      employeeName: name,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
    };
    row.regularHours += entry.regularHours ?? 0;
    row.overtimeHours += (entry.overtimeHours ?? 0) + (entry.doubleTimeHours ?? 0);
    row.totalHours += entry.totalHours ?? 0;
    byEmployee.set(name, row);
  }
  return [...byEmployee.values()].sort((a, b) => b.totalHours - a.totalHours);
}

export function buildProjectHoursRows(
  entries: NormalizedLaborEntry[],
  projects: Project[],
  month: string | 'all' = 'all',
): ProjectHoursRow[] {
  const projectByNum = new Map<string, Project>();
  for (const project of projects) {
    const key = normalizeJobNumberKey(project.projectNumber);
    if (key) projectByNum.set(key, project);
  }

  const byProject = new Map<string, ProjectHoursRow & { employees: Set<string> }>();
  for (const entry of entries) {
    if (month !== 'all' && entry.month !== month) continue;
    const numKey = normalizeJobNumberKey(entry.projectNumber ?? entry.jobIdLabel);
    const matched = entry.projectId
      ? projects.find(p => p.id === entry.projectId)
      : (numKey ? projectByNum.get(numKey) : undefined);
    const projectNumber = matched?.projectNumber ?? entry.projectNumber ?? entry.jobIdLabel ?? 'Unknown';
    const key = normalizeJobNumberKey(projectNumber) || projectNumber;
    const row = byProject.get(key) ?? {
      projectNumber,
      projectName: matched?.projectName ?? entry.projectName ?? projectNumber,
      projectId: matched?.id ?? entry.projectId,
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      employeeCount: 0,
      employees: new Set<string>(),
    };
    row.regularHours += entry.regularHours ?? 0;
    row.overtimeHours += (entry.overtimeHours ?? 0) + (entry.doubleTimeHours ?? 0);
    row.totalHours += entry.totalHours ?? 0;
    if (entry.employeeName) row.employees.add(entry.employeeName);
    byProject.set(key, row);
  }

  return [...byProject.values()]
    .map(({ employees, ...row }) => ({ ...row, employeeCount: employees.size }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

export function sumEntryHours(entries: NormalizedLaborEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.totalHours ?? 0), 0);
}
