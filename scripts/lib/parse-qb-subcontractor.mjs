import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';
import {
  displayVendorName,
  isRetainageDescription,
  parseDate,
  parseJobFromCustomer,
  parseMoney,
  stableImportKey,
} from './import-utils.mjs';

function isPageNoise(line) {
  return !line
    || line.startsWith('Brighten Builders LLC')
    || line.startsWith('Account QuickReport')
    || line.includes('March 8, 2025')
    || line.startsWith('Wednesday,')
    || /^\d+\/\d+$/.test(line)
    || line.startsWith('-- ')
    || line.startsWith('Name Customer')
    || line === 'name'
    || line === 'Distribution'
    || line === 'account'
    || line === 'Transaction'
    || line === 'date'
    || line === 'type'
    || line.startsWith('Num Description');
}

function parseAmountLine(line) {
  const m = line.match(/^([\-\d,]+\.\d{2})\s+([\-\d,]+\.\d{2})$/);
  if (!m) return null;
  return { amount: parseMoney(m[1]), balance: parseMoney(m[2]) };
}

function parseTxnDateLine(line) {
  return line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(Bill|Expense|Check|Credit Card Charge|Vendor Credit)\s*(.*)$/);
}

function cleanLines(rawLines) {
  return rawLines.map(l => l.trim()).filter(l => !isPageNoise(l));
}

function displayVendorFromParts(vendorParts) {
  const vendorRaw = vendorParts.join(' ').trim();
  if (!vendorRaw || /total for/i.test(vendorRaw)) return null;
  const joined = vendorRaw.replace(/\.\./g, '.').replace(/\s+/g, ' ').trim();
  const half = Math.floor(joined.length / 2);
  const firstHalf = joined.slice(0, half).trim();
  const secondHalf = joined.slice(half).trim();
  if (secondHalf && firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
    return displayVendorName(firstHalf);
  }
  return displayVendorName(joined);
}

function parseTransactionAtAmountIndex(lines, amountIdx) {
  const amounts = parseAmountLine(lines[amountIdx]);
  if (!amounts) return null;

  let dateIdx = -1;
  let dateMatch = null;
  const descriptionParts = [];

  for (let i = amountIdx - 1; i >= Math.max(0, amountIdx - 12); i--) {
    const line = lines[i];
    if (line === 'COGS' || line === 'Contract Labor -' || line === '(COGS):Sub' || line === 'Direct Costs') continue;
    const dm = parseTxnDateLine(line);
    if (dm) {
      dateIdx = i;
      dateMatch = dm;
      if (dm[3]?.trim()) descriptionParts.unshift(dm[3].trim());
      break;
    }
    descriptionParts.unshift(line);
  }
  if (!dateMatch) return null;

  for (let i = dateIdx - 1; i >= Math.max(0, dateIdx - 6); i--) {
    const line = lines[i];
    if (['Sub', 'Contract', 'Labor -', 'COGS', 'Payable', '(A/P)', 'Accounts'].includes(line)) continue;
    if (line.startsWith('Direct Costs')) continue;
    if (parseTxnDateLine(line)) break;
    if (parseAmountLine(line)) break;
    descriptionParts.unshift(line);
  }

  let description = descriptionParts.join(' ').replace(/\s+Direct Costs.*$/i, '').trim();
  if (description.endsWith('Direct Costs')) description = description.slice(0, -'Direct Costs'.length).trim();

  let customerStart = -1;
  for (let i = dateIdx - 1; i >= Math.max(0, dateIdx - 20); i--) {
    if (/^\d+\s*-/.test(lines[i])) {
      customerStart = i;
      break;
    }
  }
  if (customerStart < 0) return null;

  const customerParts = [];
  for (let i = customerStart; i < dateIdx; i++) {
    const line = lines[i];
    if (line === 'Payable' || line === '(A/P)' || line === 'Accounts') break;
    if (['Sub', 'Contract', 'Labor -', 'COGS'].includes(line)) break;
    customerParts.push(line.replace(/\s+Accounts\s*$/i, '').trim());
  }
  const customer = customerParts.join(' ').trim();
  if (!/^\d+\s*-/.test(customer)) return null;

  const vendorParts = [];
  for (let i = customerStart - 1; i >= Math.max(0, amountIdx - 30); i--) {
    const line = lines[i];
    if (parseAmountLine(line)) break;
    if (/^\d+\s*-/.test(line)) break;
    if (['Sub', 'Contract', 'Labor -', 'COGS', 'Payable', '(A/P)', 'Accounts'].includes(line)) continue;
    vendorParts.unshift(line);
  }
  const vendorName = displayVendorFromParts(vendorParts);
  if (!vendorName) return null;
  const { jobNumber, projectName } = parseJobFromCustomer(customer);
  const transactionNumber = description.split(/\s+/)[0] || undefined;

  return {
    vendorName,
    normalizedVendorName: vendorName.toLowerCase().replace(/[^a-z0-9]+/g, ''),
    jobNumber,
    projectName,
    customer,
    transactionDate: parseDate(dateMatch[1]),
    transactionType: dateMatch[2],
    transactionNumber,
    description,
    distributionAccount: 'Sub Contract Labor - COGS',
    amount: amounts.amount,
    retainageFlag: isRetainageDescription(description),
    importKey: stableImportKey(['qb-sub', vendorName, jobNumber, dateMatch[1], transactionNumber, String(amounts.amount)]),
  };
}

export async function parseSubcontractorSummaryPdf(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  const text = (await parser.getText()).text;
  await parser.destroy();

  const vendors = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    if (line.startsWith('Name ') || line.startsWith('TOTAL')) continue;
    const match = line.match(/^(.+?)\s+\$?([\d,]+\.\d{2})$/);
    if (!match) continue;
    const companyName = displayVendorName(match[1]);
    vendors.push({
      companyName,
      normalizedName: companyName.toLowerCase().replace(/[^a-z0-9]+/g, ''),
      seededTotalCost: parseMoney(match[2]),
    });
  }

  const total = vendors.reduce((s, v) => s + v.seededTotalCost, 0);
  return {
    meta: {
      sourceFile: filePath.split(/[/\\]/).pop(),
      periodLabel: 'March 8, 2025–March 8, 2026',
      vendorCount: vendors.length,
      totalCost: total,
    },
    vendors,
  };
}

export async function parseSubcontractorDetailPdf(filePath) {
  const parser = new PDFParse({ data: fs.readFileSync(filePath) });
  const lines = cleanLines((await parser.getText()).text.split('\n'));
  await parser.destroy();

  const transactions = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (!parseAmountLine(lines[i])) continue;
    const txn = parseTransactionAtAmountIndex(lines, i);
    if (!txn || !txn.jobNumber || seen.has(txn.importKey)) continue;
    seen.add(txn.importKey);
    transactions.push(txn);
  }

  const projectSubcontractors = new Map();
  for (const txn of transactions) {
    const key = `${txn.normalizedVendorName}|${txn.jobNumber}`;
    let row = projectSubcontractors.get(key);
    if (!row) {
      row = {
        vendorName: txn.vendorName,
        normalizedVendorName: txn.normalizedVendorName,
        jobNumber: txn.jobNumber,
        projectName: txn.projectName,
        customer: txn.customer,
        trade: 'Subcontractor',
        distributionAccount: txn.distributionAccount,
        importedCostToDate: 0,
        invoicedToDate: 0,
        transactionCount: 0,
      };
      projectSubcontractors.set(key, row);
    }
    row.importedCostToDate += txn.amount;
    row.invoicedToDate += txn.amount;
    row.transactionCount++;
  }

  return {
    meta: {
      sourceFile: filePath.split(/[/\\]/).pop(),
      periodLabel: 'March 8, 2025–March 8, 2026',
      transactionCount: transactions.length,
      projectSubcontractorCount: projectSubcontractors.size,
    },
    transactions,
    projectSubcontractors: [...projectSubcontractors.values()],
  };
}
