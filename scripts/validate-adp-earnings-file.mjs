#!/usr/bin/env node
/**
 * Validate ADP EarningsRecord file parsing locally (no Firestore write).
 *
 * Usage:
 *   node scripts/validate-adp-earnings-file.mjs "C:/path/to/EarningsRecord.xlsx"
 */
import XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Minimal inline port for CLI validation (mirrors app parser)
function normalizePersonName(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    return `${rest.join(' ').trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
  }
  return raw.replace(/\s+/g, ' ');
}

function cleanHeader(h) {
  return String(h ?? '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findHeader(headers, aliases) {
  const cleanAliases = aliases.map(cleanHeader);
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (const alias of cleanAliases) {
      if (h === alias || h.includes(alias) || alias.includes(h)) return i;
    }
  }
  return -1;
}

function toNumber(value) {
  if (typeof value === 'number') return value || 0;
  const match = String(value ?? '').replace(/[$,]/g, '').trim().match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseFlexibleDate(value) {
  const raw = String(value ?? '').trim();
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!mdy) return null;
  let year = Number(mdy[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  return `${year}-${String(mdy[1]).padStart(2, '0')}-${String(mdy[2]).padStart(2, '0')}`;
}

function deriveWorkWeekFromPayDate(payDateInput) {
  const [y, m, d] = payDateInput.split('-').map(Number);
  const payDate = new Date(y, m - 1, d, 12, 0, 0);
  let daysBackToSaturday = (payDate.getDay() + 1) % 7;
  if (daysBackToSaturday === 0) daysBackToSaturday = 7;
  const weekEndingDate = new Date(payDate);
  weekEndingDate.setDate(payDate.getDate() - daysBackToSaturday);
  const weekEnding = weekEndingDate.toISOString().slice(0, 10);
  const end = new Date(`${weekEnding}T12:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { weekEnding, weekStart: start.toISOString().slice(0, 10) };
}

function locateHeaderRowInMatrix(rows) {
  for (let i = 0; i < Math.min(rows.length, 500); i++) {
    const clean = rows[i].join(' ').toLowerCase();
    const hits = ['employee name', 'gross earning', 'check date'].filter(k => clean.includes(k)).length;
    if (hits >= 2) return i;
  }
  return -1;
}

function aggregate(tableRows) {
  const headers = tableRows[0].map(cleanHeader);
  const idx = {
    name: findHeader(headers, ['employee name']),
    grossEarn: findHeader(headers, ['gross earning', 'gross pay', 'total gross']),
    netPay: findHeader(headers, ['net pay']),
  };
  const employees = [];
  for (const row of tableRows.slice(1)) {
    const rawName = String(row[idx.name] ?? '').trim();
    if (!rawName) continue;
    employees.push({
      rawName,
      grossPay: toNumber(row[idx.grossEarn]),
      netPay: toNumber(row[idx.netPay]),
    });
  }
  return employees;
}

const filePath = process.argv[2];
if (!filePath || !existsSync(filePath)) {
  console.error('Usage: node scripts/validate-adp-earnings-file.mjs <path-to-xlsx-or-csv>');
  process.exit(1);
}

const ext = path.extname(filePath).toLowerCase();
let matrix;
if (ext === '.csv') {
  const text = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  matrix = text.split(/\r?\n/).map(line => line.split(','));
} else {
  const wb = XLSX.read(readFileSync(filePath));
  matrix = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
}

const headerIdx = locateHeaderRowInMatrix(matrix.map(r => r.map(c => String(c ?? '').trim())));
if (headerIdx < 0) throw new Error('Header row not found');
const table = matrix.slice(headerIdx).map(r => r.map(c => String(c ?? '').trim()));
const payDate = parseFlexibleDate(table[1]?.[3] ?? table[1]?.find(v => /\d\//.test(v)));
const preambleLine = matrix.slice(0, headerIdx).map(r => r.join(' ')).join('\n');
const preambleMatch = preambleLine.match(/Check Dates From:\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i);
const resolvedPayDate = payDate || (preambleMatch ? parseFlexibleDate(preambleMatch[1]) : null);
if (!resolvedPayDate) throw new Error('Pay date not found');
const week = deriveWorkWeekFromPayDate(resolvedPayDate);
const employees = aggregate(table);

console.log(JSON.stringify({
  fileName: path.basename(filePath),
  payDate: resolvedPayDate,
  weekEnding: week.weekEnding,
  weekStart: week.weekStart,
  employeeCount: employees.length,
  sample: employees.slice(0, 5),
}, null, 2));
