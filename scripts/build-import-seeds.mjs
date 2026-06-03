#!/usr/bin/env node
/**
 * Build all import seed JSON files from mock-data/imports/
 *
 * Usage: node scripts/build-import-seeds.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { buildDriveFolderSeed } from './lib/parse-drive-folders.mjs';
import { parseSubcontractorSummaryPdf, parseSubcontractorDetailPdf } from './lib/parse-qb-subcontractor.mjs';
import { parseProjectCostsDetailWorkbook } from './lib/parse-project-costs.mjs';
import { jobNumberFromFilename, parseMoney, cellStr } from './lib/import-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const importsDir = path.join(root, 'mock-data/imports');
const budgetsDir = path.join(importsDir, 'budgets');
const seedsDir = path.join(root, 'mock-data/seeds');
const legacyDataDir = path.join(root, 'mock-data');

fs.mkdirSync(seedsDir, { recursive: true });
fs.mkdirSync(budgetsDir, { recursive: true });

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

function parseBudgetSheet(rows, sourceFile, sheetName, fallbackJobNumber) {
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
    if (label1 === 'Overall Job Totals') {
      estCostBudget = parseMoney(rowVal(row, '__EMPTY_3')) || estCostBudget;
      updatedContract = parseMoney(rowVal(row, '__EMPTY_4')) || updatedContract;
      estimatedProfit = parseMoney(rowVal(row, '__EMPTY_5')) || estimatedProfit;
      actualCostToDate = parseMoney(rowVal(row, '__EMPTY_7')) || actualCostToDate;
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
      if (lower.includes('labor')) { estLaborCost = budget; actualCostToDate = actual || actualCostToDate; }
      else if (lower.includes('material')) estMaterialCost = budget;
      else if (lower.includes('subcontractor')) estSubCost = budget;
      else if (lower.includes('other')) estOtherCost = budget;
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
      section: currentSection,
      originalBudget: budget,
      approvedCOBudget: change,
      revisedBudget: budget + change,
      budgetAmount: budget + change,
      actualCost: actual,
      costToComplete,
      projectedFinalCost: actual + costToComplete,
      variance: actual - budget,
      hoursBudgeted,
      hoursActual,
      sourceSheetName: sheetName,
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
    sourceSheetName: sheetName,
    snapshotType:
      sheetName === 'Original' ? 'Original'
      : sheetName === 'Updated Budget' ? 'UpdatedBudget'
      : sheetName.startsWith('CO') ? 'ChangeBudget'
      : sheetName === 'SOV' ? 'SOV'
      : 'UpdatedBudget',
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
    totalBudget: estCostBudget,
    lines,
  };
}

/** SOV sheets use a simple description + scheduled value layout (not cost-code rows). */
function parseSovSheet(sheet, sourceFile, fallbackJobNumber) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  if (!rows.length) return [];
  const lines = [];
  let lineNumber = 0;
  for (const row of rows) {
    const desc = cellStr(row[0] ?? '').trim();
    const value = row[1];
    if (!desc || desc.toLowerCase() === 'contract amount') continue;
    const scheduledValue = parseMoney(value);
    if (!scheduledValue) continue;
    lineNumber++;
    lines.push({
      lineNumber,
      description: desc,
      scheduledValue,
      percentComplete: undefined,
      billedAmount: undefined,
      remainingAmount: scheduledValue,
      sourceFileName: sourceFile,
      sourceSheetName: 'SOV',
      jobNumber: fallbackJobNumber ?? '',
    });
  }
  return lines;
}

function parseBudgetWorkbook(filePath) {
  const filename = path.basename(filePath);
  const filenameJob = jobNumberFromFilename(filename);
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const snapshots = [];
  const warnings = [];
  let sovLines = [];

  for (const sheetName of ['Original', 'Updated Budget', 'CO1', 'CO2', 'CO3', 'SOV']) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    if (sheetName === 'SOV') {
      const parsedSov = parseSovSheet(sheet, filename, filenameJob);
      if (parsedSov.length) sovLines = parsedSov;
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const parsed = parseBudgetSheet(rows, filename, sheetName, filenameJob);
    if (!parsed) continue;
    if (filenameJob && parsed.jobNumber !== filenameJob) {
      warnings.push(`Job number conflict: filename J${filenameJob} vs workbook J${parsed.jobNumber}`);
    }
    if (sheetName.startsWith('CO') && parsed.lines.some(l => (l.approvedCOBudget ?? 0) !== 0)) {
      warnings.push(`Review budget ${sheetName} sheet for change order import (J${parsed.jobNumber})`);
    }
    snapshots.push(parsed);
  }

  const updated = snapshots.find(s => s.sourceSheetName === 'Updated Budget' && (s.estCostBudget ?? 0) > 0);
  const original = snapshots.find(s => s.sourceSheetName === 'Original');
  const current = updated ?? original ?? snapshots[0];
  if (!current) return null;

  return {
    jobNumber: filenameJob ?? current.jobNumber,
    projectName: current.projectName,
    sourceFileName: filename,
    snapshots,
    sovLines: sovLines.map(l => ({ ...l, jobNumber: filenameJob ?? current.jobNumber })),
    current,
    warnings,
  };
}

async function main() {
  console.log('Building import seeds...\n');

  const existingDriveSeed = path.join(legacyDataDir, 'drive-folder-seed.json');
  const driveSeed = buildDriveFolderSeed({ importsDir, seedsDir, existingSeedPath: existingDriveSeed });
  const driveOut = path.join(seedsDir, 'drive-folder-seed.json');
  fs.writeFileSync(driveOut, JSON.stringify(driveSeed, null, 2));
  fs.writeFileSync(existingDriveSeed, JSON.stringify(driveSeed, null, 2));
  console.log(`Drive folders: ${driveSeed.projectRoots.length} roots (${driveSeed.meta.inProgressCount} active, ${driveSeed.meta.closedCount} closed)`);

  const summaryPath = path.join(importsDir, 'account-quickreport-summary.pdf');
  const detailPath = path.join(importsDir, 'account-quickreport-detail.pdf');
  if (fs.existsSync(summaryPath) && fs.existsSync(detailPath)) {
    const summary = await parseSubcontractorSummaryPdf(summaryPath);
    const detail = await parseSubcontractorDetailPdf(detailPath);
    fs.writeFileSync(path.join(seedsDir, 'subcontractor-master-seed.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(seedsDir, 'subcontractor-detail-seed.json'), JSON.stringify(detail, null, 2));
    console.log(`Subcontractors: ${summary.vendors.length} vendors, ${detail.transactions.length} cost transactions, ${detail.projectSubcontractors.length} project subs`);
  }

  const costsPath = path.join(importsDir, 'project-costs-detail.xlsx');
  if (fs.existsSync(costsPath)) {
    const costs = parseProjectCostsDetailWorkbook(costsPath);
    fs.writeFileSync(path.join(seedsDir, 'project-cost-transactions-seed.json'), JSON.stringify(costs, null, 2));
    fs.writeFileSync(path.join(legacyDataDir, 'project-costs-seed.json'), JSON.stringify({
      meta: costs.meta,
      projects: costs.projects,
      monthlyLabor: costs.monthlyLabor,
    }, null, 2));
    console.log(`Project costs: ${costs.projects.length} projects, ${costs.transactions.length} transactions`);
  }

  const budgetImports = [];
  const budgetExceptions = [];
  if (fs.existsSync(budgetsDir)) {
    for (const name of fs.readdirSync(budgetsDir).filter(n => n.endsWith('.xlsx'))) {
      const parsed = parseBudgetWorkbook(path.join(budgetsDir, name));
      if (!parsed) {
        budgetExceptions.push({ type: 'budgetParseFailed', sourceFileName: name, message: 'Could not parse workbook' });
        continue;
      }
      budgetImports.push(parsed);
      for (const w of parsed.warnings) {
        budgetExceptions.push({ type: 'budgetImportWarning', jobNumber: parsed.jobNumber, sourceFileName: name, message: w });
      }
      console.log(`Budget J${parsed.jobNumber}: ${parsed.snapshots.length} snapshots, ${parsed.current.lines.length} lines [${parsed.current.sourceSheetName}]${parsed.sovLines?.length ? `, ${parsed.sovLines.length} SOV lines` : ''}`);
    }
  }

  const budgetBundle = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceDir: 'mock-data/imports/budgets',
      projectCount: budgetImports.length,
    },
    imports: budgetImports,
    exceptions: budgetExceptions,
  };
  fs.writeFileSync(path.join(seedsDir, 'budget-import-seed.json'), JSON.stringify(budgetBundle, null, 2));

  const jobCostProjects = budgetImports.map(b => ({
    ...b.current,
    sourceFile: b.sourceFileName,
    snapshots: b.snapshots.map(s => ({
      snapshotType: s.snapshotType,
      sourceSheetName: s.sourceSheetName,
      totalBudget: s.estCostBudget,
      totalActual: s.actualCostToDate,
      lineCount: s.lines.length,
    })),
  }));
  fs.writeFileSync(path.join(legacyDataDir, 'job-cost-budget-seed.json'), JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFiles: budgetImports.map(b => b.sourceFileName),
      projectCount: jobCostProjects.length,
      lineCount: jobCostProjects.reduce((s, p) => s + p.lines.length, 0),
    },
    projects: jobCostProjects,
    portfolioSummaries: [],
  }, null, 2));

  const importReviewSeed = {
    meta: { generatedAt: new Date().toISOString() },
    exceptions: [
      ...budgetExceptions,
      ...driveSeed.duplicateReviews.map(d => ({
        type: 'duplicateDriveFolder',
        jobNumber: d.jobNumber,
        message: d.note,
        status: 'NeedsReview',
      })),
    ],
  };
  fs.writeFileSync(path.join(seedsDir, 'import-review-seed.json'), JSON.stringify(importReviewSeed, null, 2));

  console.log(`\nWrote seeds to ${seedsDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
