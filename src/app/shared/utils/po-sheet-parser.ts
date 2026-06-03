import { PO } from '@app/models/types';
import { normalizeJobKey, parseJobLabel } from '@shared/utils/master-sheet-parser';

export interface ParsedPoRow {
  poNumber: string;
  jobIdLabel: string;
  projectNumber: string;
  vendor: string;
  originalAmount: number;
  date?: string;
  itemsPurchased?: string;
  paymentMethod?: string;
  receiptLink?: string;
  notes?: string;
  workOrderNumber?: string;
  enteredByEmail?: string;
  enteredInQuickbooks: boolean;
  sheetTimestamp?: string;
}

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseBool(value: unknown): boolean {
  const s = cellStr(value).toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === '1';
}

function parsePoNumber(value: unknown): string {
  const raw = cellStr(value);
  if (!raw) return '';
  const n = Number(raw);
  if (Number.isFinite(n) && !raw.includes('-')) {
    return String(Math.trunc(n));
  }
  return raw;
}

function parseSheetDate(value: unknown): string | undefined {
  const raw = cellStr(value);
  if (!raw) return undefined;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return raw;
}

/** PO_Log / Purchase Orders 2025 column layout */
export function parsePoSheetRows(rows: string[][]): ParsedPoRow[] {
  if (!rows.length) return [];

  const header = rows[0].map(h => cellStr(h).toLowerCase());
  const poIdx = header.findIndex(h => h.includes('p.o') || h === 'po #' || h === 'po#');
  const jobIdx = header.findIndex(h => h.includes('job'));
  const supplierIdx = header.findIndex(h => h.includes('supplier') || h === 'vendor');
  const amountIdx = header.findIndex(h => h.includes('purchase amount') || h === 'amount');
  const dateIdx = header.findIndex(h => h === 'date');
  const itemsIdx = header.findIndex(h => h.includes('items'));
  const receiptIdx = header.findIndex(h => h.includes('receipt'));
  const paymentIdx = header.findIndex(h => h.includes('payment'));
  const notesIdx = header.findIndex(h => h === 'notes');
  const workOrderIdx = header.findIndex(h => h.includes('work order'));
  const emailIdx = header.findIndex(h => h === 'email');
  const qbIdx = header.findIndex(h => h.includes('entered in qb') || h.includes('quickbooks'));
  const timestampIdx = header.findIndex(h => h === 'timestamp');

  const out: ParsedPoRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const poNumber = parsePoNumber(poIdx >= 0 ? row[poIdx] : row[4]);
    const jobIdLabel = cellStr(jobIdx >= 0 ? row[jobIdx] : row[5]);
    if (!poNumber || !jobIdLabel) continue;

    const dedupeKey = `${poNumber}|${normalizeJobKey(jobIdLabel)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const { projectNumber } = parseJobLabel(jobIdLabel);
    out.push({
      poNumber,
      jobIdLabel,
      projectNumber,
      vendor: cellStr(supplierIdx >= 0 ? row[supplierIdx] : row[6]),
      originalAmount: parseNumber(amountIdx >= 0 ? row[amountIdx] : row[8]),
      date: parseSheetDate(dateIdx >= 0 ? row[dateIdx] : row[3]),
      itemsPurchased: cellStr(itemsIdx >= 0 ? row[itemsIdx] : row[7]) || undefined,
      paymentMethod: cellStr(paymentIdx >= 0 ? row[paymentIdx] : row[10]) || undefined,
      receiptLink: cellStr(receiptIdx >= 0 ? row[receiptIdx] : row[9]) || undefined,
      notes: cellStr(notesIdx >= 0 ? row[notesIdx] : row[11]) || undefined,
      workOrderNumber: cellStr(workOrderIdx >= 0 ? row[workOrderIdx] : row[12]) || undefined,
      enteredByEmail: cellStr(emailIdx >= 0 ? row[emailIdx] : row[1]) || undefined,
      enteredInQuickbooks: parseBool(qbIdx >= 0 ? row[qbIdx] : row[2]),
      sheetTimestamp: cellStr(timestampIdx >= 0 ? row[timestampIdx] : row[0]) || undefined,
    });
  }

  return out;
}

export function poStatusFromSheet(enteredInQuickbooks: boolean): string {
  return enteredInQuickbooks ? 'Entered in QB' : 'Logged';
}

export function parsedPoToFirestore(
  row: ParsedPoRow,
  projectId: string,
  syncedAt: string,
  sheetUrl: string,
  project?: { projectNumber?: string; projectName?: string },
): Partial<PO> {
  return {
    projectId,
    jobNumber: project?.projectNumber ?? row.projectNumber,
    projectName: project?.projectName ?? row.jobIdLabel,
    poNumber: row.poNumber,
    vendor: row.vendor || 'Unknown supplier',
    originalAmount: row.originalAmount,
    status: poStatusFromSheet(row.enteredInQuickbooks),
    itemsPurchased: row.itemsPurchased,
    paymentMethod: row.paymentMethod,
    date: row.date,
    jobIdLabel: row.jobIdLabel,
    receiptLink: row.receiptLink,
    notes: row.notes,
    workOrderNumber: row.workOrderNumber,
    enteredByEmail: row.enteredByEmail,
    enteredInQuickbooks: row.enteredInQuickbooks,
    sheetTimestamp: row.sheetTimestamp,
    poSheetSyncedAt: syncedAt,
    poSheetUrl: sheetUrl,
    source: 'sheet',
  };
}
