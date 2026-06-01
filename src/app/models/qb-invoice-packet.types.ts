export type QbInvoicePacketPaymentStatus = 'open' | 'paid';

export interface QbInvoicePacketRow {
  jobNumber: string;
  projectName: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string;
  amount: number;
  status: string;
  paymentStatus: QbInvoicePacketPaymentStatus;
  /** PDF section job when it differs from invoice-number job (e.g. J212 invoice under job 204 header). */
  headerJobMismatch?: boolean;
  retainage?: boolean;
}

export interface QbInvoicePacketSeed {
  meta: {
    source: string;
    generatedAt: string;
    totalInvoices: number;
    openTotal: number;
    paidTotal: number;
  };
  invoices: QbInvoicePacketRow[];
}

export interface QbInvoicePacketImportResult {
  billingsCreated: number;
  billingsUpdated: number;
  arCreated: number;
  arUpdated: number;
  arClosed: number;
  exceptions: number;
  unmatched: number;
  projectsPatched: number;
}
