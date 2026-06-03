#!/usr/bin/env node
/**
 * Build WIP forecast seed JSON from the May 2026 workbook.
 *
 * Usage:
 *   node scripts/build-wip-forecast-seed.mjs [path-to-xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultInput = path.join(
  root,
  'mock-data/imports/wip-forecast/Brighten_2026_WIP_Forecast_Updated_With_AR_Status_May_29_2026.xlsx',
);
const fallbackInput =
  'c:/Users/ellie/Downloads/Brighten_2026_WIP_Forecast_Updated_With_AR_Status_May_29_2026 (1).xlsx';
const outputPath = path.join(root, 'mock-data/seeds/wip-forecast-may-2026-seed.json');

const inputPath = process.argv[2] ?? (fs.existsSync(defaultInput) ? defaultInput : fallbackInput);

function num(v) {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function str(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function pctToDisplay(v) {
  const n = num(v);
  if (n == null) return undefined;
  return n <= 1 && n >= -1 ? n * 100 : n;
}

function parseUsDate(v) {
  const s = str(v);
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return undefined;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function jobNumber(v) {
  if (v == null || v === '') return undefined;
  return String(Math.trunc(Number(v)));
}

function normalizeProjectRow(row) {
  const job = jobNumber(row.Job);
  const projectLabel = str(row.Project) ?? '';
  const dash = projectLabel.indexOf(' - ');
  const projectName = dash >= 0 ? projectLabel.slice(dash + 3).trim() : projectLabel;
  return {
    jobNumber: job,
    projectLabel,
    projectName,
    customer: str(row.Customer),
    status: str(row.Status),
    forecastTreatment: str(row['Forecast Treatment']),
    startDate: parseUsDate(row['Start Date']),
    endDate: parseUsDate(row['End Date']),
    contractBudget: num(row['Contract / Budget']),
    contractSource: str(row['Contract Source']) ?? (num(row['Contract Source']) != null ? String(row['Contract Source']) : undefined),
    cumulativeBilledEarned: num(row['Cumulative Billed / Earned']),
    billings2026Ytd: num(row['2026 Billings YTD']),
    openAr: num(row['Open A/R']),
    remainingBacklog: num(row['Remaining Backlog']),
    forecastLowPct: num(row['Low %']),
    forecastBasePct: num(row['Base %']),
    forecastHighPct: num(row['High %']),
    projected2026Low: num(row['Projected 2026 Low']),
    projected2026Base: num(row['Projected 2026 Base']),
    projected2026High: num(row['Projected 2026 High']),
    cogs2026Ytd: num(row['2026 COGS YTD']),
    grossProfit2026: num(row['2026 Gross Profit']),
    gpMargin2026: pctToDisplay(row['2026 GP Margin']),
    selfLabor: num(row['Self-Performed Labor']),
    subcontractors: num(row.Subcontractors),
    materials: num(row['Materials & Supplies']),
    equipmentOther: num(row['Equipment/Other']),
    openApIdentified: num(row['Open A/P Identified']),
    notes: str(row.Notes),
  };
}

function normalizeArRow(row) {
  return {
    jobNumber: jobNumber(row.Job),
    projectLabel: str(row.Project),
    status: str(row.Status),
    currentAmount: num(row.Current),
    days1To30: num(row['1-30']),
    days31To60: num(row['31-60']),
    days61To90: num(row['61-90']),
    days90Plus: num(row['91+']),
    totalOpen: num(row['Total A/R']),
    treatment: str(row.Treatment),
  };
}

function normalizePayAppRow(row) {
  return {
    jobNumber: jobNumber(row.Job),
    projectLabel: str(row.Project),
    sourceFile: str(row['Source File']),
    contractSum: num(row['Contract Sum']),
    completedToDate: num(row['Completed / Stored to Date']),
    earnedLessRetainage: num(row['Earned Less Retainage / Billed']),
    currentDue: num(row['Current Due']),
    balanceToFinish: num(row['Balance to Finish']),
    retainage: num(row['Retainage to Date / Current']),
    notes: str(row.Notes),
  };
}

function readDashboard(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const metrics = {};
  for (const row of rows) {
    if (row[0] && row[1] != null && row[1] !== '') {
      metrics[String(row[0]).trim()] = typeof row[1] === 'number' ? row[1] : String(row[1]);
    }
  }
  return metrics;
}

if (!fs.existsSync(inputPath)) {
  console.error('Workbook not found:', inputPath);
  process.exit(1);
}

const wb = XLSX.readFile(inputPath);
const projects = XLSX.utils.sheet_to_json(wb.Sheets['Project Forecast']).map(normalizeProjectRow);
const arAging = XLSX.utils.sheet_to_json(wb.Sheets['AR Aging Detail']).map(normalizeArRow);
const payApps = XLSX.utils.sheet_to_json(wb.Sheets['Pay Apps Used']).map(normalizePayAppRow);
const dashboard = readDashboard(wb.Sheets.Dashboard);

const seed = {
  meta: {
    sourceFile: path.basename(inputPath),
    asOfDate: '2026-05-29',
    title: 'Brighten Builders 2026 Billing Forecast — Updated with PA files + A/R status corrections',
    dashboard,
  },
  projects,
  arAging,
  payApps,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(seed, null, 2));
console.log('Wrote', outputPath);
console.log('Projects:', projects.length, '| AR rows:', arAging.length, '| Pay apps:', payApps.length);
