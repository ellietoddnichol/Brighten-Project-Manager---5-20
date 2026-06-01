export type W9Status = 'Missing' | 'OnFile' | 'Expired' | 'NotRequired';
export type InsuranceStatus = 'Missing' | 'Valid' | 'Expired' | 'Review';
export type SubcontractorStatus = 'PendingSetup' | 'Approved' | 'MissingCompliance' | 'Inactive' | 'DoNotUse';
export type SubcontractorSource = 'Manual' | 'QuickBooksSeed' | 'DriveSeed' | 'QuickBooksSync' | 'DriveDiscovery';
export type VendorClassification = 'Subcontractor' | 'Supplier' | 'Consultant' | 'Ignore' | 'NeedsReview';

export type ProjectSubcontractorStatus =
  | 'Planned'
  | 'PendingContract'
  | 'PendingCompliance'
  | 'ApprovedToStart'
  | 'Active'
  | 'WorkComplete'
  | 'FinalWaiverNeeded'
  | 'Closed'
  | 'HoldIssue';

export type ProjectSubComplianceStatus = 'Complete' | 'MissingItems' | 'ExpiredItems' | 'Review';
export type ProjectSubPerformanceStatus = 'Good' | 'Watch' | 'Issue' | 'DoNotUse';

export type SubcontractorDocumentType =
  | 'W9'
  | 'CertificateOfInsurance'
  | 'WorkersComp'
  | 'GeneralLiability'
  | 'AutoLiability'
  | 'Umbrella'
  | 'SubcontractAgreement'
  | 'LienWaiver'
  | 'FinalLienWaiver'
  | 'SafetyDocs'
  | 'CloseoutDocs'
  | 'Other';

export type SubcontractorDocumentStatus = 'Missing' | 'Valid' | 'Expired' | 'NeedsReview';

export interface Subcontractor {
  id: string;
  companyName: string;
  trade?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  w9Status: W9Status;
  insuranceStatus: InsuranceStatus;
  coiExpirationDate?: string;
  status: SubcontractorStatus;
  source?: SubcontractorSource;
  /** How this vendor is classified after discovery or manual review. */
  vendorClassification?: VendorClassification;
  seededTotalCost?: number;
  notes?: string;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectSubcontractor {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  subcontractorId: string;
  subcontractorName: string;
  trade?: string;
  scopeOfWork?: string;
  costCode?: string;
  budgetLineId?: string;
  linkedPurchaseOrderId?: string;
  linkedChangeOrderIds?: string[];
  linkedSubmittalIds?: string[];
  linkedInvoiceIds?: string[];
  originalCommitmentAmount?: number;
  approvedChangeOrderAmount?: number;
  currentCommitmentAmount?: number;
  invoicedToDate?: number;
  paidToDate?: number;
  openBalance?: number;
  remainingCommitment?: number;
  retainageHeld?: number;
  startDate?: string;
  finishDate?: string;
  status: ProjectSubcontractorStatus;
  complianceStatus: ProjectSubComplianceStatus;
  performanceStatus: ProjectSubPerformanceStatus;
  complianceOverrideNote?: string;
  notes?: string;
  importSource?: 'QuickBooksSeed' | 'DriveSeed' | 'QuickBooksSync' | 'DriveDiscovery';
  importedCostToDate?: number;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SubcontractorDocument {
  id: string;
  subcontractorId: string;
  projectSubcontractorId?: string;
  projectId?: string;
  documentType: SubcontractorDocumentType;
  fileId?: string;
  driveFileId?: string;
  driveFolderId?: string;
  effectiveDate?: string;
  expirationDate?: string;
  status: SubcontractorDocumentStatus;
  notes?: string;
  uploadedAt?: string;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const SUBCONTRACTOR_DOC_TYPES: SubcontractorDocumentType[] = [
  'W9',
  'CertificateOfInsurance',
  'WorkersComp',
  'GeneralLiability',
  'AutoLiability',
  'Umbrella',
  'SubcontractAgreement',
  'LienWaiver',
  'FinalLienWaiver',
  'SafetyDocs',
  'CloseoutDocs',
  'Other',
];

export type SubcontractorInvoiceStatus =
  | 'Draft'
  | 'Received'
  | 'UnderReview'
  | 'Approved'
  | 'PartiallyPaid'
  | 'Paid'
  | 'Disputed'
  | 'Void';

export type LienWaiverStatus =
  | 'NotRequired'
  | 'Needed'
  | 'Received'
  | 'FinalNeeded'
  | 'FinalReceived';

export interface SubcontractorInvoice {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  subcontractorId: string;
  subcontractorName: string;
  projectSubcontractorId: string;
  linkedPurchaseOrderId?: string;
  linkedBudgetLineId?: string;
  linkedChangeOrderId?: string;
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string;
  description?: string;
  amount: number;
  approvedAmount: number;
  paidAmount: number;
  openBalance: number;
  retainagePercent: number;
  retainageAmount: number;
  netDue: number;
  status: SubcontractorInvoiceStatus;
  paymentDate?: string;
  checkNumber?: string;
  lienWaiverStatus: LienWaiverStatus;
  documentIds?: string[];
  notes?: string;
  ownerId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}
