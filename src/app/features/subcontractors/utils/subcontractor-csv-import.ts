import {
  InsuranceStatus,
  SubcontractorStatus,
  VendorClassification,
  W9Status,
} from '@app/models/subcontractor.types';
import { displayCompanyName } from '@shared/utils/vendor-normalizers';
import { parseCsv } from '@shared/utils/csv-parse';

export const SUBCONTRACTOR_CSV_HEADERS = [
  'Company',
  'Trade',
  'Contact',
  'Phone',
  'Email',
  'W9 Status',
  'Insurance Status',
  'Status',
  'Classification',
  'COI Expiration',
  'Address',
  'Notes',
] as const;

export interface SubcontractorCsvRow {
  rowNumber: number;
  companyName: string;
  trade?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  w9Status?: W9Status;
  insuranceStatus?: InsuranceStatus;
  status?: SubcontractorStatus;
  vendorClassification?: VendorClassification;
  coiExpirationDate?: string;
  address?: string;
  notes?: string;
}

export interface SubcontractorCsvParseResult {
  rows: SubcontractorCsvRow[];
  errors: { row: number; message: string }[];
}

const HEADER_ALIASES: Record<string, keyof Omit<SubcontractorCsvRow, 'rowNumber'>> = {
  company: 'companyName',
  companyname: 'companyName',
  subcontractor: 'companyName',
  name: 'companyName',
  vendor: 'companyName',
  trade: 'trade',
  contact: 'contactName',
  contactname: 'contactName',
  phone: 'phone',
  telephone: 'phone',
  email: 'email',
  w9: 'w9Status',
  w9status: 'w9Status',
  insurance: 'insuranceStatus',
  insurancestatus: 'insuranceStatus',
  coi: 'insuranceStatus',
  status: 'status',
  classification: 'vendorClassification',
  vendorclassification: 'vendorClassification',
  type: 'vendorClassification',
  coiexpiration: 'coiExpirationDate',
  coiexp: 'coiExpirationDate',
  coiexpirationdate: 'coiExpirationDate',
  address: 'address',
  notes: 'notes',
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pickEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value?.trim()) return undefined;
  const norm = value.trim().toLowerCase().replace(/[^a-z]+/g, '');
  const hit = allowed.find(v => v.toLowerCase() === norm || v.toLowerCase().replace(/[^a-z]+/g, '') === norm);
  return hit;
}

const W9_VALUES: W9Status[] = ['Missing', 'OnFile', 'Expired', 'NotRequired'];
const INSURANCE_VALUES: InsuranceStatus[] = ['Missing', 'Valid', 'Expired', 'Review'];
const STATUS_VALUES: SubcontractorStatus[] = [
  'PendingSetup', 'Approved', 'MissingCompliance', 'Inactive', 'DoNotUse',
];
const CLASSIFICATION_VALUES: VendorClassification[] = [
  'Subcontractor', 'Supplier', 'Consultant', 'Ignore', 'NeedsReview',
];

function mapW9(raw?: string): W9Status | undefined {
  if (!raw?.trim()) return undefined;
  const norm = raw.trim().toLowerCase();
  if (norm === 'on file' || norm === 'onfile' || norm === 'filed') return 'OnFile';
  if (norm === 'not required' || norm === 'notrequired' || norm === 'n/a') return 'NotRequired';
  return pickEnum(raw, W9_VALUES);
}

function mapInsurance(raw?: string): InsuranceStatus | undefined {
  if (!raw?.trim()) return undefined;
  const norm = raw.trim().toLowerCase();
  if (norm === 'valid' || norm === 'current' || norm === 'active') return 'Valid';
  return pickEnum(raw, INSURANCE_VALUES);
}

function mapStatus(raw?: string): SubcontractorStatus | undefined {
  if (!raw?.trim()) return undefined;
  const norm = raw.trim().toLowerCase().replace(/[^a-z]+/g, '');
  if (norm === 'pendingsetup' || norm === 'pending' || norm === 'setup') return 'PendingSetup';
  if (norm === 'approved' || norm === 'active') return 'Approved';
  if (norm === 'missingcompliance' || norm === 'compliance') return 'MissingCompliance';
  if (norm === 'inactive') return 'Inactive';
  if (norm === 'donotuse' || norm === 'dnu' || norm === 'blocked') return 'DoNotUse';
  return pickEnum(raw, STATUS_VALUES);
}

function mapClassification(raw?: string): VendorClassification | undefined {
  if (!raw?.trim()) return undefined;
  const norm = raw.trim().toLowerCase();
  if (norm === 'sub' || norm === 'subcontractor') return 'Subcontractor';
  if (norm === 'supplier' || norm === 'vendor') return 'Supplier';
  if (norm === 'consultant') return 'Consultant';
  if (norm === 'ignore' || norm === 'skip') return 'Ignore';
  if (norm === 'needs review' || norm === 'review') return 'NeedsReview';
  return pickEnum(raw, CLASSIFICATION_VALUES);
}

export function parseSubcontractorCsv(text: string): SubcontractorCsvParseResult {
  const table = parseCsv(text.replace(/^\uFEFF/, ''));
  const errors: { row: number; message: string }[] = [];
  const rows: SubcontractorCsvRow[] = [];

  if (!table.length) {
    return { rows, errors: [{ row: 0, message: 'CSV is empty.' }] };
  }

  const [headerRow, ...dataRows] = table;
  const columnMap = new Map<number, keyof Omit<SubcontractorCsvRow, 'rowNumber'>>();

  headerRow.forEach((h, idx) => {
    const key = HEADER_ALIASES[normalizeHeader(h)];
    if (key) columnMap.set(idx, key);
  });

  if (![...columnMap.values()].includes('companyName')) {
    return { rows, errors: [{ row: 1, message: 'Missing required "Company" column.' }] };
  }

  dataRows.forEach((cells, i) => {
    const rowNumber = i + 2;
    if (!cells.some(c => c.trim())) return;

    const draft: Partial<SubcontractorCsvRow> = { rowNumber };
    columnMap.forEach((field, colIdx) => {
      const raw = cells[colIdx]?.trim();
      if (!raw) return;
      if (field === 'companyName') draft.companyName = displayCompanyName(raw);
      else if (field === 'w9Status') draft.w9Status = mapW9(raw);
      else if (field === 'insuranceStatus') draft.insuranceStatus = mapInsurance(raw);
      else if (field === 'status') draft.status = mapStatus(raw);
      else if (field === 'vendorClassification') draft.vendorClassification = mapClassification(raw);
      else draft[field] = raw as never;
    });

    if (!draft.companyName?.trim()) {
      errors.push({ row: rowNumber, message: 'Company name is required.' });
      return;
    }

    rows.push(draft as SubcontractorCsvRow);
  });

  return { rows, errors };
}
