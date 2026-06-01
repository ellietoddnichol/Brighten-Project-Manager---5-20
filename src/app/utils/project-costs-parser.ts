import {
  ProjectCostCategory,
  ProjectCostMonthlyLabor,
  ProjectCostSummary,
  ProjectCostTransaction,
} from '../data/project-costs.types';
import { Project } from '../models/types';

const LABOR_ACCOUNTS = ['wages - cogs', 'union benefits - cogs'];
const SUB_ACCOUNTS = ['sub contract labor - cogs'];
const MATERIAL_ACCOUNTS = ['job supplies - cogs', 'shop supplies - cogs', 'job materials & supplies'];
const EQUIPMENT_ACCOUNTS = ['equipment rental - cogs', 'tools - cogs'];

export function categorizeDistributionAccount(account: string): ProjectCostCategory {
  const acct = account.trim().toLowerCase();
  if (LABOR_ACCOUNTS.some(a => acct === a || acct.includes('wages') || acct.includes('union benefits'))) {
    return 'labor';
  }
  if (SUB_ACCOUNTS.some(a => acct === a || acct.includes('sub contract'))) return 'sub';
  if (MATERIAL_ACCOUNTS.some(a => acct === a || acct.includes('supplies') || acct.includes('material'))) {
    return 'material';
  }
  if (EQUIPMENT_ACCOUNTS.some(a => acct === a || acct.includes('equipment') || acct.includes('tools'))) {
    return 'equipment';
  }
  return 'other';
}

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseAmount(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value: unknown): string | undefined {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw;
}

function monthFromDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parseProjectLabel(label: string): { jobNumber: string; projectName: string } {
  const match = label.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) return { jobNumber: match[1], projectName: match[2].trim() };
  return { jobNumber: label.replace(/\D/g, '') || label, projectName: label };
}

function isProjectHeader(label: string): boolean {
  return /^\d+\s*-\s*.+/.test(label.trim());
}

type TaggedTransaction = ProjectCostTransaction & { jobNumber: string; qboLabel: string };

/** Parse QBO "Project costs detail" export (hierarchical job sections). */
export function parseProjectCostsDetailSheet(rows: Record<string, unknown>[]): {
  periodLabel?: string;
  projects: ProjectCostSummary[];
  monthlyLabor: ProjectCostMonthlyLabor[];
  transactions: ProjectCostTransaction[];
} {
  let periodLabel: string | undefined;
  let current: { jobNumber: string; qboLabel: string; projectName: string } | null = null;
  const transactions: TaggedTransaction[] = [];

  for (const row of rows) {
    const firstVal = cellStr(Object.values(row)[0]);

    if (firstVal && !row['__EMPTY'] && !row['__EMPTY_4']) {
      if (firstVal.toLowerCase().includes('project costs detail')) continue;
      if (/^[A-Za-z]+\s+\d/.test(firstVal) && firstVal.includes('202') && !isProjectHeader(firstVal)) {
        periodLabel = firstVal;
        continue;
      }
      if (isProjectHeader(firstVal)) {
        const parsed = parseProjectLabel(firstVal);
        current = { qboLabel: firstVal, ...parsed };
        continue;
      }
    }

    const account = cellStr(row['__EMPTY_4'] ?? row['Distribution account']);
    const amount = parseAmount(row['__EMPTY_8'] ?? row['Amount']);
    if (!account || !amount || !current) continue;

    const date = parseDate(row['__EMPTY_2'] ?? row['Date']);
    transactions.push({
      jobNumber: current.jobNumber,
      qboLabel: current.qboLabel,
      vendor: cellStr(row['__EMPTY'] ?? row['Vendor']) || undefined,
      transactionType: cellStr(row['__EMPTY_1'] ?? row['Transaction type']) || undefined,
      date,
      month: monthFromDate(date),
      num: cellStr(row['__EMPTY_3'] ?? row['Num']) || undefined,
      account,
      accountType: cellStr(row['__EMPTY_5'] ?? row['Distribution account type']) || undefined,
      className: cellStr(row['__EMPTY_6'] ?? row['Class']) || undefined,
      memo: cellStr(row['__EMPTY_7'] ?? row['Memo/Description']) || undefined,
      amount,
      category: categorizeDistributionAccount(account),
    });
  }

  const projectMap = new Map<string, ProjectCostSummary>();
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

  const monthlyMap = new Map<string, ProjectCostMonthlyLabor>();
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

  return {
    periodLabel,
    projects: [...projectMap.values()].sort((a, b) =>
      a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }),
    ),
    monthlyLabor: [...monthlyMap.values()].sort((a, b) =>
      b.month.localeCompare(a.month) || a.jobNumber.localeCompare(b.jobNumber, undefined, { numeric: true }),
    ),
    transactions: transactions.map(({ jobNumber, qboLabel, ...txn }) => txn),
  };
}

export function projectCostSummaryToProjectUpdate(
  summary: ProjectCostSummary,
  syncedAt: string,
): Partial<Project> {
  return {
    qboProjectLabel: summary.qboLabel,
    actualCostToDate: summary.totalCost,
    selfPerformedAmount: summary.laborCost,
    subcontractorAmount: summary.subCost,
    qboLaborCost: summary.laborCost,
    qboMaterialCost: summary.materialCost,
    qboSubCost: summary.subCost,
    qboEquipmentCost: summary.equipmentCost,
    qboOtherCost: summary.otherCost,
    qboCostDetailSyncedAt: syncedAt,
  };
}
