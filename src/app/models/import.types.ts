export type ImportSource =
  | 'QuickBooksSeed'
  | 'QuickBooksSync'
  | 'QuickBooksProjectCostDetail'
  | 'BudgetWorkbook'
  | 'DriveAudit'
  | 'DriveSeed'
  | 'DriveDiscovery'
  | 'MasterSheet'
  | 'TimeDataSheet'
  | 'PoSheet'
  | 'WipForecast'
  | 'Manual';

export type ImportRecordStatus = 'Imported' | 'Matched' | 'NeedsReview' | 'Ignored';

export type ImportExceptionType =
  | 'unmatchedProject'
  | 'unmatchedSubcontractor'
  | 'duplicateVendorName'
  | 'duplicateInvoiceNumber'
  | 'transactionMissingProject'
  | 'transactionMissingCategory'
  | 'retainageReview'
  | 'costCategoryUnclear'
  | 'manualBudgetDiffers'
  | 'coSheetNeedsReview'
  | 'jobNumberConflict'
  | 'blankUpdatedBudget'
  | 'actualCostConflict'
  | 'duplicateDriveFolder'
  | 'budgetParseFailed'
  | 'budgetImportWarning'
  | 'qbSyncWarning'
  | 'qbSyncMissingTab'
  | 'qbCostCategoryUnknown'
  | 'laborDoubleCountRisk'
  | 'possibleDuplicateQbCost'
  | 'importFieldConflict'
  | 'unmappedLaborCode'
  | 'unassignedLaborCode'
  | 'unmatchedVendor'
  | 'manualValueConflict';

export interface ImportException {
  id: string;
  type: ImportExceptionType;
  source: ImportSource;
  jobNumber?: string;
  projectName?: string;
  vendorName?: string;
  sourceFileName?: string;
  message: string;
  status: ImportRecordStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface BudgetImportRun {
  id: string;
  sourceFileName: string;
  jobNumber: string;
  projectId?: string;
  importStatus: 'Imported' | 'ImportedWithWarnings' | 'Failed' | 'NeedsReview';
  importedAt: string;
  recordsCreated: number;
  recordsUpdated: number;
  warnings: string[];
  notes?: string;
}

export interface ProjectBudgetSnapshot {
  id: string;
  projectId?: string;
  jobNumber: string;
  sourceFileName: string;
  sourceSheetName: string;
  snapshotType: 'Original' | 'UpdatedBudget' | 'ChangeBudget' | 'SOV';
  projectName?: string;
  contractAmount?: number;
  thruChangeOrderNumber?: number;
  totalBudget?: number;
  totalActual?: number;
  totalOverrun?: number;
  totalBudgetedHours?: number;
  totalActualHours?: number;
  totalRemainingHours?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubcontractorCostTransaction {
  id: string;
  source: 'QuickBooksSeed' | 'QuickBooksSync';
  vendorName: string;
  subcontractorId?: string;
  projectId?: string;
  jobNumber?: string;
  projectName?: string;
  transactionType?: string;
  transactionDate?: string;
  transactionNumber?: string;
  description?: string;
  distributionAccount?: string;
  amount: number;
  retainageFlag?: boolean;
  linkedProjectSubcontractorId?: string;
  linkedSubcontractorInvoiceId?: string;
  status: ImportRecordStatus;
  importKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectCostCategory =
  | 'Labor'
  | 'Material'
  | 'Subcontractor'
  | 'Equipment'
  | 'GeneralConditions'
  | 'Other';

export interface ProjectCostTransactionRecord {
  id: string;
  source: 'QuickBooksProjectCostDetail';
  projectId?: string;
  jobNumber?: string;
  projectName?: string;
  vendor?: string;
  transactionType?: string;
  transactionDate?: string;
  transactionNumber?: string;
  accountType?: string;
  account?: string;
  className?: string;
  description?: string;
  amount: number;
  costCategory: ProjectCostCategory;
  budgetLineId?: string;
  status: ImportRecordStatus;
  retainageFlag?: boolean;
  importKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImportRunSummary {
  id: string;
  label: string;
  importedAt: string;
  created: number;
  updated: number;
  skipped: number;
  exceptions: number;
  message?: string;
}
