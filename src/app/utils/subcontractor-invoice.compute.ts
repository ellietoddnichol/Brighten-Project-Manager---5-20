import { PO } from '../models/types';
import {
  LienWaiverStatus,
  ProjectSubcontractor,
  SubcontractorInvoice,
  SubcontractorInvoiceStatus,
} from '../models/subcontractor.types';
import { poCommittedAmount, poInvoicedAmount } from './budget-line.compute';
import { normalizeCoStatus } from './change-management';

export const INVOICE_COST_STATUSES = new Set<SubcontractorInvoiceStatus>([
  'Approved', 'PartiallyPaid', 'Paid',
]);

export function computeRetainage(approvedAmount: number, retainagePercent: number): number {
  return Math.max(0, approvedAmount * (retainagePercent / 100));
}

export function computeInvoiceBalances(
  approvedAmount: number,
  paidAmount: number,
  retainagePercent: number,
): { retainageAmount: number; openBalance: number; netDue: number } {
  const retainageAmount = computeRetainage(approvedAmount, retainagePercent);
  const openBalance = Math.max(0, approvedAmount - paidAmount);
  const netDue = Math.max(0, approvedAmount - retainageAmount - paidAmount);
  return { retainageAmount, openBalance, netDue };
}

export function deriveInvoiceStatus(
  approvedAmount: number,
  paidAmount: number,
  current: SubcontractorInvoiceStatus,
): SubcontractorInvoiceStatus {
  if (current === 'Void' || current === 'Disputed') return current;
  if (current === 'Draft' || current === 'Received' || current === 'UnderReview') return current;
  if (approvedAmount <= 0) return current === 'Approved' ? 'Approved' : current;
  if (paidAmount <= 0) return 'Approved';
  if (paidAmount >= approvedAmount) return 'Paid';
  return 'PartiallyPaid';
}

export function invoiceCountsTowardActualCost(inv: SubcontractorInvoice): boolean {
  if (inv.status === 'Void') return false;
  if (inv.status === 'Disputed') return false;
  return INVOICE_COST_STATUSES.has(inv.status) && inv.approvedAmount > 0;
}

export function subcontractorActualCostFromInvoices(
  projectId: string,
  invoices: SubcontractorInvoice[],
): number {
  return invoices
    .filter(inv => inv.projectId === projectId && invoiceCountsTowardActualCost(inv))
    .reduce((s, inv) => s + inv.approvedAmount, 0);
}

export function subcontractorActualCostForBudgetLine(
  projectId: string,
  budgetLineId: string,
  invoices: SubcontractorInvoice[],
): number {
  return invoices
    .filter(inv =>
      inv.projectId === projectId
      && inv.linkedBudgetLineId === budgetLineId
      && invoiceCountsTowardActualCost(inv),
    )
    .reduce((s, inv) => s + inv.approvedAmount, 0);
}

export interface ProjectSubRollup {
  invoicedToDate: number;
  paidToDate: number;
  openBalance: number;
  retainageHeld: number;
  remainingCommitment: number;
  lienWaiverStatus: LienWaiverStatus;
  linkedInvoiceIds: string[];
}

export function rollupProjectSubcontractor(
  ps: ProjectSubcontractor,
  invoices: SubcontractorInvoice[],
): ProjectSubRollup {
  const scoped = invoices.filter(inv =>
    inv.projectSubcontractorId === ps.id && inv.status !== 'Void',
  );

  const costInvoices = scoped.filter(invoiceCountsTowardActualCost);
  const invoicedToDate = costInvoices.reduce((s, inv) => s + inv.approvedAmount, 0);
  const paidToDate = scoped.reduce((s, inv) => s + (inv.paidAmount ?? 0), 0);
  const openBalance = scoped.reduce((s, inv) => s + (inv.openBalance ?? 0), 0);
  const retainageHeld = scoped.reduce((s, inv) => {
    if (inv.status === 'Paid') return s;
    return s + (inv.retainageAmount ?? 0);
  }, 0);

  const commitment = ps.currentCommitmentAmount ?? 0;
  const remainingCommitment = Math.max(0, commitment - invoicedToDate);

  let lienWaiverStatus: LienWaiverStatus = 'NotRequired';
  const needsWaiver = scoped.some(inv =>
    inv.lienWaiverStatus === 'Needed' && INVOICE_COST_STATUSES.has(inv.status),
  );
  const paidMissing = scoped.some(inv =>
    inv.status === 'Paid' && inv.lienWaiverStatus === 'Needed',
  );
  const finalNeeded = scoped.some(inv => inv.lienWaiverStatus === 'FinalNeeded')
    || (ps.status === 'WorkComplete' || ps.status === 'FinalWaiverNeeded');
  const finalReceived = scoped.some(inv => inv.lienWaiverStatus === 'FinalReceived');

  if (finalReceived) lienWaiverStatus = 'FinalReceived';
  else if (finalNeeded) lienWaiverStatus = 'FinalNeeded';
  else if (paidMissing || needsWaiver) lienWaiverStatus = 'Needed';
  else if (scoped.some(inv => inv.lienWaiverStatus === 'Received')) lienWaiverStatus = 'Received';

  return {
    invoicedToDate,
    paidToDate,
    openBalance,
    retainageHeld,
    remainingCommitment,
    lienWaiverStatus,
    linkedInvoiceIds: scoped.map(inv => inv.id),
  };
}

export function poInvoicedFromSubInvoices(poId: string, invoices: SubcontractorInvoice[]): number {
  return invoices
    .filter(inv => inv.linkedPurchaseOrderId === poId && invoiceCountsTowardActualCost(inv))
    .reduce((s, inv) => s + inv.approvedAmount, 0);
}

export function invoiceExceedsPoCommitment(
  inv: SubcontractorInvoice,
  po: PO | undefined,
  allInvoices: SubcontractorInvoice[],
): boolean {
  if (!po || inv.status === 'Void') return false;
  const committed = poCommittedAmount(po);
  const otherInvoiced = poInvoicedFromSubInvoices(po.id, allInvoices.filter(i => i.id !== inv.id));
  const thisAmount = invoiceCountsTowardActualCost(inv) ? inv.approvedAmount : 0;
  return otherInvoiced + thisAmount > committed;
}

export function isInvoiceOverdue(inv: SubcontractorInvoice, today = new Date()): boolean {
  if (!inv.dueDate) return false;
  if (inv.status === 'Paid' || inv.status === 'Void') return false;
  if (!INVOICE_COST_STATUSES.has(inv.status) && inv.status !== 'UnderReview' && inv.status !== 'Received') return false;
  const due = new Date(`${inv.dueDate.slice(0, 10)}T23:59:59`);
  return due.getTime() < today.getTime() && (inv.openBalance ?? 0) > 0;
}

export interface InvoiceTaskDescriptor {
  triggerKey: string;
  title: string;
  severity: 'warning' | 'error';
}

export function invoiceTaskDescriptors(
  inv: SubcontractorInvoice,
  ps: ProjectSubcontractor | undefined,
  po: PO | undefined,
  changeOrderApproved: boolean | undefined,
  allInvoices: SubcontractorInvoice[],
  today = new Date(),
): InvoiceTaskDescriptor[] {
  if (inv.status === 'Void') return [];

  const tasks: InvoiceTaskDescriptor[] = [];
  const label = inv.invoiceNumber || inv.subcontractorName;

  if (inv.status === 'Received') {
    tasks.push({
      triggerKey: `sub-inv-review-${inv.id}`,
      title: `Review subcontractor invoice ${label}`,
      severity: 'warning',
    });
  }

  if (isInvoiceOverdue(inv, today) && (inv.openBalance ?? 0) > 0) {
    tasks.push({
      triggerKey: `sub-inv-pay-${inv.id}`,
      title: `Pay subcontractor invoice ${label}`,
      severity: 'warning',
    });
  }

  if (inv.status === 'Disputed') {
    tasks.push({
      triggerKey: `sub-inv-dispute-${inv.id}`,
      title: `Resolve disputed subcontractor invoice ${label}`,
      severity: 'error',
    });
  }

  if (inv.status === 'Paid' && inv.lienWaiverStatus === 'Needed') {
    tasks.push({
      triggerKey: `sub-inv-waiver-${inv.id}`,
      title: `Collect lien waiver for invoice ${label}`,
      severity: 'warning',
    });
  }

  if (inv.lienWaiverStatus === 'FinalNeeded' || (ps?.status === 'FinalWaiverNeeded' && inv.status === 'Paid')) {
    tasks.push({
      triggerKey: `sub-inv-final-waiver-${inv.id}`,
      title: `Collect final lien waiver for ${inv.subcontractorName}`,
      severity: 'warning',
    });
  }

  if (invoiceExceedsPoCommitment(inv, po, allInvoices)) {
    tasks.push({
      triggerKey: `sub-inv-over-po-${inv.id}`,
      title: `Review subcontractor invoice over commitment: ${label}`,
      severity: 'error',
    });
  }

  if (inv.linkedChangeOrderId && changeOrderApproved === false) {
    tasks.push({
      triggerKey: `sub-inv-co-warn-${inv.id}`,
      title: `Review invoice tied to unapproved change order: ${label}`,
      severity: 'warning',
    });
  }

  return tasks;
}

export function defaultLienWaiverForApproval(notRequired = false): LienWaiverStatus {
  return notRequired ? 'NotRequired' : 'Needed';
}

export function buildInvoicePayload(
  draft: Partial<SubcontractorInvoice>,
  existing?: SubcontractorInvoice,
): SubcontractorInvoice {
  const approvedAmount = draft.approvedAmount ?? draft.amount ?? existing?.approvedAmount ?? 0;
  const paidAmount = draft.paidAmount ?? existing?.paidAmount ?? 0;
  const retainagePercent = draft.retainagePercent ?? existing?.retainagePercent ?? 0;
  const balances = computeInvoiceBalances(approvedAmount, paidAmount, retainagePercent);
  const status = draft.status ?? existing?.status ?? 'Draft';

  return {
    id: existing?.id ?? draft.id ?? '',
    projectId: draft.projectId ?? existing?.projectId ?? '',
    jobNumber: draft.jobNumber ?? existing?.jobNumber,
    projectName: draft.projectName ?? existing?.projectName,
    subcontractorId: draft.subcontractorId ?? existing?.subcontractorId ?? '',
    subcontractorName: draft.subcontractorName ?? existing?.subcontractorName ?? '',
    projectSubcontractorId: draft.projectSubcontractorId ?? existing?.projectSubcontractorId ?? '',
    linkedPurchaseOrderId: draft.linkedPurchaseOrderId ?? existing?.linkedPurchaseOrderId,
    linkedBudgetLineId: draft.linkedBudgetLineId ?? existing?.linkedBudgetLineId,
    linkedChangeOrderId: draft.linkedChangeOrderId ?? existing?.linkedChangeOrderId,
    invoiceNumber: draft.invoiceNumber ?? existing?.invoiceNumber ?? '',
    invoiceDate: draft.invoiceDate ?? existing?.invoiceDate,
    dueDate: draft.dueDate ?? existing?.dueDate,
    description: draft.description ?? existing?.description,
    amount: draft.amount ?? existing?.amount ?? approvedAmount,
    approvedAmount,
    paidAmount,
    retainagePercent,
    ...balances,
    status: deriveInvoiceStatus(approvedAmount, paidAmount, status),
    paymentDate: draft.paymentDate ?? existing?.paymentDate,
    checkNumber: draft.checkNumber ?? existing?.checkNumber,
    lienWaiverStatus: draft.lienWaiverStatus ?? existing?.lienWaiverStatus ?? 'Needed',
    documentIds: draft.documentIds ?? existing?.documentIds ?? [],
    notes: draft.notes ?? existing?.notes,
  };
}

export function coIsApprovedForInvoice(coId: string | undefined, changeOrders: { id: string; status?: string }[]): boolean | undefined {
  if (!coId) return undefined;
  const co = changeOrders.find(c => c.id === coId);
  if (!co) return undefined;
  const s = normalizeCoStatus(co.status);
  return s === 'Approved' || s === 'Billed';
}
