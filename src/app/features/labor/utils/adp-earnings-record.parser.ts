import { parseCsv } from '@shared/utils/csv-parse';
import { deriveWorkWeekFromPayDate, formatCprIsoDate, parseCprLocalDate } from '@features/labor/utils/certified-payroll-week';
import { normalizePersonName } from '@features/labor/utils/cpr-form.util';

export interface ParsedAdpEmployeeRow {
  rawName: string;
  normName: string;
  ssnLast4?: string;
  department?: string;
  regularRate?: number;
  overtimeRate?: number;
  regularHours?: number;
  overtimeHours?: number;
  grossPay: number;
  socialSecurity: number;
  medicare: number;
  federalIncomeTax: number;
  stateTaxKs: number;
  stateTaxMo: number;
  unionDues: number;
  vacationDeduction: number;
  netPay: number;
}

export interface ParsedAdpEarningsRecord {
  fileName: string;
  payDate: string;
  weekEnding: string;
  weekStart: string;
  employees: ParsedAdpEmployeeRow[];
  tableRowCount: number;
}

function cleanHeader(h: unknown): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeaders(row: string[]): string[] {
  return row.map(cleanHeader);
}

function findHeader(headers: string[], aliases: string[]): number {
  const cleanAliases = aliases.map(cleanHeader);
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (const alias of cleanAliases) {
      if (h === alias || h.includes(alias) || alias.includes(h)) return i;
    }
  }
  return -1;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value || 0;
  if (value == null) return 0;
  const match = String(value).replace(/[$,]/g, '').trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function ssnLast4(value: unknown): string {
  const match = String(value ?? '').match(/(\d{4})\s*$/);
  return match ? match[1] : '';
}

function parseFlexibleDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdy) {
    let year = Number(mdy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const month = String(mdy[1]).padStart(2, '0');
    const day = String(mdy[2]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const parsed = parseCprLocalDate(raw);
  if (!Number.isNaN(parsed.getTime())) return formatCprIsoDate(parsed);
  return null;
}

function extractPayDateFromPreamble(lines: string[]): string | null {
  for (let i = 0; i < Math.min(lines.length, 150); i++) {
    const line = String(lines[i] ?? '').trim();
    const patterns = [
      /Check Dates From:\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
      /Pay Date:\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
      /Check Date:\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    ];
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return parseFlexibleDate(match[1]);
    }
  }
  return null;
}

function extractPayDateFromTable(rows: string[][]): string | null {
  if (!rows.length) return null;
  const headers = normalizeHeaders(rows[0]);
  const idx = findHeader(headers, ['check date', 'checkdate', 'pay date', 'paydate', 'payment date']);
  if (idx < 0) return null;
  for (let r = 1; r < rows.length; r++) {
    const date = parseFlexibleDate(rows[r][idx]);
    if (date) return date;
  }
  return null;
}

function headerRowScore(rowText: string): number {
  const clean = rowText.toLowerCase();
  return ['employee name', 'gross earning', 'check date'].filter(k => clean.includes(k)).length;
}

function locateHeaderRow(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 500); i++) {
    const clean = String(lines[i] ?? '');
    const hits = headerRowScore(clean);
    if ((clean.includes(',') || clean.includes('\t')) && hits >= 2) return i;
  }
  return -1;
}

function locateHeaderRowInMatrix(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    if (headerRowScore(rows[i].join(' ')) >= 2) return i;
  }
  return -1;
}

function matrixRowsToStrings(rows: unknown[][]): string[][] {
  return rows.map(row => row.map(cell => String(cell ?? '').trim()));
}

function filterTableRows(rows: string[][]): string[][] {
  return rows.filter(row => {
    const first = String(row[0] ?? '').trim().toLowerCase();
    if (!first) return false;
    if (first.includes('employee totals') || first.includes('report totals')) return false;
    return row.some(cell => String(cell ?? '').trim() !== '');
  });
}

interface AdpEarningGroup {
  earning: number;
  rate: number;
  hours: number;
}

function getAdpEarningGroups(headers: string[]): AdpEarningGroup[] {
  const groups: AdpEarningGroup[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].match(/^earning\s*\d*$/) || headers[i].startsWith('earning')) {
      let rate = -1;
      let hours = -1;
      for (let j = i + 1; j < Math.min(headers.length, i + 5); j++) {
        if (headers[j] === 'rate' && rate < 0) rate = j;
        if (headers[j] === 'hours' && hours < 0) hours = j;
      }
      groups.push({ earning: i, rate, hours });
    }
  }
  return groups;
}

function emptyAdpRecord(rawName: string): ParsedAdpEmployeeRow {
  return {
    rawName,
    normName: normalizePersonName(rawName),
    grossPay: 0,
    socialSecurity: 0,
    medicare: 0,
    federalIncomeTax: 0,
    stateTaxKs: 0,
    stateTaxMo: 0,
    unionDues: 0,
    vacationDeduction: 0,
    netPay: 0,
  };
}

export function aggregateAdpEmployees(tableRows: string[][]): ParsedAdpEmployeeRow[] {
  if (tableRows.length < 2) return [];

  const headers = normalizeHeaders(tableRows[0]);
  const idx = {
    name: findHeader(headers, ['employee name', 'employeename', 'name']),
    ssn: findHeader(headers, ['ssn']),
    dept: findHeader(headers, ['department']),
    grossEarn: findHeader(headers, ['gross earning', 'gross pay', 'total gross', 'earnings']),
    fedFit: findHeader(headers, ['fed fit', 'federal income tax', 'fit']),
    fedSS: findHeader(headers, ['fed socsec', 'fica social security', 'social security', 'fica ss']),
    fedMed: findHeader(headers, ['fed medcare', 'medicare', 'fica medicare', 'fica med']),
    ksSit: findHeader(headers, ['ks sit', 'kansas state tax', 'kansas sit']),
    moSit: findHeader(headers, ['mo sit', 'missouri state tax', 'missouri sit']),
    unionDues: findHeader(headers, ['union dues', 'union deduction']),
    vacation: findHeader(headers, ['vacation']),
    netPay: findHeader(headers, ['net pay', 'take home', 'net check']),
  };

  for (const key of ['name', 'grossEarn', 'fedSS', 'fedMed', 'netPay'] as const) {
    if (idx[key] < 0) throw new Error(`ADP EarningsRecord missing required column: ${key}`);
  }

  const earningGroups = getAdpEarningGroups(headers);
  const acc = new Map<string, ParsedAdpEmployeeRow>();

  for (const row of tableRows.slice(1)) {
    const rawName = String(row[idx.name] ?? '').trim();
    if (!rawName) continue;

    const norm = normalizePersonName(rawName);
    const cur = acc.get(norm) ?? emptyAdpRecord(rawName);

    cur.ssnLast4 = idx.ssn >= 0 ? (ssnLast4(row[idx.ssn]) || cur.ssnLast4) : cur.ssnLast4;
    cur.department = idx.dept >= 0 ? String(row[idx.dept] ?? '').trim() || cur.department : cur.department;
    cur.grossPay += toNumber(row[idx.grossEarn]);
    cur.federalIncomeTax += idx.fedFit >= 0 ? toNumber(row[idx.fedFit]) : 0;
    cur.socialSecurity += idx.fedSS >= 0 ? toNumber(row[idx.fedSS]) : 0;
    cur.medicare += idx.fedMed >= 0 ? toNumber(row[idx.fedMed]) : 0;
    cur.stateTaxKs += idx.ksSit >= 0 ? toNumber(row[idx.ksSit]) : 0;
    cur.stateTaxMo += idx.moSit >= 0 ? toNumber(row[idx.moSit]) : 0;
    cur.unionDues += idx.unionDues >= 0 ? toNumber(row[idx.unionDues]) : 0;
    cur.vacationDeduction += idx.vacation >= 0 ? toNumber(row[idx.vacation]) : 0;
    cur.netPay += idx.netPay >= 0 ? toNumber(row[idx.netPay]) : 0;

    for (const group of earningGroups) {
      const label = String(row[group.earning] ?? '').toLowerCase();
      const rate = group.rate >= 0 ? toNumber(row[group.rate]) : 0;
      const hours = group.hours >= 0 ? toNumber(row[group.hours]) : 0;
      if (!label || !rate || !hours) continue;
      if (label.includes('overtime') || label === 'ot') {
        if (!cur.overtimeRate) cur.overtimeRate = rate;
        cur.overtimeHours = (cur.overtimeHours ?? 0) + hours;
      } else if (label.includes('regular')) {
        if (!cur.regularRate) cur.regularRate = rate;
        cur.regularHours = (cur.regularHours ?? 0) + hours;
      }
    }

    acc.set(norm, cur);
  }

  return [...acc.values()];
}

function parseAdpEarningsRecordTable(tableRows: string[][], fileName: string, preambleLines: string[] = []): ParsedAdpEarningsRecord {
  const filtered = filterTableRows(tableRows);
  if (filtered.length < 2) {
    throw new Error(`ADP EarningsRecord had a header but no employee rows in: ${fileName}`);
  }

  const payDate = extractPayDateFromTable(filtered) || extractPayDateFromPreamble(preambleLines);
  if (!payDate) {
    throw new Error('Could not determine ADP pay/check date from the EarningsRecord.');
  }

  const workWeek = deriveWorkWeekFromPayDate(payDate);
  const employees = aggregateAdpEmployees(filtered);

  return {
    fileName,
    payDate,
    weekEnding: workWeek.weekEnding,
    weekStart: workWeek.weekStart,
    employees,
    tableRowCount: filtered.length - 1,
  };
}

/** Parse ADP EarningsRecord rows from Excel/CSV matrix export. */
export function parseAdpEarningsRecordMatrix(rows: unknown[][], fileName: string): ParsedAdpEarningsRecord {
  const matrix = matrixRowsToStrings(rows);
  const headerIdx = locateHeaderRowInMatrix(matrix);
  if (headerIdx < 0) {
    throw new Error(`Could not locate the ADP table header row in: ${fileName}`);
  }

  const preambleLines = matrix.slice(0, headerIdx).map(row => row.join(' '));
  return parseAdpEarningsRecordTable(matrix.slice(headerIdx), fileName, preambleLines);
}

/** Parse an ADP EarningsRecord CSV export (matches Apps Script parseAdpCsvIntoDetail_). */
export function parseAdpEarningsRecordCsv(text: string, fileName: string): ParsedAdpEarningsRecord {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);
  const preambleDate = extractPayDateFromPreamble(lines);

  const headerIdx = locateHeaderRow(lines);
  if (headerIdx < 0) {
    throw new Error(`Could not locate the ADP table header row in: ${fileName}`);
  }

  const tableRows = filterTableRows(parseCsv(lines.slice(headerIdx).join('\n')));
  return parseAdpEarningsRecordTable(tableRows, fileName, lines.slice(0, headerIdx));
}
