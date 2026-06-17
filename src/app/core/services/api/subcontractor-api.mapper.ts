import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorInvoice,
  SubcontractorStatus,
  W9Status,
  InsuranceStatus,
  ProjectSubcontractorStatus,
  ProjectSubComplianceStatus,
  SubcontractorInvoiceStatus,
  LienWaiverStatus,
} from '@app/models/subcontractor.types';
import { SubcontractorApiRow } from './project-api.types';

function pick(row: SubcontractorApiRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapSubcontractorApiRow(row: SubcontractorApiRow): Subcontractor {
  return {
    id: str(pick(row, 'id')) ?? '',
    companyName: str(pick(row, 'company_name', 'name')) ?? 'Unknown',
    trade: str(pick(row, 'trade')),
    contactName: str(pick(row, 'contact_name')),
    phone: str(pick(row, 'phone')),
    email: str(pick(row, 'email')),
    address: str(pick(row, 'address')),
    w9Status: (str(pick(row, 'w9_status')) ?? 'Missing') as W9Status,
    insuranceStatus: (str(pick(row, 'insurance_status')) ?? 'Missing') as InsuranceStatus,
    coiExpirationDate: str(pick(row, 'coi_expiration_date')),
    status: (str(pick(row, 'status')) ?? 'PendingSetup') as SubcontractorStatus,
    vendorClassification: str(pick(row, 'vendor_classification')) as Subcontractor['vendorClassification'],
    source: str(pick(row, 'source')) as Subcontractor['source'],
    seededTotalCost: num(pick(row, 'seeded_total_cost')) || undefined,
    notes: str(pick(row, 'notes')),
    ownerId: str(pick(row, 'owner_id')),
  };
}

export function mapProjectSubcontractorApiRow(row: SubcontractorApiRow): ProjectSubcontractor {
  return {
    id: str(pick(row, 'id')) ?? '',
    projectId: str(pick(row, 'project_id')) ?? '',
    jobNumber: str(pick(row, 'job_number', 'project_job_number')),
    projectName: str(pick(row, 'project_name', 'project_display_name')),
    subcontractorId: str(pick(row, 'subcontractor_id')) ?? '',
    subcontractorName: str(pick(row, 'subcontractor_name', 'company_name')) ?? 'Unknown',
    trade: str(pick(row, 'trade')),
    scopeOfWork: str(pick(row, 'scope_of_work')),
    costCode: str(pick(row, 'cost_code')),
    budgetLineId: str(pick(row, 'budget_line_id')),
    linkedPurchaseOrderId: str(pick(row, 'linked_purchase_order_id')),
    originalCommitmentAmount: num(pick(row, 'original_commitment_amount')),
    approvedChangeOrderAmount: num(pick(row, 'approved_change_order_amount')),
    currentCommitmentAmount: num(pick(row, 'current_commitment_amount')),
    invoicedToDate: num(pick(row, 'invoiced_to_date')),
    paidToDate: num(pick(row, 'paid_to_date')),
    openBalance: num(pick(row, 'open_balance')),
    remainingCommitment: num(pick(row, 'remaining_commitment')),
    retainageHeld: num(pick(row, 'retainage_held')),
    startDate: str(pick(row, 'start_date')),
    finishDate: str(pick(row, 'finish_date')),
    status: (str(pick(row, 'status')) ?? 'Planned') as ProjectSubcontractorStatus,
    complianceStatus: (str(pick(row, 'compliance_status')) ?? 'MissingItems') as ProjectSubComplianceStatus,
    performanceStatus: str(pick(row, 'performance_status')) as ProjectSubcontractor['performanceStatus'],
    complianceOverrideNote: str(pick(row, 'compliance_override_note')),
    importSource: str(pick(row, 'import_source')) as ProjectSubcontractor['importSource'],
    importedCostToDate: num(pick(row, 'imported_cost_to_date')) || undefined,
    notes: str(pick(row, 'notes')),
  };
}

export function mapSubcontractorInvoiceApiRow(row: SubcontractorApiRow): SubcontractorInvoice {
  return {
    id: str(pick(row, 'id')) ?? '',
    projectId: str(pick(row, 'project_id')) ?? '',
    subcontractorId: str(pick(row, 'subcontractor_id')) ?? '',
    projectSubcontractorId: str(pick(row, 'project_subcontractor_id')) ?? '',
    jobNumber: str(pick(row, 'job_number')),
    projectName: str(pick(row, 'project_name')),
    subcontractorName: str(pick(row, 'subcontractor_name')) ?? 'Unknown',
    invoiceNumber: str(pick(row, 'invoice_number')) ?? '',
    invoiceDate: str(pick(row, 'invoice_date')),
    dueDate: str(pick(row, 'due_date')),
    description: str(pick(row, 'description')),
    amount: num(pick(row, 'amount')),
    approvedAmount: num(pick(row, 'approved_amount')),
    paidAmount: num(pick(row, 'paid_amount')),
    openBalance: num(pick(row, 'open_balance')),
    retainagePercent: num(pick(row, 'retainage_percent')),
    retainageAmount: num(pick(row, 'retainage_amount')),
    netDue: num(pick(row, 'net_due')),
    status: (str(pick(row, 'status')) ?? 'Received') as SubcontractorInvoiceStatus,
    paymentDate: str(pick(row, 'payment_date')),
    checkNumber: str(pick(row, 'check_number')),
    lienWaiverStatus: (str(pick(row, 'lien_waiver_status')) ?? 'Needed') as LienWaiverStatus,
    notes: str(pick(row, 'notes')),
  };
}
