import type { BudgetLineSource, BudgetLineType } from './financial.types';
import type {
  CertifiedPayrollProjectStatus,
  PayrollComplianceType,
} from './certified-payroll.types';
import type { ChangeOrderStatus } from './project-controls.types';
import type { ProjectProfile } from './project-requirements.types';
import type { NormalizedProjectStatus, ProjectLifecycleGroup, SeedCompletenessStatus } from './project-lifecycle.types';

export type ProjectStatus = 'Lead / Precon' | 'Awarded' | 'Setup Needed' | 'Active' | 'Closeout' | 'Closed';
export type BillingType = 'Lump Sum' | 'T&M' | 'Progress Billing';
export type WipStatus = 'Pre Con' | 'In Progress' | 'Needs Review' | 'Complete' | 'Closed' | 'T&M';

export interface Project {
  id: string;
  projectNumber: string;
  projectName: string;
  customer: string;
  owner?: string;
  architect?: string;
  projectManager?: string;
  superintendent?: string;
  contractType?: string;
  originalContractAmount?: number;
  retainagePercent?: number;
  taxable?: boolean;
  taxExempt?: boolean;
  prevailingWage?: boolean;
  certifiedPayrollRequired?: boolean;
  payrollComplianceType?: PayrollComplianceType;
  wageOrderNumber?: string;
  publicBody?: string;
  contractingAgency?: string;
  primeContractor?: string;
  certifiedPayrollStartDate?: string;
  certifiedPayrollEndDate?: string;
  certifiedPayrollStatus?: CertifiedPayrollProjectStatus;
  kansasRemodelTax?: boolean;
  billingTerms?: string;
  billingType?: BillingType;
  wipStatus?: WipStatus | string;
  county?: string;
  supplier?: string;
  startDate?: string;
  targetCompletionDate?: string;
  address?: string;
  city?: string;
  state?: string;
  scopeSummary?: string;
  requiredDocuments?: string[];
  driveFolderId?: string;
  driveFolderUrl?: string;
  googleSheetId?: string;
  googleSheetUrl?: string;
  status: ProjectStatus;
  /** Drive / document requirements profile — controls which folders are required. */
  projectProfile?: ProjectProfile;

  /** Normalized lifecycle status (computed; may be persisted). */
  projectStatus?: NormalizedProjectStatus;
  projectLifecycleGroup?: ProjectLifecycleGroup;
  includeInProjectsList?: boolean;
  includeInActiveWip?: boolean;
  includeInClosed2026?: boolean;
  includeInArchive?: boolean;
  closedDate?: string;
  fiscalYear?: number;
  has2026Activity?: boolean;
  seedCompletenessStatus?: SeedCompletenessStatus;

  estLaborCost?: number;
  estMaterialCost?: number;
  estSubCost?: number;
  estEquipmentCost?: number;
  estOtherCost?: number;
  actualCostToDate?: number;
  billedToDate?: number;

  /** WIP spreadsheet snapshot fields */
  selfPerformedAmount?: number;
  subcontractorAmount?: number;
  estCostBudget?: number;
  wipPercentComplete?: number;
  earnedRevenue?: number;
  overUnderBilled?: number;
  currentAR?: number;
  wipLeftToBill?: number;
  wipCostToComplete?: number;
  forecastGP?: number;
  forecastMargin?: number;

  /** WIP Forecast workbook (May 2026 billing forecast import) */
  billings2026Ytd?: number;
  contractSource?: string;
  forecastTreatment?: string;
  forecastLowPct?: number;
  forecastBasePct?: number;
  forecastHighPct?: number;
  projected2026Low?: number;
  projected2026Base?: number;
  projected2026High?: number;
  openApIdentified?: number;
  wipForecastNotes?: string;
  wipForecastImportedAt?: string;

  /** WIP manual overrides (Phase 3E) */
  wipGroupOverride?: 'ActiveWIP' | 'UpcomingWIP' | 'CloseoutAR' | 'NeedsReview' | 'ExcludedArchive';
  wipContractOverride?: number;
  wipBudgetOverride?: number;
  wipEstimatedFinalCostOverride?: number;
  wipReviewNotes?: string;

  /** Brighten seed bundle fields (2026-05-21) */
  seedProjectId?: string;
  dashboardGroup?: string;
  includeOnActiveDashboard?: boolean;
  phase?: string;
  currentActivity?: string;
  priority?: string;
  riskLevel?: string;
  seedActionRequired?: string;
  fullContractReference?: number;

  /** Master Data Sheet (read-only sync) */
  masterSheetJobId?: string;
  masterSheetStatus?: string;
  masterSheetUrl?: string;
  masterSheetSyncedAt?: string;
  regularHours?: number;
  overtimeHours?: number;
  doubleTimeHours?: number;
  totalLaborHours?: number;
  lastTimelogDate?: string;
  timelogEntryCount?: number;

  /** Master Time Data sheet (read-only sync) */
  timeDataSheetSyncedAt?: string;
  timeDataSheetUrl?: string;

  /** QuickBooks Online report sync (Projects + WIP by project) */
  qboSyncedAt?: string;
  qboProjectLabel?: string;
  qboProjectsIncome?: number;
  qboProjectsCost?: number;
  qboWipActIncome?: number;
  qboWipActCosts?: number;
  qboWipProfit?: number;
  qboWipDifference?: number;

  /** QBO Project costs detail breakdown (imported report) */
  qboLaborCost?: number;
  qboMaterialCost?: number;
  qboSubCost?: number;
  qboEquipmentCost?: number;
  qboOtherCost?: number;
  qboCostDetailSyncedAt?: string;

  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export const PROJECT_STATUSES: ProjectStatus[] = [
  'Lead / Precon', 'Awarded', 'Setup Needed', 'Active', 'Closeout', 'Closed',
];

export interface Employee {
  id: string;
  name: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  department?: string;
  hoursType?: string;
  payPerHour?: number;
  timeDataSheetSyncedAt?: string;
  timeDataSheetUrl?: string;
  source?: 'sheet' | 'manual';
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface TimeEntry {
  id: string;
  recordId: string;
  projectId?: string;
  workDate?: string;
  employeeName?: string;
  jobIdLabel?: string;
  jobName?: string;
  county?: string;
  classification?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  notes?: string;
  sourceSystem?: string;
  sourceRowId?: string;
  approvalStatus?: string;
  timeDataSheetSyncedAt?: string;
  timeDataSheetUrl?: string;
  source?: 'sheet' | 'manual';
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectBudgetLine {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  costCode?: string;
  category: 'Labor' | 'Materials' | 'Subcontractors' | 'Equipment' | 'Other' | 'General Conditions';
  description?: string;
  type?: BudgetLineType;
  /** @deprecated use budgetAmount */
  originalBudget: number;
  approvedCOBudget: number;
  /** @deprecated use budgetAmount */
  revisedBudget: number;
  budgetAmount?: number;
  committedAmount?: number;
  actualCost: number;
  costToComplete: number;
  projectedCost?: number;
  /** @deprecated use projectedCost */
  projectedFinalCost: number;
  variance: number;
  source?: BudgetLineSource;
  isEstimated?: boolean;
  status?: 'Active' | 'Void';
  notes?: string;
  importSource?: 'job-cost-budget';
  importFile?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface PO {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  poNumber: string;
  vendor: string;
  originalAmount: number;
  committedAmount?: number;
  invoicedAmount?: number;
  status: string;
  costCode?: string;
  category?: string;
  type?: BudgetLineType;
  linkedChangeOrderId?: string;
  linkedSubmittalId?: string;
  linkedBudgetLineId?: string;
  documentIds?: string[];
  issuedAt?: string;
  itemsPurchased?: string;
  paymentMethod?: string;
  date?: string;
  missingPo?: boolean;
  invoiceExceedsPo?: boolean;
  /** Full Job ID label from the PO sheet, e.g. "187 - LVV Sprinkler Damage" */
  jobIdLabel?: string;
  receiptLink?: string;
  notes?: string;
  workOrderNumber?: string;
  enteredByEmail?: string;
  enteredInQuickbooks?: boolean;
  sheetTimestamp?: string;
  poSheetSyncedAt?: string;
  poSheetUrl?: string;
  source?: 'sheet' | 'manual';
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  projectNumber?: string;
  projectName?: string;
  /** @deprecated use changeOrderNumber */
  coNumber: string;
  changeOrderNumber?: string;
  /** @deprecated use sourceChangeRequestId */
  linkedChangeRequestId?: string;
  sourceChangeRequestId?: string;
  title: string;
  type?: string;
  description?: string;
  reason?: string;
  requestedBy?: string;
  customerContact?: string;
  gcContact?: string;
  ownerContact?: string;
  dateIdentified?: string;
  dateCreated?: string;
  /** @deprecated */
  dateSubmitted?: string;
  dateSent?: string;
  dateApproved?: string;
  dateRejected?: string;
  dateBilled?: string;
  status: ChangeOrderStatus;
  /** @deprecated cost-side naming — mirrored in *Amount fields */
  laborCost?: number;
  laborAmount?: number;
  materialCost?: number;
  materialAmount?: number;
  subCost?: number;
  subcontractorAmount?: number;
  equipmentCost?: number;
  equipmentAmount?: number;
  otherCost?: number;
  otherAmount?: number;
  costImpact?: number;
  overheadPercent?: number;
  profitPercent?: number;
  bondInsurancePercent?: number;
  bondAmount?: number;
  taxAmount?: number;
  markupPercent?: number;
  markup?: number;
  sellPrice?: number;
  totalAmount?: number;
  approvedAmount?: number;
  billingStatus?: string;
  coBillingStatus?: string;
  linkedFile?: string;
  generatedDocumentId?: string;
  signedDocumentId?: string;
  payAppId?: string;
  clarifications?: string;
  exclusions?: string;
  backupAttachmentUrls?: string[];
  backupDocumentIds?: string[];
  scheduleImpactDays?: number;
  daysAdded?: number;
  scheduleImpactDescription?: string;
  notes?: string;
  linkedPoId?: string;
  linkedInvoiceId?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  responsiblePerson?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  dueDate?: string;
  status: 'Open' | 'Waiting' | 'Resolved' | 'Closed';
  relatedItem?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface Billing {
  id: string;
  projectId: string;
  payAppNumber: string;
  billingPeriod: string;
  workCompletedThisPeriod?: number;
  storedMaterials?: number;
  retainageAmount?: number;
  totalBilledToDate?: number;
  amountPaid?: number;
  paymentDate?: string;
  arStatus?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Invoiced' | 'Paid' | 'Revised' | 'Void' | 'Past Due';
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  invoiceNumber?: string;
  originalContractAmount?: number;
  approvedChangeOrderAmount?: number;
  currentContractAmount?: number;
  scheduledValue?: number;
  previousApplications?: number;
  currentApplication?: number;
  retainagePercent?: number;
  netDue?: number;
  arBalance?: number;
  includedChangeOrderIds?: string[];
  documentIds?: string[];
  signedDocumentId?: string;
  invoiceLink?: string;
  payAppLink?: string;
  changeOrderIds?: string[];
  submittedAt?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ScheduleMilestone {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  milestoneType: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: 'Not Started' | 'Upcoming' | 'In Progress' | 'Complete' | 'Delayed' | 'Canceled';
  responsiblePerson?: string;
  relatedTaskIds?: string[];
  relatedIssueIds?: string[];
  relatedFileIds?: string[];
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface Document {
  id: string;
  projectId: string;
  type: string;
  status: 'Not Required' | 'Needed' | 'Requested' | 'Received' | 'Submitted' | 'Approved' | 'Expired';
  ownerId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type FolderMatchMethod = 'exact' | 'alias' | 'manual' | 'fallback' | 'missing';
export type FolderMatchConfidence = 'high' | 'medium' | 'low' | 'missing';
export type FolderLinkStatus = 'Linked' | 'Missing' | 'Needs Review' | 'Manual';

export interface ProjectFolder {
  id: string;
  projectId: string;
  folderKey: string;
  /** Display name for Drive folder mapping UI. */
  folderName: string;
  /** Linked Google Drive folder ID. */
  folderId?: string;
  folderUrl?: string;
  /** Human-readable path under the project root. */
  drivePath?: string;
  parentFolderId?: string;
  sortOrder: number;
  isRequired: boolean;
  matchedBy?: FolderMatchMethod;
  confidence?: FolderMatchConfidence;
  needsReview?: boolean;
  linkStatus?: FolderLinkStatus;
  lastScannedAt?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  folderKey?: string;
  fileName: string;
  fileId?: string;
  fileUrl?: string;
  mimeType?: string;
  documentType: string;
  documentStatus: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  workflowType?: string;
  sourceRecordId?: string;
  driveFolderId?: string;
  drivePath?: string;
  fileType?: string;
  saveWarning?: string;
  uploadedBy?: string;
  uploadedAt?: any;
  lastModifiedAt?: any;
  notes?: string;
  ownerId?: string;
  photoCategory?: string;
  takenDate?: string;
  description?: string;
  locationOrArea?: string;
  dailyLogId?: string;
  issueId?: string;
  changeOrderId?: string;
  changeRequestId?: string;
  rfiId?: string;
  submittalId?: string;
  billingId?: string;
  poId?: string;
  projectSubcontractorId?: string;
  subcontractorInvoiceId?: string;
  certifiedPayrollWeekId?: string;
  /** Normalized document category for Files filtering */
  fileCategory?: string;
  /** How the file entered the system */
  sourceType?: string;
  /** Human-readable save location label */
  savedToLabel?: string;
  /** Link to a generated document record when applicable */
  generatedDocumentId?: string;
}

export interface RequiredDocument {
  id: string;
  projectId: string;
  documentType: string;
  required: boolean;
  status: string;
  dueDate?: string;
  receivedDate?: string;
  submittedDate?: string;
  approvedDate?: string;
  expirationDate?: string;
  relatedFileId?: string;
  responsiblePerson?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
  ownerId?: string;
}

export interface ProjectIssue {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'Waiting' | 'Resolved' | 'Closed';
  responsiblePerson?: string;
  dueDate?: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdAt?: any;
  resolvedAt?: any;
  notes?: string;
  ownerId?: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  dueDate?: string;
  status: 'Not Started' | 'In Progress' | 'Waiting' | 'Complete' | 'Canceled';
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  taskGroup?: import('./project-controls.types').ProjectTaskGroup;
  source?: 'manual' | 'system';
  systemTriggerKey?: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdAt?: any;
  completedAt?: any;
  notes?: string;
  ownerId?: string;
}

export interface ActivityFeedItem {
  id: string;
  projectId: string;
  activityType: 'File Added' | 'Issue Created' | 'Task Completed' | 'Change Order Updated' | 'Billing Updated' | 'Milestone Updated' | 'Document Status Updated';
  title: string;
  description?: string;
  relatedRecordType?: string;
  relatedRecordId?: string;
  createdBy?: string;
  createdAt?: any;
}

