#!/usr/bin/env node
/**
 * Import QBO Project costs detail Excel into src/app/data/project-costs-seed.json
 *
 * Usage:
 *   node scripts/import-project-costs.mjs [path-to-xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultInput = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  'Downloads',
  'Brighten Builders LLC_Project costs detail (3).xlsx',
);
const inputPath = path.resolve(process.argv[2] ?? defaultInput);
const outPath = path.join(root, 'src/app/data/project-costs-seed.json');

function cellStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function monthFromDate(dateStr) {
  if (!dateStr) return undefined;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function categorize(account) {
  const acct = account.trim().toLowerCase();
  if (acct.includes('wages') || acct.includes('union benefits')) return 'labor';
  if (acct.includes('sub contract')) return 'sub';
  if (acct.includes('supplies') || acct.includes('material')) return 'material';
  if (acct.includes('equipment') || acct.includes('tools')) return 'equipment';
  return 'other';
}

function parseProjectLabel(label) {
  const match = label.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) return { jobNumber: match[1], projectName: match[2].trim() };
  return { jobNumber: label.replace(/\D/g, '') || label, projectName: label };
}

function isProjectHeader(label) {
  return /^\d+\s*-\s*.+/.test(label.trim());
}

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(inputPath, { cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

let periodLabel;
let current = null;
const transactions = [];

for (const row of rows) {
  const firstVal = cellStr(Object.values(row)[0]);
  if (firstVal && !row['__EMPTY'] && !row['__EMPTY_4']) {
    if (firstVal.toLowerCase().includes('project costs detail')) continue;
    if (/^[A-Za-z]+\s+\d/.test(firstVal) && firstVal.includes('202') && !isProjectHeader(firstVal)) {
      periodLabel = firstVal;
      continue;
    }
    if (isProjectHeader(firstVal)) {
      current = { qboLabel: firstVal, ...parseProjectLabel(firstVal) };
      continue;
    }
  }

  const account = cellStr(row['__EMPTY_4']);
  const amount = parseAmount(row['__EMPTY_8']);
  if (!account || !amount || !current) continue;

  const date = parseDate(row['__EMPTY_2']);
  transactions.push({
    jobNumber: current.jobNumber,
    qboLabel: current.qboLabel,
    vendor: cellStr(row['__EMPTY']) || undefined,
    transactionType: cellStr(row['__EMPTY_1']) || undefined,
    date,
    month: monthFromDate(date),
    account,
    amount,
    category: categorize(account),
    memo: cellStr(row['__EMPTY_7']) || undefined,
  });
}

const projectMap = new Map();
for (const txn of transactions) {
  let summary = projectMap.get(txn.jobNumber);
  if (!summary) {
    summary = {
      jobNumber: txn.jobNumber,
      qboLabel: txn.qboLabel,
      projectName: parseProjectLabel(txn.qboLabel).projectName,
      laborCost: 0,
      subCost: 0,
      materialCost: 0,
      equipmentCost: 0,
      otherCost: 0,
      totalCost: 0,
      transactionCount: 0,
    };
    projectMap.set(txn.jobNumber, summary);
  }
  summary.transactionCount++;
  summary.totalCost += txn.amount;
  switch (txn.category) {
    case 'labor': summary.laborCost += txn.amount; break;
    case 'sub': summary.subCost += txn.amount; break;
    case 'material': summary.materialCost += txn.amount; break;
    case 'equipment': summary.equipmentCost += txn.amount; break;
    default: summary.otherCost += txn.amount;
  }
}

const monthlyMap = new Map();
for (const txn of transactions) {
  if (txn.category !== 'labor' || !txn.month) continue;
  const key = `${txn.jobNumber}|${txn.month}`;
  let row = monthlyMap.get(key);
  if (!row) {
    row = {
      jobNumber: txn.jobNumber,
      qboLabel: txn.qboLabel,
      month: txn.month,
      laborCost: 0,
      wageCost: 0,
      fringeCost: 0,
      transactionCount: 0,
    };
    monthlyMap.set(key, row);
  }
  row.transactionCount++;
  row.laborCost += txn.amount;
  if (txn.account.toLowerCase().includes('union')) row.fringeCost += txn.amount;
  else row.wageCost += txn.amount;
}

const projects = [...projectMap.values()].sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber));
const monthlyLabor = [...monthlyMap.values()].sort((a, b) =>
  b.month.localeCompare(a.month) || Number(a.jobNumber) - Number(b.jobNumber),
);

const bundle = {
  meta: {
    company: 'Brighten Builders LLC',
    importedAt: new Date().toISOString(),
    asOfDate: new Date().toISOString().slice(0, 10),
    periodLabel,
    sourceFile: path.basename(inputPath),
    projectCount: projects.length,
    transactionCount: transactions.length,
  },
  projects,
  monthlyLabor,
};

fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`${projects.length} projects, ${transactions.length} transactions, ${monthlyLabor.length} monthly labor rows`);
console.log(`Total cost: $${projects.reduce((s, p) => s + p.totalCost, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
