import { describe, expect, it } from 'vitest';
import { mapPayAppDetailResponse, mapPayAppsResponse } from './project-pay-app-api.mapper';

describe('project pay app API mapper', () => {
  it('maps pay app decimals, dates, and null values from SQL', () => {
    const [payApp] = mapPayAppsResponse({
      ok: true,
      source: 'sql',
      projectId: 'J158',
      jobNumber: '158',
      items: [
        {
          id: 'pay-1',
          projectId: 'J158',
          jobNumber: '158',
          payAppNumber: 'PA002',
          billingPeriodStart: '2026-05-01T05:00:00.000Z',
          billingPeriodEnd: '2026-05-31T05:00:00.000Z',
          applicationDate: null,
          contractSum: '162265.00',
          netChangeByChangeOrders: '5395.00',
          contractSumToDate: '167660.00',
          totalCompletedStoredToDate: '5765.00',
          retainageAmount: '576.50',
          totalEarnedLessRetainage: '5188.50',
          previousCertificates: '2594.25',
          currentPaymentDue: '2594.25',
          balanceToFinish: '162471.50',
          status: 'Ready',
          notes: 'Imported billing record',
          sovLineCount: '1',
          sourceDocumentId: null,
          createdAt: '2026-06-05T01:03:05.000Z',
        },
      ],
    });

    expect(payApp.billingPeriodStart).toBe('2026-05-01');
    expect(payApp.applicationDate).toBeNull();
    expect(payApp.contractSumToDate).toBe(167660);
    expect(payApp.currentPaymentDue).toBe(2594.25);
    expect(payApp.sovLineCount).toBe(1);
    expect(payApp.sourceDocumentId).toBeNull();
  });

  it('maps invoice-only detail lines without scheduled values', () => {
    const detail = mapPayAppDetailResponse({
      ok: true,
      source: 'sql',
      projectId: 'J209',
      jobNumber: '209',
      item: {
        id: 'invoice-1',
        projectId: 'J209',
        jobNumber: '209',
        payAppNumber: 'INV-100',
        billingPeriodStart: null,
        billingPeriodEnd: null,
        applicationDate: null,
        contractSum: null,
        netChangeByChangeOrders: null,
        contractSumToDate: null,
        totalCompletedStoredToDate: '1200.00',
        retainageAmount: null,
        totalEarnedLessRetainage: '1200.00',
        previousCertificates: null,
        currentPaymentDue: '1200.00',
        balanceToFinish: null,
        status: 'Review',
        notes: 'Invoice-only imported billing record',
        sovLineCount: 1,
        sourceDocumentId: null,
        createdAt: null,
        lines: [
          {
            id: 'line-1',
            payAppId: 'invoice-1',
            projectId: 'J209',
            lineNumber: '1',
            description: 'T&M invoice',
            scheduledValue: null,
            workCompletedPrevious: null,
            workCompletedThisPeriod: '1200.00',
            materialsPresentlyStored: null,
            totalCompletedAndStored: '1200.00',
            percentComplete: null,
            balanceToFinish: null,
            retainage: null,
            costCode: null,
            createdAt: null,
          },
        ],
      },
    });

    expect(detail.contractSum).toBeNull();
    expect(detail.lines[0].scheduledValue).toBeNull();
    expect(detail.lines[0].workCompletedThisPeriod).toBe(1200);
    expect(detail.lines[0].costCode).toBeNull();
  });

  it('preserves retainage release style records as billing data', () => {
    const detail = mapPayAppDetailResponse({
      ok: true,
      source: 'sql',
      projectId: 'J221',
      jobNumber: '221',
      item: {
        id: 'retainage-release',
        projectId: 'J221',
        jobNumber: '221',
        payAppNumber: 'RET-1',
        billingPeriodStart: null,
        billingPeriodEnd: null,
        applicationDate: '2026-05-20',
        contractSum: null,
        netChangeByChangeOrders: null,
        contractSumToDate: null,
        totalCompletedStoredToDate: null,
        retainageAmount: '-500.00',
        totalEarnedLessRetainage: '500.00',
        previousCertificates: null,
        currentPaymentDue: '500.00',
        balanceToFinish: null,
        status: 'Review',
        notes: 'Retainage release record',
        sovLineCount: 0,
        sourceDocumentId: null,
        createdAt: null,
        lines: [],
      },
    });

    expect(detail.retainageAmount).toBe(-500);
    expect(detail.currentPaymentDue).toBe(500);
    expect(detail.status).toBe('Review');
    expect(detail.lines).toEqual([]);
  });
});
