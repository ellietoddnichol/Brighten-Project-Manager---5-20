import { cellStr, normalizeHeader, parseMoney } from '@shared/utils/sheet-normalizers';
import { formatEmployeeDisplayName, employeeNameMatchKey } from '@shared/utils/employee-name-match';

export interface ParsedEmployeeInfoReportRow {
  reportName: string;
  displayName: string;
  matchKey: string;
  status: string;
  payType: string;
  payPerHour: number;
  department?: string;
  hireDate?: string;
  sourceRow: number;
}

function findEmployeeInfoHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] ?? []).map(c => normalizeHeader(c));
    const hasName = headers.some(h => h.includes('employee name'));
    const hasRate = headers.some(h => h.includes('pay rate'));
    if (hasName && hasRate) return i;
  }
  return -1;
}

function headerIndex(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const key = normalizeHeader(candidate);
    const idx = headers.findIndex(h => h === key || h.includes(key) || key.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseHireDate(value: unknown): string | undefined {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return epoch.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}

/**
 * Parse ADP / payroll "Employee Info Report" export.
 * When multiple hourly rows exist per person, keeps the highest Active hourly rate,
 * otherwise the highest hourly rate overall.
 */
export function parseEmployeeInfoReportRows(rows: string[][]): ParsedEmployeeInfoReportRow[] {
  const headerRowIdx = findEmployeeInfoHeaderRow(rows);
  if (headerRowIdx < 0) return [];

  const headers = (rows[headerRowIdx] ?? []).map(h => normalizeHeader(h));
  const nameIdx = headerIndex(headers, 'Employee Name');
  const statusIdx = headerIndex(headers, 'Employee Status');
  const payTypeIdx = headerIndex(headers, 'Pay Type');
  const rateIdx = headerIndex(headers, 'Pay Rate Amount');
  const deptIdx = headerIndex(headers, 'Department Number');
  const hireIdx = headerIndex(headers, 'Hire Date');

  const byKey = new Map<string, ParsedEmployeeInfoReportRow & { hasActive: boolean }>();

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const reportName = cellStr(row[nameIdx]);
    if (!reportName) continue;

    const payType = cellStr(row[payTypeIdx]);
    const payPerHour = parseMoney(row[rateIdx]);
    if (payType.toLowerCase() !== 'hourly' || payPerHour <= 0) continue;

    const status = cellStr(row[statusIdx]) || 'Unknown';
    const isActive = status.toLowerCase() === 'active';
    const matchKey = employeeNameMatchKey(reportName);
    const existing = byKey.get(matchKey);

    const candidate: ParsedEmployeeInfoReportRow & { hasActive: boolean } = {
      reportName,
      displayName: formatEmployeeDisplayName(reportName),
      matchKey,
      status,
      payType,
      payPerHour,
      department: cellStr(row[deptIdx]) || undefined,
      hireDate: parseHireDate(row[hireIdx]),
      sourceRow: i + 1,
      hasActive: isActive,
    };

    if (!existing) {
      byKey.set(matchKey, candidate);
      continue;
    }

    const existingActive = existing.hasActive;
    if (isActive && !existingActive) {
      byKey.set(matchKey, candidate);
      continue;
    }
    if (isActive === existingActive && payPerHour > existing.payPerHour) {
      byKey.set(matchKey, candidate);
    }
  }

  return [...byKey.values()].map(({ hasActive: _hasActive, ...row }) => row);
}
