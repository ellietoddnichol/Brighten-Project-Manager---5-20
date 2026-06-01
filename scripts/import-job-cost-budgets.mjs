#!/usr/bin/env node
/**
 * Reads Brighten job cost budget Excel files from the repo root and writes
 * src/app/data/job-cost-budget-seed.json for the app to import.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'src/app/data/job-cost-budget-seed.json');

function cellStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseMoney(value) {
  if (value == null || value === '') return 0;
  const raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—' || raw.includes('#DIV')) return 0;
  const negative = raw.includes('(') && raw.includes(')');
  const n = Number(raw.replace(/[$,\s()]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

function marginToPercent(value) {
  if (value == null || Number.isNaN(value)) return undefined;
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

const SECTION_MAP = {
  labor: 'Labor',
  material: 'Materials',
  subcontractors: 'Subcontractors',
  other: 'Other',
};

function isSubtotalLabel(label) {
  const lower = label.toLowerCase();
  return lower.includes('sub total') || lower.includes('sub totals') || lower === 'overall job totals';
}

function rowText(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return cellStr(row[key]);
  }
  return '';
}

function rowVal(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return undefined;
}

function parseUpdatedBudgetSheet(rows, sourceFile, fallbackJobNumber) {
  if (!rows.length) return null;

  let projectName = '';
  let jobNumber = fallbackJobNumber ?? '';
  let updatedContract;
  let changeOrderCount;
  let estCostBudget;
  let actualCostToDate;
  let estimatedProfit;
  let estimatedMargin;
  let percentComplete;
  let estLaborCost;
  let estMaterialCost;
  let estSubCost;
  let estOtherCost;

  let currentSection = 'Other';
  const lines = [];

  for (const row of rows) {
    const label1 = rowText(row, '__EMPTY_1', 'Section');
    const label2 = rowText(row, '__EMPTY_2', 'Cost Code');

    if (label1 === 'Project Name:') {
      projectName = label2;
      const job = rowVal(row, '__EMPTY_5', 'Job #');
      if (job != null && job !== '') jobNumber = String(Math.trunc(Number(job)));
      continue;
    }

    if (label1 === 'Updated Contract :' || label1 === 'Contract Amount:') {
      updatedContract = parseMoney(rowVal(row, '__EMPTY_2')) || undefined;
      const co = rowVal(row, '__EMPTY_5', 'CO #', 'Thru CO #');
      if (co != null && co !== '') changeOrderCount = Number(co);
      continue;
    }

    if (label1 === 'Change Amount:') {
      const changeAmount = parseMoney(rowVal(row, '__EMPTY_2'));
      if (changeAmount) updatedContract = changeAmount;
      const co = rowVal(row, '__EMPTY_5', 'CO #');
      if (co != null && co !== '') changeOrderCount = Number(co);
      continue;
    }

    if (label1 === 'Overall Job Totals') {
      estCostBudget = parseMoney(rowVal(row, '__EMPTY_3')) || estCostBudget;
      updatedContract = parseMoney(rowVal(row, '__EMPTY_4')) || updatedContract;
      estimatedProfit = parseMoney(rowVal(row, '__EMPTY_5')) || estimatedProfit;
      estimatedMargin = marginToPercent(parseMoney(rowVal(row, '__EMPTY_6')) || undefined);
      actualCostToDate = parseMoney(rowVal(row, '__EMPTY_7')) || actualCostToDate;
      percentComplete = marginToPercent(parseMoney(rowVal(row, '__EMPTY_8')) || undefined);
      continue;
    }

    const sectionNum = rowVal(row, '__EMPTY');
    if (sectionNum != null && label1 && !label2) {
      currentSection = SECTION_MAP[label1.trim().toLowerCase()] ?? 'Other';
      continue;
    }

    if (label2 && isSubtotalLabel(label2)) {
      const budget = parseMoney(rowVal(row, '__EMPTY_3'));
      const actual = parseMoney(rowVal(row, '__EMPTY_4'));
      const lower = label2.toLowerCase();
      if (lower.includes('labor')) {
        estLaborCost = budget;
        actualCostToDate = actual || actualCostToDate;
      } else if (lower.includes('material')) {
        estMaterialCost = budget;
      } else if (lower.includes('subcontractor')) {
        estSubCost = budget;
      } else if (lower.includes('other')) {
        estOtherCost = budget;
      }
      continue;
    }

    const costCode = label2;
    if (!costCode || isSubtotalLabel(costCode)) continue;

    const budget = parseMoney(rowVal(row, '__EMPTY_3', '$ Budgeted'));
    const actual = parseMoney(rowVal(row, '__EMPTY_4', '$ Actual'));
    const change = parseMoney(rowVal(row, '__EMPTY_7', 'Change'));
    const hoursBudgeted = parseMoney(rowVal(row, '__EMPTY_8')) || undefined;
    const hoursActual = parseMoney(rowVal(row, '__EMPTY_9')) || undefined;

    if (!budget && !actual && !change) continue;

    const costToComplete = Math.max(0, budget - actual);
    lines.push({
      costCode,
      category: currentSection,
      originalBudget: budget,
      approvedCOBudget: change,
      revisedBudget: budget + change,
      actualCost: actual,
      costToComplete,
      projectedFinalCost: actual + costToComplete,
      variance: actual - budget,
      hoursBudgeted,
      hoursActual,
    });
  }

  if (!jobNumber) {
    const match = sourceFile.match(/J(\d+)/i);
    if (match) jobNumber = match[1];
  }
  if (!jobNumber) return null;

  return {
    jobNumber,
    projectName: projectName || sourceFile.replace(/\.xlsx$/i, ''),
    sourceFile,
    updatedContract,
    changeOrderCount,
    estCostBudget,
    actualCostToDate,
    estimatedProfit,
    estimatedMargin,
    percentComplete,
    estLaborCost,
    estMaterialCost,
    estSubCost,
    estOtherCost,
    lines,
  };
}

function parsePortfolioSummaryRow(row) {
  const jobLabel = rowText(row, 'Job #');
  if (!jobLabel) return null;

  const match = jobLabel.match(/^(\d+)\s*-\s*(.+)$/);
  const jobNumber = match ? match[1] : jobLabel.replace(/\D/g, '');
  if (!jobNumber) return null;

  const estProfitPercentRaw = rowVal(row, 'Est. Profit %');
  let estProfitPercent = parseMoney(estProfitPercentRaw);

  return {
    jobNumber,
    jobLabel,
    status: rowText(row, 'Status') || undefined,
    contractAmount: parseMoney(rowVal(row, 'Contract Amount')) || undefined,
    currentCost: parseMoney(rowVal(row, 'Current Cost')) || undefined,
    costToComplete: parseMoney(rowVal(row, 'Cost to Complete')) || undefined,
    estTotalCost: parseMoney(rowVal(row, 'Est. Total Cost')) || undefined,
    estProfit: parseMoney(rowVal(row, 'Est. Profit ')) || parseMoney(rowVal(row, 'Est. Profit')) || undefined,
    estProfitPercent: marginToPercent(estProfitPercent),
    totalInvoiced: parseMoney(rowVal(row, 'Total Invoiced')) || undefined,
    leftToInvoice: parseMoney(rowVal(row, 'Total Left to Invoice')) || undefined,
    laborCost: parseMoney(rowVal(row, 'Labor Cost')) || undefined,
    materialCost: parseMoney(rowVal(row, 'Material Cost')) || undefined,
    subcontractorCost: parseMoney(rowVal(row, 'Subcontractor')) || undefined,
    foreman: rowText(row, 'Foreman') || undefined,
  };
}

function projectNameFromBudgetFilename(filename) {
  const base = filename.replace(/\.xlsx$/i, '');
  const dashMatch = base.match(/^J?\d+\s*-\s*(.+?)(?:\s*-\s*Job Costs Budget)?$/i);
  if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
  const plain = base.replace(/\s*Job Costs Budget$/i, '').replace(/^J?\d+\s*/i, '').trim();
  return plain || undefined;
}

function scoreParsedBudget(parsed, filenameJobNumber) {
  let score = (parsed.estCostBudget ?? 0) + parsed.lines.length * 250;
  if (parsed.actualCostToDate) score += 50_000;
  if (parsed.jobNumber === filenameJobNumber) score += 1_000_000;
  return score;
}

function parseWorkbookFile(filePath, filename) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const filenameJob = filename.match(/J(\d+)/i)?.[1];
  const filenameProjectName = projectNameFromBudgetFilename(filename);
  const candidateSheets = ['Updated Budget', 'CO3', 'CO2', 'CO1', 'Original'];

  let best = null;
  let bestSheet = null;

  for (const sheetName of candidateSheets) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const parsed = parseUpdatedBudgetSheet(rows, filename, filenameJob);
    if (!parsed) continue;

    const score = scoreParsedBudget(parsed, filenameJob ?? parsed.jobNumber);
    if (!best || score > best.score) {
      best = { parsed, score };
      bestSheet = sheetName;
    }
  }

  if (!best) return null;

  const result = best.parsed;
  if (filenameJob) result.jobNumber = filenameJob;
  if (filenameProjectName && (!result.projectName || result.jobNumber !== best.parsed.jobNumber)) {
    result.projectName = filenameProjectName;
  } else if (filenameProjectName && result.projectName.includes('Job Costs Budget')) {
    result.projectName = filenameProjectName;
  }

  result.sourceSheet = bestSheet;
  return result;
}

function readSheetRows(filePath, sheetName) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return null;
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

const sourceFiles = [];
const projects = [];

for (const name of fs.readdirSync(root)) {
  if (!/Job Costs Budget\.xlsx$/i.test(name)) continue;
  const filePath = path.join(root, name);
  const parsed = parseWorkbookFile(filePath, name);
  if (!parsed) {
    console.warn(`Skipping ${name}: could not parse`);
    continue;
  }
  projects.push(parsed);
  sourceFiles.push(name);
  console.log(
    `Parsed ${name} [${parsed.sourceSheet}]: J${parsed.jobNumber} ${parsed.projectName} (${parsed.lines.length} lines, budget $${parsed.estCostBudget ?? 0})`,
  );
}

const portfolioSummaries = [];
const contractsPath = path.join(root, 'Contracts_Budget Updates.xlsx');
if (fs.existsSync(contractsPath)) {
  const rows = readSheetRows(contractsPath, 'All Jobs - Budget');
  if (rows) {
    for (const row of rows) {
      const parsed = parsePortfolioSummaryRow(row);
      if (parsed) portfolioSummaries.push(parsed);
    }
    sourceFiles.push('Contracts_Budget Updates.xlsx');
    console.log(`Parsed portfolio summary: ${portfolioSummaries.length} jobs`);
  }
}

projects.sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber));
portfolioSummaries.sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber));

const lineCount = projects.reduce((sum, p) => sum + p.lines.length, 0);
const bundle = {
  meta: {
    generatedAt: new Date().toISOString(),
    sourceFiles,
    projectCount: projects.length,
    lineCount,
  },
  projects,
  portfolioSummaries,
};

fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`${projects.length} detailed budgets, ${lineCount} cost code lines, ${portfolioSummaries.length} portfolio rows`);
