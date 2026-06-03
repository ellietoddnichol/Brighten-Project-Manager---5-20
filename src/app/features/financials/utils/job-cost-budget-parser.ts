import {
  JobCostBudgetCategory,
  JobCostBudgetLineSeed,
  JobCostBudgetProjectSeed,
  JobCostPortfolioSummarySeed,
} from '@app/data/job-cost-budget.types';
import { parseMoney, cellStr } from '@shared/utils/sheet-normalizers';

type RawRow = Record<string, unknown>;

const SECTION_MAP: Record<string, JobCostBudgetCategory> = {
  labor: 'Labor',
  material: 'Materials',
  subcontractors: 'Subcontractors',
  equipment: 'Other',
  other: 'Other',
};

const SUMMARY_CATEGORIES: JobCostBudgetCategory[] = ['Labor', 'Materials', 'Subcontractors', 'Other'];

function normalizeSummaryCategory(category: string): JobCostBudgetCategory {
  switch (category) {
    case 'Labor': return 'Labor';
    case 'Materials': return 'Materials';
    case 'Subcontractors': return 'Subcontractors';
    default: return 'Other';
  }
}

/** Collapse detailed workbook lines into Labor, Materials, Subcontractors, and Other. */
export function rollupJobCostBudgetLines(lines: JobCostBudgetLineSeed[]): JobCostBudgetLineSeed[] {
  const buckets = new Map<JobCostBudgetCategory, JobCostBudgetLineSeed>();

  for (const line of lines) {
    const category = normalizeSummaryCategory(line.category);
    const existing = buckets.get(category);
    if (!existing) {
      buckets.set(category, {
        costCode: category,
        category,
        originalBudget: line.originalBudget,
        approvedCOBudget: line.approvedCOBudget,
        revisedBudget: line.revisedBudget,
        actualCost: line.actualCost,
        costToComplete: line.costToComplete,
        projectedFinalCost: line.projectedFinalCost,
        variance: line.variance,
        hoursBudgeted: line.hoursBudgeted,
        hoursActual: line.hoursActual,
      });
      continue;
    }

    existing.originalBudget += line.originalBudget;
    existing.approvedCOBudget += line.approvedCOBudget;
    existing.revisedBudget += line.revisedBudget;
    existing.actualCost += line.actualCost;
    existing.costToComplete += line.costToComplete;
    existing.projectedFinalCost += line.projectedFinalCost;
    existing.variance += line.variance;
    if (line.hoursBudgeted) existing.hoursBudgeted = (existing.hoursBudgeted ?? 0) + line.hoursBudgeted;
    if (line.hoursActual) existing.hoursActual = (existing.hoursActual ?? 0) + line.hoursActual;
  }

  return SUMMARY_CATEGORIES
    .filter(cat => buckets.has(cat))
    .map(cat => buckets.get(cat)!);
}

function rowVal(row: RawRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return undefined;
}

function rowText(row: RawRow, ...keys: string[]): string {
  return cellStr(rowVal(row, ...keys));
}

function isSubtotalLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return lower.includes('sub total') || lower.includes('sub totals') || lower === 'overall job totals';
}

function mapSection(section: string): JobCostBudgetCategory {
  return SECTION_MAP[section.trim().toLowerCase()] ?? 'Other';
}

function marginToPercent(value: number | undefined): number | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  if (Math.abs(value) <= 1) return value * 100;
  return value;
}

function lineFromRow(section: JobCostBudgetCategory, row: RawRow): JobCostBudgetLineSeed | null {
  const costCode = rowText(row, '__EMPTY_2', 'Cost Code', 'costCode');
  if (!costCode || isSubtotalLabel(costCode)) return null;

  const budget = parseMoney(rowVal(row, '__EMPTY_3', '$ Budgeted', 'budgeted'));
  const actual = parseMoney(rowVal(row, '__EMPTY_4', '$ Actual', 'actual'));
  const change = parseMoney(rowVal(row, '__EMPTY_7', 'Change', 'change'));
  const hoursBudgeted = parseMoney(rowVal(row, '__EMPTY_8', 'Hrs Budgeted', 'hoursBudgeted')) || undefined;
  const hoursActual = parseMoney(rowVal(row, '__EMPTY_9', 'Hrs Actual', 'hoursActual')) || undefined;

  if (!budget && !actual && !change) return null;

  const costToComplete = Math.max(0, budget - actual);
  return {
    costCode,
    category: section,
    originalBudget: budget,
    approvedCOBudget: change,
    revisedBudget: budget + change,
    actualCost: actual,
    costToComplete,
    projectedFinalCost: actual + costToComplete,
    variance: actual - budget,
    hoursBudgeted,
    hoursActual,
  };
}

function sectionTotalsFromRow(row: RawRow): Partial<JobCostBudgetProjectSeed> | null {
  const label = rowText(row, '__EMPTY_2', 'Cost Code');
  if (!isSubtotalLabel(label)) return null;

  const budget = parseMoney(rowVal(row, '__EMPTY_3'));
  const actual = parseMoney(rowVal(row, '__EMPTY_4'));
  const lower = label.toLowerCase();

  if (lower.includes('labor')) {
    return { estLaborCost: budget, actualCostToDate: actual };
  }
  if (lower.includes('material')) {
    return { estMaterialCost: budget };
  }
  if (lower.includes('subcontractor')) {
    return { estSubCost: budget };
  }
  if (lower.includes('other')) {
    return { estOtherCost: budget };
  }
  return null;
}

/** Parse rows exported from the "Updated Budget" tab of a Brighten job cost workbook. */
export function parseUpdatedBudgetSheet(
  rows: RawRow[],
  sourceFile: string,
  fallbackJobNumber?: string,
): JobCostBudgetProjectSeed | null {
  if (!rows.length) return null;

  let projectName = '';
  let jobNumber = fallbackJobNumber ?? '';
  let updatedContract: number | undefined;
  let changeOrderCount: number | undefined;
  let estCostBudget: number | undefined;
  let actualCostToDate: number | undefined;
  let estimatedProfit: number | undefined;
  let estimatedMargin: number | undefined;
  let percentComplete: number | undefined;
  let estLaborCost: number | undefined;
  let estMaterialCost: number | undefined;
  let estSubCost: number | undefined;
  let estOtherCost: number | undefined;

  let currentSection: JobCostBudgetCategory = 'Other';
  const lines: JobCostBudgetLineSeed[] = [];

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
      currentSection = mapSection(label1);
      continue;
    }

    const sectionTotals = sectionTotalsFromRow(row);
    if (sectionTotals) {
      estLaborCost = sectionTotals.estLaborCost ?? estLaborCost;
      estMaterialCost = sectionTotals.estMaterialCost ?? estMaterialCost;
      estSubCost = sectionTotals.estSubCost ?? estSubCost;
      estOtherCost = sectionTotals.estOtherCost ?? estOtherCost;
      if (sectionTotals.actualCostToDate != null && label2.toLowerCase().includes('labor')) {
        // labor subtotal actual is most reliable section actual
        actualCostToDate = sectionTotals.actualCostToDate;
      }
      continue;
    }

    const line = lineFromRow(currentSection, row);
    if (line) lines.push(line);
  }

  if (!jobNumber) {
    const match = sourceFile.match(/J(\d+)/i);
    if (match) jobNumber = match[1];
  }

  if (!jobNumber) return null;

  const summaryLines = rollupJobCostBudgetLines(lines);

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
    lines: summaryLines,
  };
}

export function parsePortfolioSummaryRow(row: RawRow): JobCostPortfolioSummarySeed | null {
  const jobLabel = rowText(row, 'Job #', 'jobLabel');
  if (!jobLabel) return null;

  const match = jobLabel.match(/^(\d+)\s*-\s*(.+)$/);
  const jobNumber = match ? match[1] : jobLabel.replace(/\D/g, '');
  if (!jobNumber) return null;

  const estProfitPercentRaw = rowVal(row, 'Est. Profit %', 'estProfitPercent');
  let estProfitPercent = parseMoney(estProfitPercentRaw);
  if (String(estProfitPercentRaw).includes('#DIV')) estProfitPercent = 0;

  return {
    jobNumber,
    jobLabel,
    status: rowText(row, 'Status', 'status') || undefined,
    contractAmount: parseMoney(rowVal(row, 'Contract Amount', 'contractAmount')) || undefined,
    currentCost: parseMoney(rowVal(row, 'Current Cost', 'currentCost')) || undefined,
    costToComplete: parseMoney(rowVal(row, 'Cost to Complete', 'costToComplete')) || undefined,
    estTotalCost: parseMoney(rowVal(row, 'Est. Total Cost', 'estTotalCost')) || undefined,
    estProfit: parseMoney(rowVal(row, 'Est. Profit ', 'Est. Profit', 'estProfit')) || undefined,
    estProfitPercent: marginToPercent(estProfitPercent),
    totalInvoiced: parseMoney(rowVal(row, 'Total Invoiced', 'totalInvoiced')) || undefined,
    leftToInvoice: parseMoney(rowVal(row, 'Total Left to Invoice', 'leftToInvoice')) || undefined,
    laborCost: parseMoney(rowVal(row, 'Labor Cost', 'laborCost')) || undefined,
    materialCost: parseMoney(rowVal(row, 'Material Cost', 'materialCost')) || undefined,
    subcontractorCost: parseMoney(rowVal(row, 'Subcontractor', 'subcontractorCost')) || undefined,
    foreman: rowText(row, 'Foreman', 'foreman') || undefined,
  };
}

export function jobNumberFromBudgetFilename(filename: string): string | undefined {
  const match = filename.match(/J(\d+)/i);
  return match ? match[1] : undefined;
}

export function projectNameFromBudgetFilename(filename: string): string | undefined {
  const base = filename.replace(/\.xlsx$/i, '');
  const dashMatch = base.match(/^J?\d+\s*-\s*(.+?)(?:\s*-\s*Job Costs Budget)?$/i);
  if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
  const plain = base.replace(/\s*Job Costs Budget$/i, '').replace(/^J?\d+\s*/i, '').trim();
  return plain || undefined;
}

export function scoreParsedBudget(
  parsed: JobCostBudgetProjectSeed,
  filenameJobNumber: string,
): number {
  let score = (parsed.estCostBudget ?? 0) + parsed.lines.length * 250;
  if (parsed.actualCostToDate) score += 50_000;
  if (parsed.jobNumber === filenameJobNumber) score += 1_000_000;
  return score;
}
