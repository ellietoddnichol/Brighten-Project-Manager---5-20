import {
  ClassificationRateRecord,
  EmployeeRecord,
  FringeRateRecord,
  LaborTimeEntry,
} from '@app/models/labor.types';
import { LABOR_SHEET } from '@app/config/labor-sheet.config';
import { parseJobLabel } from '@shared/utils/master-sheet-parser';

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
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function headerIndex(header: string[], ...candidates: string[]): number {
  const normalized = header.map(h => h.toLowerCase().replace(/[^a-z0-9#]/g, ''));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9#]/g, '');
    const idx = normalized.findIndex(h => h === key || h.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

function rowVal(row: string[], idx: number): unknown {
  return idx >= 0 ? row[idx] : undefined;
}

export function monthKeyFromDate(dateStr?: string): string {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function isApprovedStatus(status?: string, approvedValues: readonly string[] = ['approved']): boolean {
  const normalized = cellStr(status).toLowerCase();
  return approvedValues.some(v => normalized === v.toLowerCase());
}

export function normalizeEmployeeName(name?: string): string {
  return cellStr(name).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeClassificationToken(value?: string | null): string {
  return cellStr(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Admin / office staff are not in the union — exclude from union rates and fringe. */
export function isNonUnionClassification(classification?: string | null): boolean {
  const normalized = normalizeClassificationToken(classification);
  if (!normalized) return false;
  if (/^admin\b/.test(normalized)) return true;

  const configured = LABOR_SHEET.nonUnionClassifications.map(c => normalizeClassificationToken(c));
  return configured.some(c => normalized === c || normalized.includes(c));
}

export function isNonUnionEmployee(
  employee: Pick<EmployeeRecord, 'defaultClassification' | 'status' | 'fringeEligible' | 'unionArea'> | undefined,
  classification?: string,
): boolean {
  if (employee?.fringeEligible === false) return true;
  if (isNonUnionClassification(classification)) return true;
  if (isNonUnionClassification(employee?.defaultClassification)) return true;

  const status = normalizeClassificationToken(employee?.status);
  if (status === 'admin' || status === 'non union' || status === 'nonunion') return true;

  const area = normalizeClassificationToken(employee?.unionArea);
  if (area === 'non union' || area === 'nonunion' || area === 'admin') return true;

  return false;
}

export function parseTimekeeperRows(
  rows: string[][],
  approvedValues: readonly string[] = ['approved'],
): LaborTimeEntry[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h));
  const lower = header.map(h => h.toLowerCase());

  const idIdx = headerIndex(lower, 'id', 'recordid');
  const emailIdx = headerIndex(lower, 'useremail', 'email');
  const dateIdx = headerIndex(lower, 'date', 'workdate');
  const employeeIdx = headerIndex(lower, 'employeename', 'employee');
  const jobIdx = headerIndex(lower, 'jobid', 'jobid#', 'job');
  const classIdx = headerIndex(lower, 'classification', 'class');
  const regIdx = headerIndex(lower, 'regulartime', 'reghours', 'regularhours', 'regular');
  const otIdx = headerIndex(lower, 'overtime', 'othours', 'overtimehours');
  const dtIdx = headerIndex(lower, 'doubletime', 'dthours', 'doubletimehours');
  const laborCodeIdx = headerIndex(lower, 'laborcode', 'labor');
  const laborCode1Idx = headerIndex(lower, 'laborcode1', 'labor code 1');
  const laborCode2Idx = headerIndex(lower, 'laborcode2', 'labor code 2');
  const laborCode3Idx = headerIndex(lower, 'laborcode3', 'labor code 3');
  const hours1Idx = headerIndex(lower, 'hours1', 'hours 1');
  const hours2Idx = headerIndex(lower, 'hours2', 'hours 2');
  const hours3Idx = headerIndex(lower, 'hours3', 'hours 3');
  const approvalIdx = headerIndex(lower, 'approvalstatus', 'approval');
  const stampIdx = headerIndex(lower, 'timestamp', 'timstamp');

  const out: LaborTimeEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const approvalStatus = cellStr(rowVal(row, approvalIdx));
    if (!isApprovedStatus(approvalStatus, approvedValues)) continue;

    const id = cellStr(rowVal(row, idIdx)) || `row-${i}`;
    const jobIdLabel = cellStr(rowVal(row, jobIdx)) || undefined;
    const regularHours = parseNumber(rowVal(row, regIdx));
    const overtimeHours = parseNumber(rowVal(row, otIdx));
    const doubleTimeHours = parseNumber(rowVal(row, dtIdx));
    if (!regularHours && !overtimeHours && !doubleTimeHours) continue;

    out.push({
      id,
      userEmail: cellStr(rowVal(row, emailIdx)) || undefined,
      workDate: parseSheetDate(rowVal(row, dateIdx)),
      employeeName: cellStr(rowVal(row, employeeIdx)) || undefined,
      jobIdLabel,
      projectNumber: jobIdLabel ? parseJobLabel(jobIdLabel).projectNumber : undefined,
      classification: cellStr(rowVal(row, classIdx)) || undefined,
      regularHours,
      overtimeHours,
      doubleTimeHours,
      laborCode: cellStr(rowVal(row, laborCodeIdx)) || undefined,
      laborCode1: cellStr(rowVal(row, laborCode1Idx)) || undefined,
      laborCode2: cellStr(rowVal(row, laborCode2Idx)) || undefined,
      laborCode3: cellStr(rowVal(row, laborCode3Idx)) || undefined,
      hours1: parseNumber(rowVal(row, hours1Idx)) || undefined,
      hours2: parseNumber(rowVal(row, hours2Idx)) || undefined,
      hours3: parseNumber(rowVal(row, hours3Idx)) || undefined,
      approvalStatus,
      timeStamp: cellStr(rowVal(row, stampIdx)) || undefined,
      sourceRowId: id,
    });
  }
  return out;
}

export function parseEmployeeSummaryRows(rows: string[][]): EmployeeRecord[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h));
  const lower = header.map(h => h.toLowerCase());

  const nameIdx = headerIndex(lower, 'employeename', 'employee', 'name');
  const emailIdx = headerIndex(lower, 'useremail', 'email');
  const statusIdx = headerIndex(lower, 'status');
  const classIdx = headerIndex(lower, 'defaultclassification', 'classification', 'class');
  const areaIdx = headerIndex(lower, 'unionarea', 'area', 'union');
  const baseIdx = headerIndex(lower, 'baserate', 'payrate', 'payperhour', 'wage');
  const fringeIdx = headerIndex(lower, 'fringerate', 'fringe');
  const fringeEligIdx = headerIndex(lower, 'fringeeligible', 'fringe');
  const qboIdx = headerIndex(lower, 'qbomatch', 'qbo');
  const notesIdx = headerIndex(lower, 'notes');
  const effectiveIdx = headerIndex(lower, 'effectivedate', 'effective');

  const out: EmployeeRecord[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const employeeName = cellStr(rowVal(row, nameIdx));
    if (!employeeName) continue;
    const key = normalizeEmployeeName(employeeName);
    if (seen.has(key)) continue;
    seen.add(key);

    const fringeEligibleRaw = cellStr(rowVal(row, fringeEligIdx)).toLowerCase();
    const defaultClassification = cellStr(rowVal(row, classIdx)) || undefined;
    const unionArea = cellStr(rowVal(row, areaIdx)) || undefined;
    const nonUnion = isNonUnionEmployee(
      { defaultClassification, status: cellStr(rowVal(row, statusIdx)) || undefined, unionArea },
      defaultClassification,
    );
    const fringeEligible = fringeEligibleRaw
      ? ['yes', 'y', 'true', '1'].includes(fringeEligibleRaw)
      : nonUnion
        ? false
        : undefined;
    out.push({
      employeeName,
      email: cellStr(rowVal(row, emailIdx)) || undefined,
      status: cellStr(rowVal(row, statusIdx)) || undefined,
      defaultClassification,
      unionArea: nonUnion ? 'Non-Union' : unionArea,
      baseRate: parseNumber(rowVal(row, baseIdx)) || undefined,
      fringeRate: nonUnion ? undefined : (parseNumber(rowVal(row, fringeIdx)) || undefined),
      fringeEligible,
      qboMatch: cellStr(rowVal(row, qboIdx)) || undefined,
      timekeeperMatch: true,
      notes: cellStr(rowVal(row, notesIdx)) || undefined,
      effectiveDate: parseSheetDate(rowVal(row, effectiveIdx)),
      source: 'employee-summary',
    });
  }
  return out;
}

export function parseClassificationRateRows(rows: string[][]): ClassificationRateRecord[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h));
  const lower = header.map(h => h.toLowerCase());

  const areaIdx = headerIndex(lower, 'unionarea', 'area', 'union');
  const classIdx = headerIndex(lower, 'classification', 'class');
  const baseIdx = headerIndex(lower, 'baserate', 'wage', 'payrate');
  const fringeIdx = headerIndex(lower, 'fringerate', 'fringe', 'totalfringe');
  const packageIdx = headerIndex(lower, 'totalpackage', 'package', 'total');
  const hwIdx = headerIndex(lower, 'healthwelfare', 'health');
  const pensionIdx = headerIndex(lower, 'pension');
  const vacationIdx = headerIndex(lower, 'vacation');
  const apprenticeIdx = headerIndex(lower, 'apprenticetraining', 'training');
  const otherFringeIdx = headerIndex(lower, 'otherfringe', 'other');
  const effectiveIdx = headerIndex(lower, 'effectivedate', 'effective');

  const out: ClassificationRateRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const classification = cellStr(rowVal(row, classIdx));
    if (!classification) continue;
    const baseRate = parseNumber(rowVal(row, baseIdx));
    const fringeRate = parseNumber(rowVal(row, fringeIdx));
    const totalPackage = parseNumber(rowVal(row, packageIdx)) || (baseRate + fringeRate);
    if (!baseRate && !totalPackage) continue;

    out.push({
      unionArea: cellStr(rowVal(row, areaIdx)) || 'Commercial Area 1',
      classification,
      baseRate: baseRate || Math.max(0, totalPackage - fringeRate),
      fringeRate,
      totalPackage: totalPackage || baseRate + fringeRate,
      fringeComponents: {
        healthWelfare: parseNumber(rowVal(row, hwIdx)) || undefined,
        pension: parseNumber(rowVal(row, pensionIdx)) || undefined,
        vacation: parseNumber(rowVal(row, vacationIdx)) || undefined,
        apprenticeTraining: parseNumber(rowVal(row, apprenticeIdx)) || undefined,
        otherFringe: parseNumber(rowVal(row, otherFringeIdx)) || undefined,
      },
      effectiveDate: parseSheetDate(rowVal(row, effectiveIdx)),
      source: 'classification-tab',
    });
  }
  return out;
}

export function parseFringeRateRows(rows: string[][]): FringeRateRecord[] {
  if (!rows.length) return [];
  const header = rows[0].map(h => cellStr(h));
  const lower = header.map(h => h.toLowerCase());
  const areaIdx = headerIndex(lower, 'unionarea', 'area');
  const classIdx = headerIndex(lower, 'classification', 'class');
  const fringeIdx = headerIndex(lower, 'fringerate', 'fringe', 'totalfringe');
  const effectiveIdx = headerIndex(lower, 'effectivedate');

  const out: FringeRateRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const classification = cellStr(rowVal(row, classIdx));
    const fringeRate = parseNumber(rowVal(row, fringeIdx));
    if (!classification || !fringeRate) continue;
    out.push({
      unionArea: cellStr(rowVal(row, areaIdx)) || 'Commercial Area 1',
      classification,
      fringeRate,
      effectiveDate: parseSheetDate(rowVal(row, effectiveIdx)),
      source: 'fringe-tab',
    });
  }
  return out;
}

export function classificationRatesFromSeed(
  seed: { classificationRates: ClassificationRateRecord[] },
): ClassificationRateRecord[] {
  return seed.classificationRates.map(r => ({ ...r }));
}
