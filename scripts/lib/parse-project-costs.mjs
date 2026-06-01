import fs from 'node:fs';
import path from 'node:path';
import {
  categorizeDistributionAccount,
  cellStr,
  isRetainageDescription,
  monthFromDate,
  parseAmount,
  parseDate,
  parseJobFromCustomer,
  stableImportKey,
} from './import-utils.mjs';
import XLSX from 'xlsx';

function isProjectHeader(label) {
  return /^\d+\s*-\s*.+/.test(label.trim());
}

function isTotalLine(label) {
  return label.toLowerCase().startsWith('total for');
}

function isAccountSection(label) {
  if (!label || isProjectHeader(label) || isTotalLine(label)) return false;
  if (label === 'Direct Costs (COGS)' || label === 'Project costs detail' || label === 'All Dates') return false;
  return true;
}

function categorizeFromSection(section, accountType, memo) {
  const s = (section ?? '').toLowerCase();
  const m = (memo ?? '').toLowerCase();
  if (s.includes('wages') || s.includes('union benefits') || s.includes('labor')) return 'Labor';
  if (s.includes('sub contract') || s.includes('subcontract')) return 'Subcontractor';
  if (s.includes('material') || s.includes('supplies') || s.includes('job supplies')) return 'Material';
  if (s.includes('equipment') || s.includes('rental') || s.includes('tools')) return 'Equipment';
  if (s.includes('fuel') || s.includes('insurance') || s.includes('bond') || s.includes('general')) {
    return 'GeneralConditions';
  }
  const fromAccount = categorizeDistributionAccount(section || memo || accountType || '');
  if (fromAccount !== 'Other') return fromAccount;
  if (m.includes('lift') || m.includes('crane') || m.includes('rental')) return 'Equipment';
  return 'Other';
}

export function parseProjectCostsDetailWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const colKey = Object.keys(rows[0] ?? {}).find(k => k !== '__EMPTY') ?? 'Brighten Builders LLC';

  let periodLabel = 'All Dates';
  let current = null;
  let currentAccountSection = '';
  const transactions = [];

  for (const row of rows) {
    const col1 = cellStr(row[colKey]);

    if (col1 === 'All Dates') {
      periodLabel = col1;
      continue;
    }
    if (col1.toLowerCase().includes('project costs detail')) continue;

    if (isProjectHeader(col1)) {
      const parsed = parseJobFromCustomer(col1);
      current = { qboLabel: col1, ...parsed };
      continue;
    }

    if (isAccountSection(col1)) {
      currentAccountSection = col1;
      continue;
    }

    if (isTotalLine(col1)) continue;

    const vendor = cellStr(row.__EMPTY ?? row.Vendor);
    const amount = parseAmount(row.__EMPTY_7 ?? row.Amount);
    if (!vendor || !amount || !current) continue;

    const date = parseDate(row.__EMPTY_2 ?? row.Date);
    const accountType = cellStr(row.__EMPTY_4 ?? row['Distribution account type']);
    const description = cellStr(row.__EMPTY_6 ?? row['Memo/Description']) || undefined;
    const transactionNumber = cellStr(row.__EMPTY_3 ?? row.Num) || undefined;
    const account = currentAccountSection || accountType;
    const costCategory = categorizeFromSection(currentAccountSection, accountType, description);

    transactions.push({
      jobNumber: current.jobNumber,
      qboLabel: current.qboLabel,
      projectName: current.projectName,
      vendor,
      transactionType: cellStr(row.__EMPTY_1 ?? row['Transaction type']) || undefined,
      transactionDate: date,
      month: monthFromDate(date),
      transactionNumber,
      account,
      accountType,
      className: cellStr(row.__EMPTY_5 ?? row.Class) || undefined,
      description,
      amount,
      costCategory,
      retainageFlag: isRetainageDescription(description),
      importKey: stableImportKey([
        'qb-cost',
        current.jobNumber,
        transactionNumber,
        date,
        vendor,
        account,
        String(amount),
      ]),
    });
  }

  const projectMap = new Map();
  for (const txn of transactions) {
    let summary = projectMap.get(txn.jobNumber);
    if (!summary) {
      summary = {
        jobNumber: txn.jobNumber,
        qboLabel: txn.qboLabel,
        projectName: txn.projectName,
        laborCost: 0,
        subCost: 0,
        materialCost: 0,
        equipmentCost: 0,
        generalConditionsCost: 0,
        otherCost: 0,
        totalCost: 0,
        transactionCount: 0,
      };
      projectMap.set(txn.jobNumber, summary);
    }
    summary.transactionCount++;
    summary.totalCost += txn.amount;
    switch (txn.costCategory) {
      case 'Labor': summary.laborCost += txn.amount; break;
      case 'Subcontractor': summary.subCost += txn.amount; break;
      case 'Material': summary.materialCost += txn.amount; break;
      case 'Equipment': summary.equipmentCost += txn.amount; break;
      case 'GeneralConditions': summary.generalConditionsCost += txn.amount; break;
      default: summary.otherCost += txn.amount;
    }
  }

  const monthlyMap = new Map();
  for (const txn of transactions) {
    if (txn.costCategory !== 'Labor' || !txn.month) continue;
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
    if ((txn.account ?? '').toLowerCase().includes('union')) row.fringeCost += txn.amount;
    else row.wageCost += txn.amount;
  }

  return {
    meta: {
      company: 'Brighten Builders LLC',
      importedAt: new Date().toISOString(),
      asOfDate: new Date().toISOString().slice(0, 10),
      periodLabel,
      sourceFile: path.basename(filePath),
      projectCount: projectMap.size,
      transactionCount: transactions.length,
    },
    projects: [...projectMap.values()].sort((a, b) => Number(a.jobNumber) - Number(b.jobNumber)),
    monthlyLabor: [...monthlyMap.values()].sort((a, b) =>
      b.month.localeCompare(a.month) || Number(a.jobNumber) - Number(b.jobNumber),
    ),
    transactions,
  };
}
