import { cellStr, normalizeHeader, parseMoney, parseDate, pickField, rowToRecord } from '@shared/utils/sheet-normalizers';
import {
  QuickBooksArAging,
  QuickBooksBillPayment,
  QuickBooksCostCategory,
  QuickBooksCustomerProject,
  QuickBooksIncomeByCustomer,
  QuickBooksInvoiceLine,
  QuickBooksProjectCostTransaction,
  QuickBooksVendorBalance,
} from '@app/models/quickbooks-sync.types';
import { v4 as uuidv4 } from 'uuid';

export function stableQbKey(parts: (string | number | undefined)[]): string {
  return parts.filter(p => p != null && p !== '').join('|').toLowerCase();
}

function pick(rec: Record<string, string>, ...aliases: string[]): string {
  return pickField(rec, aliases);
}

/** Parse job number from QBO customer/project labels and memo text. */
export function parseJobFromLabel(label: string): { jobNumber?: string; projectName?: string } {
  const raw = cellStr(label);
  if (!raw) return {};

  const afterColon = raw.includes(':') ? raw.split(':').slice(-1)[0].trim() : raw;
  const dashMatch = afterColon.match(/^(\d{2,4})\s*-\s*(.+)$/);
  if (dashMatch) {
    return { jobNumber: dashMatch[1], projectName: dashMatch[2].trim() };
  }

  const memoJob = raw.match(/\bJ(\d{2,4})\b/i);
  if (memoJob) return { jobNumber: memoJob[1] };

  const leadingNum = afterColon.match(/^(\d{2,4})\b/);
  if (leadingNum) return { jobNumber: leadingNum[1], projectName: afterColon };

  return {};
}

export function recordsFromSheetRows(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0].map(h => cellStr(h));
  return rows
    .slice(1)
    .filter(row => row.some(c => cellStr(c)))
    .map((row, i) => ({ ...rowToRecord(headers, row), __row: String(i + 2) }));
}

function isParentTotalRow(label: string): boolean {
  const lower = label.toLowerCase();
  return lower === 'total' || lower.startsWith('total ') || lower.includes('grand total');
}

function isQbReportPreamble(label: string): boolean {
  const lower = label.toLowerCase();
  return !label
    || lower === 'customers'
    || lower === 'bill payments'
    || lower === 'invoice details'
    || lower.includes('income by customer')
    || lower.includes('a/r aging')
    || lower.includes('vendor balance')
    || lower.includes('period:')
    || lower.includes('accounting method')
    || lower === 'all dates'
    || lower.includes('aging summary report');
}

/** Locate the real column-header row in a QuickBooks multi-row report export. */
export function findQbTableHeaderRow(
  rows: string[][],
  signatures: readonly (readonly string[])[],
): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const headers = (rows[i] ?? []).map(c => normalizeHeader(c));
    const nonEmpty = headers.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    for (const sig of signatures) {
      const hits = sig.filter(s => {
        const key = normalizeHeader(s);
        return headers.some(h => h === key || h.includes(key) || key.includes(h));
      });
      if (hits.length >= Math.min(2, sig.length)) return i;
    }
  }
  return -1;
}

export function recordsFromQbExportRows(
  rows: string[][],
  headerSignatures: readonly (readonly string[])[],
): Record<string, string>[] {
  const idx = findQbTableHeaderRow(rows, headerSignatures);
  if (idx < 0) return recordsFromSheetRows(rows);
  return recordsFromSheetRows(rows.slice(idx));
}

/** QuickBooks Customers export — job labels appear in columns A/B without a single header row. */
export function parseCustomersReportRows(rows: string[][]): QuickBooksCustomerProject[] {
  const byJob = new Map<string, QuickBooksCustomerProject>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    for (const col of [0, 1]) {
      const label = cellStr(row[col]);
      if (!label || isQbReportPreamble(label)) continue;
      const { jobNumber, projectName } = parseJobFromLabel(label);
      if (!jobNumber) continue;

      const fullName = cellStr(row[1]) || label;
      const importKey = stableQbKey(['customer', jobNumber, fullName]);
      byJob.set(jobNumber, {
        id: uuidv4(),
        jobNumber,
        customerName: projectName || fullName,
        fullName,
        balance: parseMoney(row[12]),
        email: cellStr(row[11]) || undefined,
        sourceRow: i + 1,
        status: 'Imported',
        importKey,
      });
    }
  }

  return [...byJob.values()];
}

function parseCustomersTableRows(records: Record<string, string>[]): QuickBooksCustomerProject[] {
  const out: QuickBooksCustomerProject[] = [];
  for (const rec of records) {
    const customer = pick(rec, 'customer', 'customer_full_name', 'customer_fullname', 'name');
    const fullName = pick(rec, 'customer_full_name', 'customer_fullname', 'customer') || customer;
    if (!customer) continue;

    const { jobNumber, projectName } = parseJobFromLabel(fullName || customer);
    const qboCustomerId = pick(rec, 'customer_id', 'id');
    const importKey = stableQbKey(['customer', qboCustomerId || customer]);

    out.push({
      id: uuidv4(),
      qboCustomerId: qboCustomerId || undefined,
      jobNumber,
      customerName: projectName || customer,
      fullName,
      balance: parseMoney(pick(rec, 'balance')),
      email: pick(rec, 'email') || undefined,
      company: pick(rec, 'company') || undefined,
      sourceRow: Number(rec['__row'] ?? 0),
      status: jobNumber ? 'Imported' : 'NeedsReview',
      importKey,
    });
  }
  return out;
}

export function parseCustomersRows(rows: string[][]): QuickBooksCustomerProject[] {
  const report = parseCustomersReportRows(rows);
  if (report.length) return report;
  const records = recordsFromQbExportRows(rows, [
    ['customer', 'balance'],
    ['customer_full_name', 'email'],
  ]);
  return parseCustomersTableRows(records);
}

/** QuickBooks Income by Customer Summary — hierarchical report (job rows in column A). */
export function parseIncomeByCustomerReportRows(rows: string[][]): QuickBooksIncomeByCustomer[] {
  const out: QuickBooksIncomeByCustomer[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = cellStr(row[0]);
    if (!label || isQbReportPreamble(label) || isParentTotalRow(label)) continue;

    const { jobNumber } = parseJobFromLabel(label);
    if (!jobNumber) continue;

    const income = parseMoney(row[1]);
    const expenses = parseMoney(row[2]);
    const netIncome = parseMoney(row[3]) || (income - expenses);
    if (!income && !expenses && !netIncome) continue;

    out.push({
      id: uuidv4(),
      jobNumber,
      customerLabel: label,
      income,
      expenses,
      netIncome,
      sourceRow: i + 1,
      status: 'Imported',
      importKey: stableQbKey(['income', jobNumber, income, expenses]),
    });
  }

  return out;
}

function parseIncomeByCustomerTableRows(records: Record<string, string>[]): QuickBooksIncomeByCustomer[] {
  const out: QuickBooksIncomeByCustomer[] = [];
  for (const rec of records) {
    const label = pick(rec, 'customer', 'project', 'project_name', 'customer_project', 'name');
    if (!label || isParentTotalRow(label)) continue;

    const { jobNumber } = parseJobFromLabel(label);
    const income = parseMoney(pick(rec, 'income'));
    const expenses = parseMoney(pick(rec, 'expenses', 'expense'));
    const netIncome = parseMoney(pick(rec, 'net_income', 'net income', 'net'));
    if (!income && !expenses && !netIncome) continue;

    out.push({
      id: uuidv4(),
      jobNumber,
      customerLabel: label,
      income,
      expenses,
      netIncome: netIncome || (income - expenses),
      sourceRow: Number(rec['__row'] ?? 0),
      status: jobNumber ? 'Imported' : 'NeedsReview',
      importKey: stableQbKey(['income', jobNumber || label, income, expenses]),
    });
  }
  return out;
}

export function parseIncomeByCustomerRows(rows: string[][]): QuickBooksIncomeByCustomer[] {
  const report = parseIncomeByCustomerReportRows(rows);
  if (report.length) return report;
  const records = recordsFromQbExportRows(rows, [
    ['income', 'expenses', 'net income'],
    ['customer', 'income', 'expenses'],
  ]);
  return parseIncomeByCustomerTableRows(records);
}

export function parseInvoiceDetailRows(rows: string[][]): QuickBooksInvoiceLine[] {
  const records = recordsFromQbExportRows(rows, [
    ['memo', 'item amount line'],
    ['memo/description', 'item amount line'],
    ['line order', 'memo'],
  ]);
  const out: QuickBooksInvoiceLine[] = [];

  for (const rec of records) {
    const memo = pick(rec, 'memo_description', 'memo', 'description');
    const customer = pick(rec, 'customer', 'project', 'name');
    const amount = parseMoney(pick(rec, 'item_amount_line', 'item_amount', 'amount'));
    const ledgerAmount = parseMoney(pick(rec, 'item_ledger_amount', 'ledger_amount'));
    if (!amount && !ledgerAmount) continue;

    const fromMemo = parseJobFromLabel(memo);
    const fromCustomer = parseJobFromLabel(customer);
    const jobNumber = fromMemo.jobNumber ?? fromCustomer.jobNumber;
    const invoiceDate = parseDate(pick(rec, 'date', 'service_date'));
    const paidDate = parseDate(pick(rec, 'paid_date', 'paid date'));

    out.push({
      id: uuidv4(),
      jobNumber,
      invoiceDate,
      paidDate,
      memo: memo || undefined,
      amount: amount || ledgerAmount,
      ledgerAmount: ledgerAmount || amount,
      accountLine: pick(rec, 'account_line', 'account') || undefined,
      splitAccount: pick(rec, 'split_account', 'split') || undefined,
      productService: pick(rec, 'product_service', 'product/service', 'product') || undefined,
      quantity: parseMoney(pick(rec, 'quantity')) || undefined,
      rate: parseMoney(pick(rec, 'rate')) || undefined,
      className: pick(rec, 'class') || undefined,
      sourceRow: Number(rec['__row'] ?? 0),
      status: jobNumber ? 'Imported' : 'NeedsReview',
      importKey: stableQbKey(['inv', jobNumber, invoiceDate, memo, amount || ledgerAmount]),
    });
  }
  return out;
}

/** Parse QuickBooks "A/R Aging Summary Report" export (label in col A, buckets in B–G). */
export function parseArAgingSummaryReportRows(rows: string[][]): QuickBooksArAging[] {
  const out: QuickBooksArAging[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = cellStr(row[0]);
    if (!label) continue;

    const lower = label.toLowerCase();
    if (lower.includes('as of') || lower.includes('accrual basis') || lower.includes('aging summary report')) {
      continue;
    }
    if (label === 'CURRENT' || lower === 'total' || lower.startsWith('total for')) continue;

    const { jobNumber } = parseJobFromLabel(label);
    if (!jobNumber) continue;

    const current = parseMoney(row[1]);
    const days1To30 = parseMoney(row[2]);
    const days31To60 = parseMoney(row[3]);
    const days61To90 = parseMoney(row[4]);
    const days91Plus = parseMoney(row[5]);
    const total = parseMoney(row[6]) || current + days1To30 + days31To60 + days61To90 + days91Plus;
    if (!total) continue;

    out.push({
      id: uuidv4(),
      jobNumber,
      customerLabel: label,
      current,
      days1To30,
      days31To60,
      days61To90,
      days91Plus,
      total,
      sourceRow: i + 1,
      status: 'Imported',
      importKey: stableQbKey(['ar-summary', jobNumber, total]),
    });
  }

  return out;
}

export function parseArAgingRows(rows: string[][]): QuickBooksArAging[] {
  const report = parseArAgingSummaryReportRows(rows);
  if (report.length) return report;

  const records = recordsFromQbExportRows(rows, [
    ['current', '1 - 30', '31 - 60'],
    ['customer', 'current', 'total'],
  ]);
  const out: QuickBooksArAging[] = [];

  for (const rec of records) {
    const label = pick(rec, 'customer', 'project', 'customer_project', 'name');
    if (!label || isParentTotalRow(label)) continue;

    const { jobNumber } = parseJobFromLabel(label);
    const current = parseMoney(pick(rec, 'current'));
    const days1To30 = parseMoney(pick(rec, '1_30', '1_-_30', '1 - 30'));
    const days31To60 = parseMoney(pick(rec, '31_60', '31_-_60', '31 - 60'));
    const days61To90 = parseMoney(pick(rec, '61_90', '61_-_90', '61 - 90'));
    const days91Plus = parseMoney(pick(rec, '91_and_over', '91_and_over', '91 and over', '91+'));
    const total = parseMoney(pick(rec, 'total')) || current + days1To30 + days31To60 + days61To90 + days91Plus;
    if (!total) continue;

    out.push({
      id: uuidv4(),
      jobNumber,
      customerLabel: label,
      current,
      days1To30,
      days31To60,
      days61To90,
      days91Plus,
      total,
      sourceRow: Number(rec['__row'] ?? 0),
      status: jobNumber ? 'Imported' : 'NeedsReview',
      importKey: stableQbKey(['ar', jobNumber || label, total]),
    });
  }
  return out;
}

/** QuickBooks Vendor Balance Summary — vendor name in column A, balance in column B. */
export function parseVendorBalanceReportRows(rows: string[][]): QuickBooksVendorBalance[] {
  const out: QuickBooksVendorBalance[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const vendorName = cellStr(row[0]);
    if (!vendorName || isQbReportPreamble(vendorName) || isParentTotalRow(vendorName)) continue;

    const totalOpenBalance = parseMoney(row[1]);
    if (!totalOpenBalance) continue;

    out.push({
      id: uuidv4(),
      vendorName,
      totalOpenBalance,
      sourceRow: i + 1,
      status: 'Imported',
      importKey: stableQbKey(['vendor-bal', vendorName, totalOpenBalance]),
    });
  }

  return out;
}

export function parseVendorBalanceRows(rows: string[][]): QuickBooksVendorBalance[] {
  const report = parseVendorBalanceReportRows(rows);
  if (report.length) return report;

  const records = recordsFromQbExportRows(rows, [
    ['vendor', 'total'],
    ['vendor', 'balance'],
  ]);
  const out: QuickBooksVendorBalance[] = [];

  for (const rec of records) {
    const vendorName = pick(rec, 'vendor', 'name');
    if (!vendorName || isParentTotalRow(vendorName)) continue;
    const totalOpenBalance = parseMoney(pick(rec, 'total', 'balance', 'open_balance'));
    if (!totalOpenBalance) continue;

    out.push({
      id: uuidv4(),
      vendorName,
      totalOpenBalance,
      sourceRow: Number(rec['__row'] ?? 0),
      status: 'Imported',
      importKey: stableQbKey(['vendor-bal', vendorName, totalOpenBalance]),
    });
  }
  return out;
}

export function parseBillPaymentRows(rows: string[][]): QuickBooksBillPayment[] {
  const records = recordsFromQbExportRows(rows, [
    ['id', 'line.amount'],
    ['id', 'date', 'line.amount'],
  ]);
  const out: QuickBooksBillPayment[] = [];

  for (const rec of records) {
    const amount = parseMoney(pick(rec, 'line_amount', 'line.amount', 'amount'));
    const paymentDate = parseDate(pick(rec, 'date'));
    const qboPaymentId = pick(rec, 'id');
    const linkedTxnId = pick(rec, 'line_linked_txn_txn_id', 'line_linked_txn.txn_id', 'linked_txn_id');
    const linkedTxnType = pick(rec, 'line_linked_txn_txn_type', 'line_linked_txn.txn_type', 'linked_txn_type');
    const vendorName = pick(rec, 'vendor', 'payee', 'name') || undefined;

    if (!amount && !qboPaymentId) continue;

    out.push({
      id: uuidv4(),
      qboPaymentId: qboPaymentId || undefined,
      paymentDate,
      amount,
      linkedTxnId: linkedTxnId || undefined,
      linkedTxnType: linkedTxnType || undefined,
      vendorName,
      sourceRow: Number(rec['__row'] ?? 0),
      status: linkedTxnId ? 'Imported' : 'NeedsReview',
      importKey: stableQbKey(['pay', qboPaymentId, linkedTxnId, amount, paymentDate]),
    });
  }
  return out;
}

export function findSheetTitle(titles: string[], aliases: readonly string[]): string | undefined {
  const normalized = titles.map(t => ({ raw: t, key: normalizeHeader(t) }));
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const exact = normalized.find(n => n.key === key);
    if (exact) return exact.raw;
    const partial = normalized.find(n => n.key.includes(key) || key.includes(n.key));
    if (partial) return partial.raw;
  }
  return undefined;
}

export function isRetainageText(...parts: (string | undefined)[]): boolean {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  return /\bret\b/.test(text) || text.includes('retention') || text.includes('retainage');
}

export function classifyQbCostCategory(
  account?: string,
  category?: string,
  productService?: string,
): QuickBooksCostCategory {
  const text = [account, category, productService].filter(Boolean).join(' ').toLowerCase();
  if (!text.trim()) return 'Other';
  if (text.includes('sub contract') || text.includes('subcontract') || /\bsub\b/.test(text)) {
    return 'Subcontractor';
  }
  if (text.includes('material') || text.includes('supplies') || text.includes('cost of goods sold')) {
    return 'Material';
  }
  if (text.includes('equipment') || text.includes('rental')) return 'Equipment';
  if (text.includes('labor') || text.includes('payroll') || text.includes('wages') || text.includes('union benefits')) {
    return 'Labor';
  }
  if (text.includes('supervision') || text.includes('general condition') || text.includes('permits') || text.includes('insurance') || text.includes('preconstruction')) {
    return 'GeneralConditions';
  }
  return 'Other';
}

export function parseQuickBooksProjectCostDetailRows(
  rows: string[][],
  sourceTabName: string,
): QuickBooksProjectCostTransaction[] {
  const records = recordsFromQbExportRows(rows, [
    ['date', 'amount'],
    ['transaction date', 'amount'],
    ['vendor', 'customer', 'amount'],
    ['date', 'vendor', 'amount'],
  ]);
  const out: QuickBooksProjectCostTransaction[] = [];
  const seenKeys = new Set<string>();

  for (const rec of records) {
    const customer = pick(rec, 'customer', 'customer_project', 'customer_project_name', 'project');
    const jobField = pick(rec, 'job', 'job_number', 'job_#');
    const memo = pick(rec, 'memo', 'description');
    const txnNum = pick(rec, 'num', 'transaction_number', 'transaction_#', 'no');
    const amount = parseMoney(pick(rec, 'amount'));
    const transactionDate = parseDate(pick(rec, 'transaction_date', 'date'));
    const vendorName = pick(rec, 'vendor', 'name', 'payee') || undefined;

    if (!amount && amount !== 0) continue;

    const fromCustomer = parseJobFromLabel(customer);
    const fromJob = parseJobFromLabel(jobField);
    const fromMemo = parseJobFromLabel(memo);
    const fromNum = parseJobFromLabel(txnNum);
    const jobNumber = fromJob.jobNumber ?? fromCustomer.jobNumber ?? fromMemo.jobNumber ?? fromNum.jobNumber;

    const account = pick(rec, 'account', 'account_line', 'distribution_account') || undefined;
    const category = pick(rec, 'category') || undefined;
    const productService = pick(rec, 'product_service', 'product/service', 'product') || undefined;
    const costCategory = classifyQbCostCategory(account, category, productService);
    const retainageFlag = isRetainageText(memo, account, category, pick(rec, 'description'));

    const sourceRow = Number(rec['__row'] ?? 0);
    const importKey = stableQbKey([
      sourceTabName,
      sourceRow,
      txnNum,
      vendorName,
      transactionDate,
      amount,
      jobNumber,
    ]);

    let status: QuickBooksProjectCostTransaction['status'] = 'Imported';
    if (!transactionDate) status = 'NeedsReview';
    if (!jobNumber) status = 'NeedsReview';
    if (costCategory === 'Other' && !account && !category) status = 'NeedsReview';
    if (seenKeys.has(importKey)) status = 'NeedsReview';
    seenKeys.add(importKey);

    const includeInWipActuals = costCategory !== 'Labor';

    out.push({
      id: uuidv4(),
      source: 'QuickBooksProjectCostDetail',
      sourceTabName,
      qboTransactionId: pick(rec, 'id', 'transaction_id') || undefined,
      jobNumber,
      projectName: fromCustomer.projectName ?? fromJob.projectName,
      vendorName,
      transactionType: pick(rec, 'transaction_type', 'type') || undefined,
      transactionDate,
      transactionNumber: txnNum || undefined,
      account,
      category,
      productService,
      className: pick(rec, 'class') || undefined,
      memo: memo || undefined,
      description: pick(rec, 'description') || undefined,
      amount,
      openBalance: parseMoney(pick(rec, 'open_balance')) || undefined,
      paidStatus: pick(rec, 'paid_status', 'paid') || undefined,
      cleared: pick(rec, 'cleared') || undefined,
      costCategory,
      retainageFlag,
      includeInWipActuals,
      status,
      sourceRow,
      importKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return out;
}
