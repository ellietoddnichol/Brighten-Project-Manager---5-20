import { Employee, Project, TimeEntry } from '@app/models/types';
import { normalizeJobKey, parseJobLabel } from '@shared/utils/master-sheet-parser';

export interface ParsedJobHoursRow {
  jobIdLabel: string;
  projectNumber: string;
  jobName: string;
  county?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  lineCount: number;
}

export interface ParsedTimeEntryRow {
  recordId: string;
  workDate?: string;
  employeeName?: string;
  jobIdLabel?: string;
  projectNumber?: string;
  jobName?: string;
  county?: string;
  classification?: string;
  laborCode?: string;
  laborCode1?: string;
  laborCode2?: string;
  laborCode3?: string;
  hours1?: number;
  hours2?: number;
  hours3?: number;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  notes?: string;
  sourceSystem?: string;
  sourceRowId?: string;
  approvalStatus?: string;
}

export interface ParsedEmployeeRow {
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  department?: string;
  hoursType?: string;
  payPerHour?: number;
}

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseSheetDate(value: unknown): string | undefined {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return raw;
}

function headerIndex(header: string[], ...candidates: string[]): number {
  const normalized = header.map(h => h.toLowerCase());
  for (const candidate of candidates) {
    const idx = normalized.findIndex(h => h === candidate.toLowerCase() || h.includes(candidate.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function employeeDocId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'unknown';
}

export function parseJobHoursRows(rows: string[][]): ParsedJobHoursRow[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h).toLowerCase());
  const jobIdx = header.findIndex(h => h.includes('jobid'));
  const nameIdx = header.findIndex(h => h === 'jobname');
  const countyIdx = header.findIndex(h => h === 'county');
  const regIdx = header.findIndex(h => h.includes('reghours'));
  const otIdx = header.findIndex(h => h.includes('othours'));
  const dtIdx = header.findIndex(h => h.includes('dthours'));
  const totalIdx = header.findIndex(h => h.includes('totalhours'));
  const lineIdx = header.findIndex(h => h.includes('linecount'));

  const out: ParsedJobHoursRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const jobIdLabel = cellStr(jobIdx >= 0 ? row[jobIdx] : row[0]);
    if (!jobIdLabel) continue;
    const { projectNumber } = parseJobLabel(jobIdLabel);
    out.push({
      jobIdLabel,
      projectNumber,
      jobName: cellStr(nameIdx >= 0 ? row[nameIdx] : row[1]) || parseJobLabel(jobIdLabel).projectName,
      county: cellStr(countyIdx >= 0 ? row[countyIdx] : row[2]) || undefined,
      regularHours: parseNumber(regIdx >= 0 ? row[regIdx] : row[3]),
      overtimeHours: parseNumber(otIdx >= 0 ? row[otIdx] : row[4]),
      doubleTimeHours: parseNumber(dtIdx >= 0 ? row[dtIdx] : row[5]),
      totalHours: parseNumber(totalIdx >= 0 ? row[totalIdx] : row[6]),
      lineCount: parseNumber(lineIdx >= 0 ? row[lineIdx] : row[7]),
    });
  }
  return out;
}

export function parseAllTimeRows(rows: string[][]): ParsedTimeEntryRow[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h).toLowerCase());
  const recordIdx = headerIndex(header, 'recordid');
  const dateIdx = headerIndex(header, 'workdate');
  const employeeIdx = headerIndex(header, 'employeename');
  const jobIdx = headerIndex(header, 'jobid');
  const jobNameIdx = headerIndex(header, 'jobname');
  const countyIdx = headerIndex(header, 'county');
  const classIdx = headerIndex(header, 'classification');
  const laborCodeIdx = headerIndex(header, 'laborcode', 'labor code');
  const laborCode1Idx = headerIndex(header, 'laborcode1', 'labor code 1');
  const laborCode2Idx = headerIndex(header, 'laborcode2', 'labor code 2');
  const laborCode3Idx = headerIndex(header, 'laborcode3', 'labor code 3');
  const hours1Idx = headerIndex(header, 'hours1', 'hours 1');
  const hours2Idx = headerIndex(header, 'hours2', 'hours 2');
  const hours3Idx = headerIndex(header, 'hours3', 'hours 3');
  const regIdx = headerIndex(header, 'reghours');
  const otIdx = headerIndex(header, 'othours');
  const dtIdx = headerIndex(header, 'dthours');
  const totalIdx = headerIndex(header, 'totalhours');
  const notesIdx = headerIndex(header, 'notes');
  const sourceIdx = headerIndex(header, 'sourcesystem');
  const sourceRowIdx = headerIndex(header, 'sourcerowid');
  const approvalIdx = headerIndex(header, 'approvalstatus');

  const out: ParsedTimeEntryRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const recordId = cellStr(recordIdx >= 0 ? row[recordIdx] : row[0]);
    if (!recordId) continue;

    const jobIdLabel = cellStr(jobIdx >= 0 ? row[jobIdx] : row[3]) || undefined;
    const projectNumber = jobIdLabel ? parseJobLabel(jobIdLabel).projectNumber : undefined;

    out.push({
      recordId,
      workDate: parseSheetDate(dateIdx >= 0 ? row[dateIdx] : row[1]),
      employeeName: cellStr(employeeIdx >= 0 ? row[employeeIdx] : row[2]) || undefined,
      jobIdLabel,
      projectNumber,
      jobName: cellStr(jobNameIdx >= 0 ? row[jobNameIdx] : row[4]) || undefined,
      county: cellStr(countyIdx >= 0 ? row[countyIdx] : row[5]) || undefined,
      classification: cellStr(classIdx >= 0 ? row[classIdx] : row[6]) || undefined,
      laborCode: cellStr(laborCodeIdx >= 0 ? row[laborCodeIdx] : '') || undefined,
      laborCode1: cellStr(laborCode1Idx >= 0 ? row[laborCode1Idx] : '') || undefined,
      laborCode2: cellStr(laborCode2Idx >= 0 ? row[laborCode2Idx] : '') || undefined,
      laborCode3: cellStr(laborCode3Idx >= 0 ? row[laborCode3Idx] : '') || undefined,
      hours1: parseNumber(hours1Idx >= 0 ? row[hours1Idx] : 0) || undefined,
      hours2: parseNumber(hours2Idx >= 0 ? row[hours2Idx] : 0) || undefined,
      hours3: parseNumber(hours3Idx >= 0 ? row[hours3Idx] : 0) || undefined,
      regularHours: parseNumber(regIdx >= 0 ? row[regIdx] : row[7]),
      overtimeHours: parseNumber(otIdx >= 0 ? row[otIdx] : row[8]),
      doubleTimeHours: parseNumber(dtIdx >= 0 ? row[dtIdx] : row[9]),
      totalHours: parseNumber(totalIdx >= 0 ? row[totalIdx] : row[10]),
      notes: cellStr(notesIdx >= 0 ? row[notesIdx] : row[11]) || undefined,
      sourceSystem: cellStr(sourceIdx >= 0 ? row[sourceIdx] : row[12]) || undefined,
      sourceRowId: cellStr(sourceRowIdx >= 0 ? row[sourceRowIdx] : row[13]) || undefined,
      approvalStatus: cellStr(approvalIdx >= 0 ? row[approvalIdx] : row[15]) || undefined,
    });
  }
  return out;
}

export function parseEmployeeRows(rows: string[][]): ParsedEmployeeRow[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h).toLowerCase());
  const nameIdx = headerIndex(header, 'employeename');
  const statusIdx = headerIndex(header, 'status');
  const startIdx = headerIndex(header, 'startdate');
  const endIdx = headerIndex(header, 'enddate');
  const deptIdx = headerIndex(header, 'department');
  const hoursTypeIdx = headerIndex(header, 'hourstype');
  const payIdx = headerIndex(header, 'payperhour');

  const out: ParsedEmployeeRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const name = cellStr(nameIdx >= 0 ? row[nameIdx] : row[0]);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({
      name,
      status: cellStr(statusIdx >= 0 ? row[statusIdx] : row[1]) || undefined,
      startDate: parseSheetDate(startIdx >= 0 ? row[startIdx] : row[2]),
      endDate: parseSheetDate(endIdx >= 0 ? row[endIdx] : row[3]),
      department: cellStr(deptIdx >= 0 ? row[deptIdx] : row[4]) || undefined,
      hoursType: cellStr(hoursTypeIdx >= 0 ? row[hoursTypeIdx] : row[5]) || undefined,
      payPerHour: parseNumber(payIdx >= 0 ? row[payIdx] : row[6]) || undefined,
    });
  }
  return out;
}

export function jobHoursToProjectUpdate(
  row: ParsedJobHoursRow,
  syncedAt: string,
  sheetUrl: string,
  lastTimelogDate?: string,
): Partial<Project> {
  const update: Partial<Project> = {
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    doubleTimeHours: row.doubleTimeHours,
    totalLaborHours: row.totalHours,
    timelogEntryCount: row.lineCount,
    timeDataSheetSyncedAt: syncedAt,
    timeDataSheetUrl: sheetUrl,
  };
  if (row.county) update.county = row.county;
  if (lastTimelogDate) update.lastTimelogDate = lastTimelogDate;
  return update;
}

export function parsedTimeEntryToFirestore(
  row: ParsedTimeEntryRow,
  projectId: string | undefined,
  syncedAt: string,
  sheetUrl: string,
): Partial<TimeEntry> {
  return {
    id: row.recordId,
    recordId: row.recordId,
    projectId,
    workDate: row.workDate,
    employeeName: row.employeeName,
    jobIdLabel: row.jobIdLabel,
    jobName: row.jobName,
    county: row.county,
    classification: row.classification,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    doubleTimeHours: row.doubleTimeHours,
    totalHours: row.totalHours,
    notes: row.notes,
    sourceSystem: row.sourceSystem,
    sourceRowId: row.sourceRowId,
    approvalStatus: row.approvalStatus,
    timeDataSheetSyncedAt: syncedAt,
    timeDataSheetUrl: sheetUrl,
    source: 'sheet',
  };
}

export function parsedEmployeeToFirestore(
  row: ParsedEmployeeRow,
  syncedAt: string,
  sheetUrl: string,
): Partial<Employee> {
  const id = employeeDocId(row.name);
  return {
    id,
    name: row.name,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    department: row.department,
    hoursType: row.hoursType,
    payPerHour: row.payPerHour,
    timeDataSheetSyncedAt: syncedAt,
    timeDataSheetUrl: sheetUrl,
    source: 'sheet',
  };
}

export function filterTimeEntriesFromDate(
  rows: ParsedTimeEntryRow[],
  fromDate: string,
): ParsedTimeEntryRow[] {
  return rows.filter(row => row.workDate && row.workDate >= fromDate);
}

export function lastWorkDateByJob(rows: ParsedTimeEntryRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.jobIdLabel || !row.workDate) continue;
    const key = normalizeJobKey(row.jobIdLabel);
    const current = map.get(key);
    if (!current || row.workDate > current) {
      map.set(key, row.workDate);
    }
  }
  return map;
}
