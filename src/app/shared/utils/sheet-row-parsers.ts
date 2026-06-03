import {
  RawBreakdownRow,
  RawChangeLogRow,
  RawInvoicePayAppRow,
  RawMonthlyBillingRow,
  RawProjectRow,
  RawProposalRow,
} from '@app/models/sheet-rows';
import {
  NormalizedBreakdown,
  NormalizedChangeLog,
  NormalizedInvoice,
  NormalizedMonthlyBilling,
  NormalizedProject,
  NormalizedProposal,
  NormalizedWorkbookData,
} from '@app/models/normalized-workbook';
import {
  cellStr,
  findColumnIndex,
  normalizeHeader,
  normalizeProjectNo,
  normalizeStatus,
  parseDate,
  parseMoney,
  pickField,
  rowToRecord,
  slugifyProjectId,
} from '@shared/utils/sheet-normalizers';

function parseHeaderRows(rows: string[][]): { headers: string[]; dataRows: string[][] } {
  if (!rows.length) return { headers: [], dataRows: [] };
  const headers = rows[0].map(h => cellStr(h));
  return { headers, dataRows: rows.slice(1) };
}

function recordsFromRows(rows: string[][]): Record<string, string>[] {
  const { headers, dataRows } = parseHeaderRows(rows);
  if (!headers.length) return [];
  return dataRows
    .filter(row => row.some(cell => cellStr(cell)))
    .map(row => rowToRecord(headers, row));
}

export function parseProjectRows(rows: string[][]): RawProjectRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'projectno', 'job', 'job_no', 'job#', 'project_#', 'project#']),
    projectName: pickField(r, ['project_name', 'projectname', 'name', 'job_name']),
    status: pickField(r, ['status', 'wip_status', 'project_status']),
    customer: pickField(r, ['customer', 'client', 'owner']),
    contractAmount: pickField(r, ['contract', 'contract_amount', 'original_contract', 'revised_contract']),
    originalContract: pickField(r, ['original_contract', 'contract_amount', 'contract']),
    revisedContract: pickField(r, ['revised_contract', 'rev_contract']),
    billedToDate: pickField(r, ['billed', 'billed_to_date', 'billedtodate']),
    openAR: pickField(r, ['open_ar', 'ar', 'current_ar', 'openar']),
    remainingToBill: pickField(r, ['remaining', 'remaining_to_bill', 'left_to_bill', 'lefttobill']),
    leftToBill: pickField(r, ['left_to_bill', 'remaining_to_bill']),
    notes: pickField(r, ['notes', 'note']),
    nextAction: pickField(r, ['next_action', 'nextaction', 'action_required', 'current_activity']),
    currentActivity: pickField(r, ['current_activity', 'activity']),
    address: pickField(r, ['address', 'site_address']),
    projectManager: pickField(r, ['project_manager', 'pm']),
  }));
}

export function parseBreakdownRows(rows: string[][]): RawBreakdownRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'job', 'job_no', 'project#']),
    category: pickField(r, ['category', 'type', 'cost_type']),
    scope: pickField(r, ['scope', 'description', 'line_item']),
    budget: pickField(r, ['budget', 'budget_amount']),
    actual: pickField(r, ['actual', 'actual_cost', 'actual_to_date']),
    forecast: pickField(r, ['forecast', 'projected', 'projected_final']),
    variance: pickField(r, ['variance', 'over_under']),
    status: pickField(r, ['status']),
  }));
}

export function parseChangeLogRows(rows: string[][]): RawChangeLogRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'job', 'job_no']),
    changeNo: pickField(r, ['change_no', 'co_no', 'co#', 'change_#', 'co_number']),
    description: pickField(r, ['description', 'scope']),
    title: pickField(r, ['title', 'name', 'description']),
    status: pickField(r, ['status']),
    submittedAmount: pickField(r, ['submitted_amount', 'submitted', 'amount', 'sell_price']),
    approvedAmount: pickField(r, ['approved_amount', 'approved']),
    billedAmount: pickField(r, ['billed_amount', 'billed']),
    nextStep: pickField(r, ['next_step', 'nextstep', 'next_action']),
    dateSubmitted: pickField(r, ['date_submitted', 'submitted_date']),
    dateApproved: pickField(r, ['date_approved', 'approved_date']),
  }));
}

export function parseInvoiceRows(rows: string[][]): RawInvoicePayAppRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'job', 'job_no']),
    invoiceNo: pickField(r, ['invoice_no', 'invoice_#', 'pay_app', 'pay_app_#', 'invoice']),
    payAppNumber: pickField(r, ['pay_app', 'pay_app_#', 'invoice_no']),
    billingPeriod: pickField(r, ['billing_period', 'period', 'month']),
    period: pickField(r, ['period', 'billing_period']),
    status: pickField(r, ['status', 'payment_status']),
    grossBilled: pickField(r, ['gross_billed', 'billed', 'amount_billed', 'total_billed']),
    totalBilled: pickField(r, ['total_billed', 'gross_billed']),
    retainage: pickField(r, ['retainage', 'retainage_amount']),
    paid: pickField(r, ['paid', 'amount_paid', 'paid_amount']),
    amountPaid: pickField(r, ['amount_paid', 'paid']),
    arBalance: pickField(r, ['ar_balance', 'ar', 'open_ar', 'balance']),
  }));
}

export function parseProposalRows(rows: string[][]): RawProposalRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'job', 'job_no']),
    proposalNo: pickField(r, ['proposal_no', 'proposal_#', 'proposal']),
    description: pickField(r, ['description', 'scope']),
    title: pickField(r, ['title', 'description', 'name']),
    status: pickField(r, ['status']),
    amount: pickField(r, ['amount', 'proposal_amount', 'value']),
    dateSubmitted: pickField(r, ['date_submitted', 'submitted_date']),
  }));
}

export function parseMonthlyBillingRows(rows: string[][]): RawMonthlyBillingRow[] {
  return recordsFromRows(rows).map(r => ({
    projectNo: pickField(r, ['project_no', 'job', 'job_no']),
    month: pickField(r, ['month', 'billing_month', 'period']),
    contractBilling: pickField(r, ['contract_billing', 'contract', 'base_billing']),
    changeBilling: pickField(r, ['change_billing', 'changes', 'co_billing']),
    paidAmount: pickField(r, ['paid_amount', 'paid']),
    arBalance: pickField(r, ['ar_balance', 'ar']),
    forecastBilling: pickField(r, ['forecast_billing', 'forecast']),
  }));
}

export function normalizeWorkbookData(input: {
  projects: RawProjectRow[];
  breakdown: RawBreakdownRow[];
  changes: RawChangeLogRow[];
  invoices: RawInvoicePayAppRow[];
  proposals: RawProposalRow[];
  monthlyBilling: RawMonthlyBillingRow[];
  missingTabs: string[];
  fetchedAt: Date;
}): NormalizedWorkbookData {
  const changes = input.changes.map(normalizeChangeRow).filter(Boolean) as NormalizedChangeLog[];
  const invoices = input.invoices.map(normalizeInvoiceRow).filter(Boolean) as NormalizedInvoice[];
  const breakdown = input.breakdown.map(normalizeBreakdownRow).filter(Boolean) as NormalizedBreakdown[];

  const projects = input.projects
    .map(r => normalizeProjectRow(r, changes, invoices, breakdown))
    .filter(Boolean) as NormalizedProject[];

  const proposals = input.proposals.map(normalizeProposalRow).filter(Boolean) as NormalizedProposal[];
  const monthlyBilling = input.monthlyBilling.map(normalizeMonthlyBillingRow).filter(Boolean) as NormalizedMonthlyBilling[];

  return {
    projects,
    breakdown,
    changes,
    invoices,
    proposals,
    monthlyBilling,
    fetchedAt: input.fetchedAt,
    missingTabs: input.missingTabs,
    source: 'google_sheets',
  };
}

function normalizeProjectRow(
  row: RawProjectRow,
  changes: NormalizedChangeLog[],
  invoices: NormalizedInvoice[],
  breakdown: NormalizedBreakdown[],
): NormalizedProject | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const projectName = cellStr(row.projectName);
  if (!projectNo && !projectName) return null;

  const projectId = slugifyProjectId(projectNo, projectName);
  const displayNo = projectNo || projectId.replace(/^J/, '');

  const projectChanges = changes.filter(c => c.projectId === projectId);
  const projectInvoices = invoices.filter(i => i.projectId === projectId);
  const projectBreakdown = breakdown.filter(b => b.projectId === projectId);

  const originalContract = parseMoney(row.originalContract ?? row.contractAmount);
  const sheetRevised = parseMoney(row.revisedContract);
  const approvedChanges = projectChanges
    .filter(c => normalizeStatus(c.status) === 'Approved')
    .reduce((s, c) => s + c.approvedAmount, 0);
  const pendingChanges = projectChanges
    .filter(c => !['Approved', 'Rejected', 'Void'].includes(normalizeStatus(c.status)))
    .reduce((s, c) => s + (c.submittedAmount || c.approvedAmount), 0);

  const revisedContract = sheetRevised || originalContract + approvedChanges;
  const billedFromInvoices = projectInvoices.reduce((s, i) => s + i.grossBilled, 0);
  const paidFromInvoices = projectInvoices.reduce((s, i) => s + i.paid, 0);
  const billedToDate = parseMoney(row.billedToDate) || billedFromInvoices;
  const openAR = parseMoney(row.openAR) || Math.max(0, billedToDate - paidFromInvoices);
  const remainingToBill = parseMoney(row.remainingToBill ?? row.leftToBill) || Math.max(0, revisedContract - billedToDate);

  const budgetTotal = projectBreakdown.reduce((s, b) => s + b.budget, 0);
  const actualTotal = projectBreakdown.reduce((s, b) => s + b.actual, 0);
  const selfPerformed = projectBreakdown
    .filter(b => /labor|self/i.test(b.category))
    .reduce((s, b) => s + b.actual, 0);
  const subAmount = projectBreakdown
    .filter(b => /sub/i.test(b.category))
    .reduce((s, b) => s + b.actual, 0);
  const materialAmount = projectBreakdown
    .filter(b => /material|vendor/i.test(b.category))
    .reduce((s, b) => s + b.actual, 0);

  return {
    projectId,
    projectNo: displayNo.startsWith('J') ? displayNo : (/^\d+$/.test(displayNo) ? `J${displayNo}` : displayNo),
    projectName: projectName || `Project ${displayNo}`,
    status: normalizeStatus(row.status, 'In Progress'),
    customer: cellStr(row.customer) || undefined,
    address: cellStr(row.address) || undefined,
    projectManager: cellStr(row.projectManager) || undefined,
    originalContract,
    revisedContract,
    billedToDate,
    openAR,
    remainingToBill,
    pendingChanges,
    approvedChanges,
    nextAction: cellStr(row.nextAction ?? row.currentActivity) || undefined,
    notes: cellStr(row.notes) || undefined,
    budgetTotal: budgetTotal || undefined,
    actualTotal: actualTotal || undefined,
    selfPerformedAmount: selfPerformed || undefined,
    subcontractorAmount: subAmount || undefined,
    vendorMaterialAmount: materialAmount || undefined,
    projectedFinalCost: projectBreakdown.reduce((s, b) => s + b.forecast, 0) || undefined,
    variance: budgetTotal ? actualTotal - budgetTotal : undefined,
    source: 'google_sheets',
    updatedAt: new Date(),
  };
}

function normalizeBreakdownRow(row: RawBreakdownRow): NormalizedBreakdown | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const category = cellStr(row.category);
  if (!projectNo || !category) return null;
  const projectId = slugifyProjectId(projectNo);
  const budget = parseMoney(row.budget);
  const actual = parseMoney(row.actual);
  const forecast = parseMoney(row.forecast) || budget;
  const variance = parseMoney(row.variance) || actual - budget;
  return {
    projectId,
    projectNo,
    category,
    scope: cellStr(row.scope) || undefined,
    budget,
    actual,
    forecast,
    variance,
    status: normalizeStatus(row.status, 'Open'),
  };
}

function normalizeChangeRow(row: RawChangeLogRow): NormalizedChangeLog | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const changeNo = cellStr(row.changeNo);
  if (!projectNo || !changeNo) return null;
  const projectId = slugifyProjectId(projectNo);
  const title = cellStr(row.title ?? row.description) || changeNo;
  return {
    id: `${projectId}-${changeNo}`.replace(/\s+/g, '-').toUpperCase(),
    projectId,
    projectNo,
    changeNo,
    title,
    description: cellStr(row.description) || undefined,
    status: normalizeStatus(row.status, 'Submitted'),
    submittedAmount: parseMoney(row.submittedAmount),
    approvedAmount: parseMoney(row.approvedAmount),
    billedAmount: parseMoney(row.billedAmount),
    nextStep: cellStr(row.nextStep) || undefined,
    dateSubmitted: parseDate(row.dateSubmitted),
    dateApproved: parseDate(row.dateApproved),
  };
}

function normalizeInvoiceRow(row: RawInvoicePayAppRow): NormalizedInvoice | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const invoiceNo = cellStr(row.invoiceNo ?? row.payAppNumber);
  if (!projectNo || !invoiceNo) return null;
  const projectId = slugifyProjectId(projectNo);
  const grossBilled = parseMoney(row.grossBilled ?? row.totalBilled);
  const paid = parseMoney(row.paid ?? row.amountPaid);
  const arBalance = parseMoney(row.arBalance) || Math.max(0, grossBilled - paid);
  return {
    id: `${projectId}-${invoiceNo}`.replace(/\s+/g, '-').toUpperCase(),
    projectId,
    projectNo,
    invoiceNo,
    billingPeriod: cellStr(row.billingPeriod ?? row.period),
    status: normalizeStatus(row.status, 'Submitted'),
    grossBilled,
    retainage: parseMoney(row.retainage),
    paid,
    arBalance,
  };
}

function normalizeProposalRow(row: RawProposalRow): NormalizedProposal | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const proposalNo = cellStr(row.proposalNo);
  if (!projectNo || !proposalNo) return null;
  const projectId = slugifyProjectId(projectNo);
  return {
    id: `${projectId}-${proposalNo}`.replace(/\s+/g, '-').toUpperCase(),
    projectId,
    projectNo,
    proposalNo,
    title: cellStr(row.title ?? row.description) || proposalNo,
    status: normalizeStatus(row.status, 'Submitted'),
    amount: parseMoney(row.amount),
    dateSubmitted: parseDate(row.dateSubmitted),
  };
}

function normalizeMonthlyBillingRow(row: RawMonthlyBillingRow): NormalizedMonthlyBilling | null {
  const projectNo = normalizeProjectNo(row.projectNo);
  const month = cellStr(row.month);
  if (!projectNo || !month) return null;
  const projectId = slugifyProjectId(projectNo);
  return {
    projectId,
    projectNo,
    month,
    contractBilling: parseMoney(row.contractBilling),
    changeBilling: parseMoney(row.changeBilling),
    paidAmount: parseMoney(row.paidAmount),
    arBalance: parseMoney(row.arBalance),
    forecastBilling: parseMoney(row.forecastBilling),
  };
}

/** Exported for tests — header row detection. */
export { findColumnIndex, normalizeHeader };
