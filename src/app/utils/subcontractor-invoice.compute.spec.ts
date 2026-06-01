import {
  buildInvoicePayload,
  computeInvoiceBalances,
  computeRetainage,
  deriveInvoiceStatus,
  invoiceCountsTowardActualCost,
  invoiceExceedsPoCommitment,
  invoiceTaskDescriptors,
  poInvoicedFromSubInvoices,
  rollupProjectSubcontractor,
  subcontractorActualCostFromInvoices,
} from './subcontractor-invoice.compute';
import { PO } from '../models/types';
import { ProjectSubcontractor, SubcontractorInvoice } from '../models/subcontractor.types';

function inv(partial: Partial<SubcontractorInvoice>): SubcontractorInvoice {
  return {
    id: 'inv-1',
    projectId: 'proj-1',
    subcontractorId: 'sub-1',
    subcontractorName: 'ABC Electric',
    projectSubcontractorId: 'ps-1',
    invoiceNumber: 'INV-001',
    amount: 1000,
    approvedAmount: 1000,
    paidAmount: 0,
    openBalance: 1000,
    retainagePercent: 10,
    retainageAmount: 100,
    netDue: 900,
    status: 'Approved',
    lienWaiverStatus: 'Needed',
    ...partial,
  };
}

describe('subcontractor invoice compute', () => {
  it('calculates open balance', () => {
    const b = computeInvoiceBalances(1234.56, 0, 10);
    expect(b.openBalance).toBe(1234.56);
    expect(b.retainageAmount).toBeCloseTo(123.456);
    expect(b.netDue).toBeCloseTo(1111.104);
  });

  it('calculates partial payment status', () => {
    expect(deriveInvoiceStatus(1000, 500, 'Approved')).toBe('PartiallyPaid');
  });

  it('calculates paid status', () => {
    expect(deriveInvoiceStatus(1000, 1000, 'Approved')).toBe('Paid');
  });

  it('calculates retainage', () => {
    expect(computeRetainage(10000, 10)).toBe(1000);
  });

  it('excludes void invoices from actual cost', () => {
    expect(invoiceCountsTowardActualCost(inv({ status: 'Void' }))).toBe(false);
    expect(invoiceCountsTowardActualCost(inv({ status: 'Disputed' }))).toBe(false);
    expect(invoiceCountsTowardActualCost(inv({ status: 'Approved' }))).toBe(true);
  });

  it('rolls up project subcontractor totals', () => {
    const ps: ProjectSubcontractor = {
      id: 'ps-1',
      projectId: 'proj-1',
      subcontractorId: 'sub-1',
      subcontractorName: 'ABC',
      status: 'Active',
      complianceStatus: 'Complete',
      performanceStatus: 'Good',
      currentCommitmentAmount: 5000,
    };
    const rollup = rollupProjectSubcontractor(ps, [
      inv({ id: 'a', approvedAmount: 1000, paidAmount: 500, openBalance: 500, retainageAmount: 100 }),
      inv({ id: 'b', approvedAmount: 2000, paidAmount: 2000, openBalance: 0, status: 'Paid', retainageAmount: 0 }),
    ]);
    expect(rollup.invoicedToDate).toBe(3000);
    expect(rollup.paidToDate).toBe(2500);
    expect(rollup.remainingCommitment).toBe(2000);
  });

  it('creates missing lien waiver task for paid invoice', () => {
    const tasks = invoiceTaskDescriptors(
      inv({ status: 'Paid', lienWaiverStatus: 'Needed' }),
      undefined,
      undefined,
      undefined,
      [],
    );
    expect(tasks.some(t => t.triggerKey.includes('waiver'))).toBe(true);
  });

  it('creates final waiver task', () => {
    const tasks = invoiceTaskDescriptors(
      inv({ status: 'Paid', lienWaiverStatus: 'FinalNeeded' }),
      { id: 'ps-1', projectId: 'p', subcontractorId: 's', subcontractorName: 'X', status: 'FinalWaiverNeeded', complianceStatus: 'Complete', performanceStatus: 'Good' },
      undefined,
      undefined,
      [],
    );
    expect(tasks.some(t => t.triggerKey.includes('final-waiver'))).toBe(true);
  });

  it('creates invoice over PO commitment task', () => {
    const po: PO = {
      id: 'po-1',
      projectId: 'proj-1',
      poNumber: 'PO-001',
      vendor: 'ABC',
      status: 'Issued',
      committedAmount: 1000,
      originalAmount: 1000,
    };
    const tasks = invoiceTaskDescriptors(
      inv({ linkedPurchaseOrderId: 'po-1', approvedAmount: 1500 }),
      undefined,
      po,
      undefined,
      [],
    );
    expect(tasks.some(t => t.triggerKey.includes('over-po'))).toBe(true);
  });

  it('updates PO invoiced amount from invoices', () => {
    expect(poInvoicedFromSubInvoices('po-1', [
      inv({ linkedPurchaseOrderId: 'po-1', approvedAmount: 800 }),
      inv({ id: 'x', linkedPurchaseOrderId: 'po-1', approvedAmount: 200, status: 'Void' }),
    ])).toBe(800);
  });

  it('subcontractor actual cost from approved invoices', () => {
    expect(subcontractorActualCostFromInvoices('proj-1', [
      inv({ approvedAmount: 500 }),
      inv({ id: 'v', approvedAmount: 300, status: 'Void' }),
    ])).toBe(500);
  });

  it('buildInvoicePayload recalculates on payment', () => {
    const built = buildInvoicePayload({ paidAmount: 600, approvedAmount: 1000, retainagePercent: 10 }, inv({}));
    expect(built.status).toBe('PartiallyPaid');
    expect(built.openBalance).toBe(400);
  });
});
