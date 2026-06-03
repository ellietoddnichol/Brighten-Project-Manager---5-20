import { describe, expect, it } from 'vitest';
import {
  billingStatusForPacketRow,
  invoiceJobMismatch,
  isRetainageInvoice,
  normalizeQbCustomerName,
  parseJobFromInvoiceNumber,
  parseUsDateToIso,
} from '@features/financials/utils/qb-invoice-packet.parse';
import { QbInvoicePacketRow } from '@app/models/qb-invoice-packet.types';

describe('qb-invoice-packet.parse', () => {
  it('normalizes BKM customer typo', () => {
    expect(normalizeQbCustomerName('BKM Contruction LLC')).toBe('BKM Construction LLC');
  });

  it('parses job from invoice number', () => {
    expect(parseJobFromInvoiceNumber('J212 - PA004 - April')).toBe('212');
    expect(parseJobFromInvoiceNumber('204 - PA003 - MAR')).toBe('204');
  });

  it('detects header vs invoice job mismatch', () => {
    const row: QbInvoicePacketRow = {
      jobNumber: '204',
      projectName: 'LightEdge',
      customer: 'XEC',
      invoiceNumber: 'J212 - PA004 - April',
      amount: 106936.2,
      status: 'Overdue',
      paymentStatus: 'open',
      headerJobMismatch: true,
    };
    expect(invoiceJobMismatch(row).mismatch).toBe(true);
  });

  it('maps open overdue to Past Due billing status', () => {
    expect(billingStatusForPacketRow({
      jobNumber: '204',
      projectName: 'X',
      customer: 'XEC',
      invoiceNumber: 'A',
      amount: 1,
      status: 'Overdue',
      paymentStatus: 'open',
    })).toBe('Past Due');
  });

  it('maps paid rows to Paid', () => {
    expect(billingStatusForPacketRow({
      jobNumber: '206',
      projectName: 'X',
      customer: 'Lakeview Village',
      invoiceNumber: 'J206-002-March',
      amount: 1,
      status: 'Paid in full',
      paymentStatus: 'paid',
    })).toBe('Paid');
  });

  it('flags retainage invoices', () => {
    expect(isRetainageInvoice({ invoiceNumber: 'J215-PA002-Ret-May', status: 'Open retainage' })).toBe(true);
  });

  it('parses US dates to ISO', () => {
    expect(parseUsDateToIso('05/19/2026')).toBe('2026-05-19');
  });
});
