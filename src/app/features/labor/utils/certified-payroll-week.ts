import { AdpPayrollDetail } from '@app/models/certified-payroll.types';
import { Project } from '@app/models/types';

export function isCertifiedPayrollProject(project: Pick<Project, 'prevailingWage' | 'certifiedPayrollRequired'>): boolean {
  return !!(project.prevailingWage || project.certifiedPayrollRequired);
}

export function shouldShowCertifiedPayroll(input: {
  showAllTools?: boolean;
  certifiedPayrollRequired?: boolean;
  prevailingWage?: boolean;
  hasCPRRecords?: boolean;
}): boolean {
  return !!(input.showAllTools || input.certifiedPayrollRequired || input.prevailingWage || input.hasCPRRecords);
}

export function parseCprLocalDate(dateInput: string | Date): Date {
  if (typeof dateInput === 'string') {
    return new Date(`${dateInput.slice(0, 10)}T12:00:00`);
  }
  const d = new Date(dateInput);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function formatCprIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Sunday on or before the given date (CPR work week start). */
export function startOfWeekSunday(dateInput: string | Date): Date {
  const date = parseCprLocalDate(dateInput);
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(12, 0, 0, 0);
  return sunday;
}

/**
 * CPR work weeks run Sunday through Saturday (Apps Script / government WH-347 form).
 * The canonical week key is the Saturday ending date (YYYY-MM-DD).
 */
export function weekEndingSaturday(dateInput: string | Date): string {
  const sunday = startOfWeekSunday(dateInput);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return formatCprIsoDate(saturday);
}

/** @deprecated Use weekEndingSaturday. Alias kept so older imports keep working. */
export function weekEndingSunday(dateInput: string | Date): string {
  return weekEndingSaturday(dateInput);
}

/**
 * Older drafts keyed weeks to the following Sunday (Mon–Sun buckets).
 * Map that legacy value to the Saturday-ending Sun–Sat week used by Apps Script.
 */
export function normalizeWeekEndingToSaturday(weekEnding: string): string {
  const d = parseCprLocalDate(weekEnding);
  if (d.getDay() === 6) return weekEnding.slice(0, 10);
  if (d.getDay() === 0) {
    const saturday = new Date(d);
    saturday.setDate(d.getDate() - 1);
    return formatCprIsoDate(saturday);
  }
  return weekEndingSaturday(weekEnding);
}

export function weekStartSundayFromEnding(weekEnding: string): string {
  const ending = normalizeWeekEndingToSaturday(weekEnding);
  const end = parseCprLocalDate(ending);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return formatCprIsoDate(start);
}

/** Seven ISO dates: Sunday through Saturday for the week ending on Saturday. */
export function workWeekDatesSunThroughSat(weekEnding: string): string[] {
  const ending = normalizeWeekEndingToSaturday(weekEnding);
  const end = parseCprLocalDate(ending);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(formatCprIsoDate(d));
  }
  return dates;
}

export interface CprWorkWeek {
  payDate: string;
  weekEnding: string;
  weekStart: string;
  weekDates: string[];
}

/** Derive Sun–Sat work week from ADP check/pay date (matches Apps Script deriveWorkWeekFromPayDate_). */
export function deriveWorkWeekFromPayDate(payDateInput: string | Date): CprWorkWeek {
  const payDate = parseCprLocalDate(payDateInput);
  let daysBackToSaturday = (payDate.getDay() + 1) % 7;
  if (daysBackToSaturday === 0) daysBackToSaturday = 7;

  const weekEndingDate = new Date(payDate);
  weekEndingDate.setDate(payDate.getDate() - daysBackToSaturday);
  const weekEnding = formatCprIsoDate(weekEndingDate);
  const weekDates = workWeekDatesSunThroughSat(weekEnding);

  return {
    payDate: formatCprIsoDate(payDate),
    weekEnding,
    weekStart: weekDates[0],
    weekDates,
  };
}

export function adpPayPeriodMatchesWeek(adpPayPeriodEnding: string | undefined, weekEnding: string): boolean {
  if (!adpPayPeriodEnding) return false;
  return normalizeWeekEndingToSaturday(adpPayPeriodEnding) === normalizeWeekEndingToSaturday(weekEnding);
}

export function findAdpPayrollDetail(
  details: AdpPayrollDetail[],
  employeeKey: string,
  weekEnding: string,
): AdpPayrollDetail | undefined {
  return details.find(d =>
    d.employeeKey === employeeKey && adpPayPeriodMatchesWeek(d.payPeriodEnding, weekEnding),
  );
}

export function normalizeEmployeeKey(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function safeFirestoreId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function weekId(projectId: string, weekEnding: string): string {
  return safeFirestoreId(`${projectId}_${normalizeWeekEndingToSaturday(weekEnding)}`);
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
    normalizeWeekEndingToSaturday(weekEnding),
    normalizeEmployeeKey(employeeName),
    classification.trim().toLowerCase(),
    (laborCode ?? '').trim().toLowerCase(),
  ].join('_'));
}
