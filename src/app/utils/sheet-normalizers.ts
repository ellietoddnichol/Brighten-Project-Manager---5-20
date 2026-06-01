import { ChangeOrder, Billing, Project, ProjectStatus } from '../models/types';
import {
  NormalizedBreakdown,
  NormalizedChangeLog,
  NormalizedInvoice,
  NormalizedMonthlyBilling,
  NormalizedProject,
  NormalizedProposal,
  NormalizedWorkbookData,
} from '../models/normalized-workbook';

export function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function parseMoney(value: unknown): number {
  if (value == null || value === '') return 0;
  const raw = String(value).trim();
  if (!raw || raw === '-' || raw === '—') return 0;
  const negative = raw.includes('(') && raw.includes(')');
  const n = Number(raw.replace(/[$,\s()]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parseNumber(value: unknown): number {
  return parseMoney(value);
}

export function parseDate(value: unknown): string | undefined {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return raw;
}

export function parseBool(value: unknown): boolean {
  const s = cellStr(value).toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

export function normalizeProjectNo(value: unknown): string {
  const raw = cellStr(value);
  if (!raw) return '';
  const cleaned = raw.replace(/^project\s*#?\s*/i, '').replace(/^job\s*#?\s*/i, '').replace(/^#/, '').trim();
  const num = Number(cleaned);
  if (Number.isFinite(num) && !cleaned.includes('-')) {
    return String(Math.trunc(num));
  }
  return cleaned.toUpperCase().startsWith('J') ? cleaned.toUpperCase() : cleaned;
}

export function slugifyProjectId(projectNo: string, projectName?: string): string {
  const no = normalizeProjectNo(projectNo);
  if (!no) return slugify(projectName || 'unknown');
  if (/^\d+$/.test(no)) return `J${no}`;
  if (/^J\d+$/i.test(no)) return no.toUpperCase();
  return no.replace(/\s+/g, '-').toUpperCase();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
}

const STATUS_MAP: Record<string, string> = {
  'in progress': 'In Progress',
  'in-progress': 'In Progress',
  active: 'Active',
  complete: 'Complete',
  completed: 'Complete',
  closed: 'Closed',
  'needs review': 'Needs Review',
  pending: 'Pending',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  paid: 'Paid',
  'past due': 'Past Due',
  draft: 'Draft',
  pricing: 'Need Pricing',
  'need pricing': 'Need Pricing',
  accepted: 'Approved',
  void: 'Void',
};

export function normalizeStatus(value: unknown, fallback = 'Unknown'): string {
  const raw = cellStr(value);
  if (!raw) return fallback;
  const key = raw.toLowerCase();
  return STATUS_MAP[key] ?? raw.replace(/\b\w/g, c => c.toUpperCase());
}

export function normalizeChangeOrderStatus(value: unknown): ChangeOrder['status'] {
  const s = normalizeStatus(value, 'Submitted');
  if (s === 'Pending') return 'Submitted';
  if (s === 'Pricing' || s === 'Need Pricing') return 'Need Pricing';
  if (s === 'In Review') return 'Internal Review';
  const allowed: ChangeOrder['status'][] = ['Draft', 'Internal Review', 'Submitted', 'Approved', 'Rejected', 'Need Pricing', 'Void'];
  return allowed.includes(s as ChangeOrder['status']) ? (s as ChangeOrder['status']) : 'Submitted';
}

export function normalizeInvoiceStatus(value: unknown): Billing['status'] {
  const s = normalizeStatus(value, 'Submitted');
  const allowed: Billing['status'][] = ['Draft', 'Submitted', 'Approved', 'Paid', 'Past Due'];
  return allowed.includes(s as Billing['status']) ? (s as Billing['status']) : 'Submitted';
}

export function normalizeHeader(value: unknown): string {
  return cellStr(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Find column index by matching header aliases. */
export function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex(h => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (key) out[key] = cellStr(row[i]);
  });
  return out;
}

export function pickField(record: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (record[key]) return record[key];
    const match = Object.entries(record).find(([k]) => k.includes(key) || key.includes(k));
    if (match?.[1]) return match[1];
  }
  return '';
}

export function mapToProjectStatus(status: string): ProjectStatus {
  const s = status.toLowerCase();
  if (s.includes('closed')) return 'Closed';
  if (s.includes('closeout')) return 'Closeout';
  if (s.includes('active') || s.includes('progress')) return 'Active';
  if (s.includes('award')) return 'Awarded';
  if (s.includes('lead') || s.includes('precon')) return 'Lead / Precon';
  if (s.includes('setup')) return 'Setup Needed';
  return 'Active';
}

export function normalizedProjectToProject(p: NormalizedProject): Project {
  return {
    id: p.projectId,
    projectNumber: p.projectNo.replace(/^J/i, ''),
    projectName: p.projectName,
    customer: p.customer ?? '',
    address: p.address,
    projectManager: p.projectManager,
    status: mapToProjectStatus(p.status),
    wipStatus: p.status,
    originalContractAmount: p.originalContract,
    billedToDate: p.billedToDate,
    currentAR: p.openAR,
    wipLeftToBill: p.remainingToBill,
    estCostBudget: p.budgetTotal,
    actualCostToDate: p.actualTotal,
    selfPerformedAmount: p.selfPerformedAmount,
    subcontractorAmount: p.subcontractorAmount,
    estMaterialCost: p.vendorMaterialAmount,
    currentActivity: p.nextAction,
    seedActionRequired: p.nextAction,
  };
}

export function normalizedChangeToChangeOrder(c: NormalizedChangeLog): ChangeOrder {
  return {
    id: c.id,
    projectId: c.projectId,
    coNumber: c.changeNo,
    title: c.title,
    description: c.description,
    status: normalizeChangeOrderStatus(c.status),
    sellPrice: c.submittedAmount || c.approvedAmount,
    approvedAmount: c.approvedAmount,
    dateSubmitted: c.dateSubmitted,
    dateApproved: c.dateApproved,
    notes: c.nextStep,
  };
}

export function normalizedInvoiceToBilling(i: NormalizedInvoice): Billing {
  return {
    id: i.id,
    projectId: i.projectId,
    payAppNumber: i.invoiceNo,
    billingPeriod: i.billingPeriod,
    status: normalizeInvoiceStatus(i.status),
    workCompletedThisPeriod: i.grossBilled,
    totalBilledToDate: i.grossBilled,
    retainageAmount: i.retainage,
    amountPaid: i.paid,
    arStatus: i.arBalance > 0 ? 'Open' : 'Closed',
  };
}

export function workbookToLegacyCollections(data: NormalizedWorkbookData): {
  projects: Project[];
  changeOrders: ChangeOrder[];
  billings: Billing[];
} {
  return {
    projects: data.projects.map(normalizedProjectToProject),
    changeOrders: data.changes.map(normalizedChangeToChangeOrder),
    billings: data.invoices.map(normalizedInvoiceToBilling),
  };
}

export type { NormalizedBreakdown, NormalizedChangeLog, NormalizedInvoice, NormalizedMonthlyBilling, NormalizedProject, NormalizedProposal };
