import {
  NormalizedChangeLog,
  NormalizedInvoice,
  NormalizedMonthlyBilling,
  NormalizedProject,
  NormalizedProposal,
  NormalizedWorkbookData,
} from '@app/models/normalized-workbook';
import {
  cellStr,
  normalizeProjectNo,
  normalizeStatus,
  parseMoney,
  parseDate,
  rowToRecord,
  slugifyProjectId,
} from '@shared/utils/sheet-normalizers';

export interface PayAppBillingSeed {
  meta?: { sourceFile?: string; generatedAt?: string };
  dashboardKpis?: {
    totalBilled2026?: number;
    openBalance2026?: number;
    invoiceCount?: number;
    projectsWithBilling?: number;
  };
  monthlySummary?: Array<{
    month: string;
    billedAmount?: number;
    openBalance?: number;
    invoiceCount?: number;
  }>;
  projectMonthGrid?: Record<string, unknown>[];
  projectMonthImport?: Record<string, unknown>[];
  invoiceDetail?: Record<string, unknown>[];
  payAppUpdateList?: Record<string, unknown>[];
  no2026Billing?: Record<string, unknown>[];
}

function recordsFromRows(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0].map(h => cellStr(h));
  return rows
    .slice(1)
    .filter(row => row.some(c => cellStr(c)))
    .map(row => rowToRecord(headers, row));
}

function pick(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = rec[key];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return '';
}

function parseProjectLabel(label: string): { projectNo: string; projectName: string } {
  const m = label.match(/^(\d+)\s*-\s*(.+)$/);
  if (m) return { projectNo: m[1], projectName: m[2].trim() };
  return { projectNo: normalizeProjectNo(label), projectName: label };
}

export function normalizePayAppBillingData(input: {
  projectMonthGrid: Record<string, unknown>[];
  invoiceDetail: Record<string, unknown>[];
  projectMonthImport: Record<string, unknown>[];
  payAppUpdateList?: Record<string, unknown>[];
  no2026Billing?: Record<string, unknown>[];
  monthlySummary?: PayAppBillingSeed['monthlySummary'];
  dashboardKpis?: PayAppBillingSeed['dashboardKpis'];
  fetchedAt: Date;
  missingTabs: string[];
}): NormalizedWorkbookData {
  const invoices = input.invoiceDetail.map(normalizeInvoiceFromPayApp).filter(Boolean) as NormalizedInvoice[];
  const monthlyBilling = input.projectMonthImport.map(normalizeMonthlyImportRow).filter(Boolean) as NormalizedMonthlyBilling[];

  const projects = input.projectMonthGrid
    .map(row => normalizeProjectFromGrid(row, invoices, monthlyBilling, input.dashboardKpis))
    .filter(Boolean) as NormalizedProject[];

  return {
    projects,
    breakdown: [],
    changes: [],
    invoices,
    proposals: normalizeProposalsFromNoBilling(input.no2026Billing ?? []),
    monthlyBilling,
    fetchedAt: input.fetchedAt,
    missingTabs: input.missingTabs,
    source: 'google_sheets',
  };
}

export function normalizePayAppBillingFromSeed(seed: PayAppBillingSeed): NormalizedWorkbookData {
  return normalizePayAppBillingData({
    projectMonthGrid: seed.projectMonthGrid ?? [],
    invoiceDetail: seed.invoiceDetail ?? [],
    projectMonthImport: seed.projectMonthImport ?? [],
    payAppUpdateList: seed.payAppUpdateList ?? [],
    no2026Billing: seed.no2026Billing ?? [],
    monthlySummary: seed.monthlySummary?.filter(m => m.month?.includes('2026') && !m.month.includes('Billed')),
    dashboardKpis: seed.dashboardKpis,
    fetchedAt: new Date(seed.meta?.generatedAt ?? Date.now()),
    missingTabs: [],
  });
}

export function parsePayAppSheetRows(tab: string, rows: string[][]): Record<string, unknown>[] {
  return recordsFromRows(rows) as Record<string, unknown>[];
}

function normalizeInvoiceFromPayApp(rec: Record<string, unknown>): NormalizedInvoice | null {
  const jobNo = pick(rec, 'Job #', 'job_#', 'jobnumber');
  const invoiceNo = pick(rec, 'Invoice / Pay App #', 'invoice___pay_app_#', 'invoice_pay_app_#');
  if (!jobNo || !invoiceNo) return null;

  const projectId = slugifyProjectId(jobNo);
  const grossBilled = parseMoney(rec['Billed Amount'] ?? rec['billed_amount']);
  const arBalance = parseMoney(rec['Open Balance'] ?? rec['open_balance']);
  const paid = Math.max(0, grossBilled - arBalance);
  const isRetainage = cellStr(rec['Retainage?'] ?? rec['retainage']).toLowerCase() === 'yes';

  return {
    id: `${projectId}-${invoiceNo}`.replace(/\s+/g, '-').toUpperCase(),
    projectId,
    projectNo: jobNo,
    invoiceNo,
    billingPeriod: pick(rec, 'Month', 'month') || parseDate(rec['Date']) || '',
    status: arBalance > 0 ? 'Past Due' : 'Paid',
    grossBilled,
    retainage: isRetainage ? arBalance : 0,
    paid,
    arBalance,
  };
}

function normalizeMonthlyImportRow(rec: Record<string, unknown>): NormalizedMonthlyBilling | null {
  const projectNo = pick(rec, 'jobNumber', 'Job #', 'job_#') || normalizeProjectNo(String(rec['projectId'] ?? ''));
  const month = pick(rec, 'month', 'Month');
  if (!projectNo || !month) return null;

  return {
    projectId: pick(rec, 'projectId') || slugifyProjectId(projectNo),
    projectNo,
    month,
    contractBilling: parseMoney(rec['billedAmount'] ?? rec['Billed Amount']),
    changeBilling: 0,
    paidAmount: Math.max(0, parseMoney(rec['billedAmount']) - parseMoney(rec['openBalance'])),
    arBalance: parseMoney(rec['openBalance'] ?? rec['Open Balance']),
    forecastBilling: 0,
  };
}

function normalizeProjectFromGrid(
  rec: Record<string, unknown>,
  invoices: NormalizedInvoice[],
  monthlyBilling: NormalizedMonthlyBilling[],
  dashboardKpis?: PayAppBillingSeed['dashboardKpis'],
): NormalizedProject | null {
  const jobNo = pick(rec, 'Job #', 'job_#');
  const projectLabel = pick(rec, 'Project', 'project');
  if (!jobNo && !projectLabel) return null;

  const { projectNo, projectName } = projectLabel
    ? parseProjectLabel(projectLabel)
    : { projectNo: jobNo, projectName: `Project ${jobNo}` };

  const projectId = slugifyProjectId(projectNo, projectName);
  const projectInvoices = invoices.filter(i => i.projectId === projectId);
  const billedToDate = parseMoney(rec['2026 Total Billed'] ?? rec['2026_total_billed']) ||
    projectInvoices.reduce((s, i) => s + i.grossBilled, 0);
  const openAR = parseMoney(rec['Open Balance'] ?? rec['open_balance']) ||
    projectInvoices.reduce((s, i) => s + i.arBalance, 0);

  return {
    projectId,
    projectNo: /^\d+$/.test(projectNo) ? `J${projectNo}` : projectNo,
    projectName,
    status: pick(rec, 'Status', 'status') || 'Unknown',
    customer: pick(rec, 'Customer', 'customer') || undefined,
    originalContract: billedToDate,
    revisedContract: billedToDate,
    billedToDate,
    openAR,
    remainingToBill: 0,
    pendingChanges: 0,
    approvedChanges: 0,
    nextAction: pick(rec, 'Dashboard Group', 'dashboard_group') || undefined,
    notes: pick(rec, 'Source', 'source') || undefined,
    source: 'google_sheets',
    updatedAt: new Date(),
  };
}

function normalizeProposalsFromNoBilling(rows: Record<string, unknown>[]): NormalizedProposal[] {
  return rows.map(rec => {
    const jobNo = pick(rec, 'Job #', 'job_#');
    const projectLabel = pick(rec, 'Project', 'project');
    if (!jobNo) return null;
    const { projectName } = projectLabel ? parseProjectLabel(projectLabel) : { projectName: '' };
    const projectId = slugifyProjectId(jobNo, projectName);
    return {
      id: `NO-BILL-${projectId}`,
      projectId,
      projectNo: jobNo,
      proposalNo: '—',
      title: pick(rec, 'Reason', 'reason') || 'No 2026 billing',
      status: pick(rec, 'Status', 'status') || 'Needs Review',
      amount: 0,
    };
  }).filter(Boolean) as NormalizedProposal[];
}

/** Portfolio KPIs when contract/WIP data isn't on the pay app sheet. */
export function payAppDashboardKpis(
  data: NormalizedWorkbookData,
  seedKpis?: PayAppBillingSeed['dashboardKpis'],
) {
  const billedToDate = seedKpis?.totalBilled2026 ??
    data.projects.reduce((s, p) => s + p.billedToDate, 0);
  const openAR = seedKpis?.openBalance2026 ??
    data.invoices.reduce((s, i) => s + i.arBalance, 0);

  return {
    revisedContract: billedToDate,
    billedToDate,
    openAR,
    leftToBill: 0,
    pendingChangeValue: 0,
    pendingChangeCount: 0,
    approvedChangeValue: 0,
  };
}
