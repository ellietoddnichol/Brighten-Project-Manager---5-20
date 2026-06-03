import { beforeEach, describe, expect, it } from 'vitest';
import { coBillingStatus } from '@features/projects/utils/change-management';
import { ChangeOrder, Billing, Project } from '@app/models/types';

/** Regression: approved CO billing lifecycle through pay app states. */
describe('Pay app CO billing lifecycle regression', () => {
  const project: Project = {
    id: 'proj-1',
    projectNumber: '999',
    projectName: 'Test Job',
    customer: 'Test Customer',
    status: 'Active',
    originalContractAmount: 100000,
  };

  const co: ChangeOrder = {
    id: 'co-1',
    projectId: 'proj-1',
    coNumber: 'CO-01',
    title: 'Test CO',
    status: 'Approved',
    approvedAmount: 1234.56,
    billingStatus: 'Approved',
  };

  let payApp: Billing;

  beforeEach(() => {
    payApp = {
      id: 'pa-1',
      projectId: 'proj-1',
      payAppNumber: 'PA-01',
      billingPeriod: '2026-05',
      status: 'Draft',
      includedChangeOrderIds: [],
      changeOrderIds: [],
      currentApplication: 0,
      workCompletedThisPeriod: 0,
      retainagePercent: 10,
    };
  });

  function simulateIncludeInDraft(coRef: ChangeOrder, pa: Billing): ChangeOrder {
    pa.includedChangeOrderIds = [coRef.id];
    pa.changeOrderIds = [coRef.id];
    pa.currentApplication = 1234.56;
    pa.workCompletedThisPeriod = 1234.56;
    return {
      ...coRef,
      payAppId: pa.id,
      billingStatus: 'IncludedInDraftPayApp',
    };
  }

  function simulateSubmit(coRef: ChangeOrder, pa: Billing): { co: ChangeOrder; pa: Billing } {
    return {
      pa: { ...pa, status: 'Submitted', submittedAt: new Date().toISOString() },
      co: { ...coRef, billingStatus: 'SubmittedForBilling' },
    };
  }

  function simulateInvoiced(coRef: ChangeOrder, pa: Billing): { co: ChangeOrder; pa: Billing } {
    return {
      pa: { ...pa, status: 'Invoiced', invoiceNumber: 'INV-001' },
      co: { ...coRef, billingStatus: 'Billed', dateBilled: '2026-05-21' },
    };
  }

  function simulatePaid(coRef: ChangeOrder, pa: Billing): { co: ChangeOrder; pa: Billing } {
    return {
      pa: { ...pa, status: 'Paid', amountPaid: 1234.56 },
      co: { ...coRef, billingStatus: 'Paid' },
    };
  }

  it('step 1-2: approved CO added to draft → IncludedInDraftPayApp, not Billed', () => {
    const updatedCo = simulateIncludeInDraft(co, payApp);
    expect(updatedCo.billingStatus).toBe('IncludedInDraftPayApp');
    expect(coBillingStatus(updatedCo)).toBe('IncludedInDraftPayApp');
    expect(updatedCo.billingStatus).not.toBe('Billed');
    expect(coBillingStatus(updatedCo)).not.toBe('Billed');
  });

  it('step 3-4: submit pay app → SubmittedForBilling', () => {
    const draftCo = simulateIncludeInDraft(co, payApp);
    const { co: submittedCo, pa: submittedPa } = simulateSubmit(draftCo, payApp);
    expect(submittedPa.status).toBe('Submitted');
    expect(submittedCo.billingStatus).toBe('SubmittedForBilling');
    expect(coBillingStatus(submittedCo)).toBe('SubmittedForBilling');
    expect(submittedCo.billingStatus).not.toBe('Billed');
  });

  it('step 5-6: mark invoiced → Billed', () => {
    const draftCo = simulateIncludeInDraft(co, payApp);
    const { co: submittedCo } = simulateSubmit(draftCo, payApp);
    const { co: billedCo, pa: invoicedPa } = simulateInvoiced(submittedCo, payApp);
    expect(invoicedPa.status).toBe('Invoiced');
    expect(billedCo.billingStatus).toBe('Billed');
    expect(coBillingStatus(billedCo)).toBe('Billed');
  });

  it('step 7-8: mark paid → Paid', () => {
    const draftCo = simulateIncludeInDraft(co, payApp);
    const { co: submittedCo } = simulateSubmit(draftCo, payApp);
    const { co: billedCo } = simulateInvoiced(submittedCo, payApp);
    const { co: paidCo, pa: paidPa } = simulatePaid(billedCo, payApp);
    expect(paidPa.status).toBe('Paid');
    expect(paidCo.billingStatus).toBe('Paid');
    expect(coBillingStatus(paidCo)).toBe('Paid');
  });

  it('full regression chain for $1,234.56 CO', () => {
    let state: ChangeOrder = { ...co, approvedAmount: 1234.56, sellPrice: 1234.56 };
    state = simulateIncludeInDraft(state, payApp);
    expect(coBillingStatus(state)).toBe('IncludedInDraftPayApp');

    ({ co: state } = simulateSubmit(state, payApp));
    expect(coBillingStatus(state)).toBe('SubmittedForBilling');

    ({ co: state } = simulateInvoiced(state, payApp));
    expect(coBillingStatus(state)).toBe('Billed');

    ({ co: state } = simulatePaid(state, payApp));
    expect(coBillingStatus(state)).toBe('Paid');
  });
});
