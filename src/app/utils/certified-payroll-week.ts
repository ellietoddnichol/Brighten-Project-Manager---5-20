import { Project } from '../models/types';

export function isCertifiedPayrollProject(project: Pick<Project, 'prevailingWage' | 'certifiedPayrollRequired'>): boolean {
  return !!(project.prevailingWage || project.certifiedPayrollRequired);
}

/** CPR tools hidden for now — re-enable when certified payroll returns. */
export function shouldShowCertifiedPayroll(_input: {
  showAllTools?: boolean;
  certifiedPayrollRequired?: boolean;
  prevailingWage?: boolean;
  hasCPRRecords?: boolean;
}): boolean {
  return false;
}

/** Payroll week ending Sunday (YYYY-MM-DD). */
export function weekEndingSunday(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(`${dateInput.slice(0, 10)}T12:00:00`) : new Date(dateInput);
  const day = date.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + diff);
  return sunday.toISOString().slice(0, 10);
}

export function normalizeEmployeeKey(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function safeFirestoreId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function weekId(projectId: string, weekEnding: string): string {
  return safeFirestoreId(`${projectId}_${weekEnding}`);
}

export function entryId(
  projectId: string,
  weekEnding: string,
  employeeName: string,
  classification: string,
  laborCode?: string,
): string {
  return safeFirestoreId([
    projectId,
    weekEnding,
    normalizeEmployeeKey(employeeName),
    classification.trim().toLowerCase(),
    (laborCode ?? '').trim().toLowerCase(),
  ].join('_'));
}
