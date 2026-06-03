import { Billing } from '@app/models/types';
import { QbInvoicePacketRow } from '@app/models/qb-invoice-packet.types';

const CUSTOMER_ALIASES: Record<string, string> = {
  'bkm contruction llc': 'BKM Construction LLC',
  'bkm construction llc': 'BKM Construction LLC',
};

export function normalizeQbCustomerName(raw: string): string {
  const key = raw.trim().toLowerCase();
  return CUSTOMER_ALIASES[key] ?? raw.trim();
}

export function parseJobFromInvoiceNumber(invoiceNumber: string): string | undefined {
  const match = invoiceNumber.match(/\bJ?(\d{3})\b/i);
  return match?.[1];
}

export function parseUsDateToIso(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const parts = value.trim().split(/[/-]/);
  if (parts.length !== 3) return undefined;
  const [mm, dd, yyyy] = parts;
  if (!mm || !dd || !yyyy) return undefined;
  return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

export function isRetainageInvoice(row: Pick<QbInvoicePacketRow, 'invoiceNumber' | 'status' | 'retainage'>): boolean {
  if (row.retainage) return true;
  const text = `${row.invoiceNumber} ${row.status}`.toLowerCase();
  return text.includes('ret') || text.includes('retainage');
}

export function isOverdueStatus(status: string): boolean {
  return status.toLowerCase().includes('overdue');
}

export function billingStatusForPacketRow(row: QbInvoicePacketRow): Billing['status'] {
  if (row.paymentStatus === 'paid') return 'Paid';
  if (isOverdueStatus(row.status)) return 'Past Due';
  return 'Invoiced';
}

export function invoiceJobMismatch(row: QbInvoicePacketRow): {
  headerJob: string;
  invoiceJob?: string;
  mismatch: boolean;
} {
  const headerJob = row.jobNumber.replace(/^J/i, '');
  const invoiceJob = parseJobFromInvoiceNumber(row.invoiceNumber);
  const mismatch = !!invoiceJob && invoiceJob !== headerJob.replace(/^J/i, '');
  return { headerJob, invoiceJob, mismatch: row.headerJobMismatch ?? mismatch };
}

export function packetImportKey(invoiceNumber: string): string {
  return `qb-invoice-packet|${invoiceNumber.trim().toLowerCase()}`;
}

export function normalizeInvoiceNumber(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
