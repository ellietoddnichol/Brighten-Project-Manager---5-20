/** Phase 3 — project financial controls. */

export type ProjectFinancialStatus = 'Active' | 'Precon' | 'Closeout' | 'Complete' | 'On Hold';
export type FinancialDataSource = 'Manual' | 'App' | 'Seed' | 'QuickBooks' | 'Calculated';

export interface ProjectFinancial {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  originalContractAmount: number;
  approvedChangeOrderAmount: number;
  pendingChangeOrderAmount: number;
  currentContractAmount: number;
  budgetAmount: number;
  estimatedFinalCost: number;
  costToDate: number;
  costToComplete: number;
  earnedRevenue: number;
  billedToDate: number;
  priorBilled: number;
  currentBilling: number;
  retainageHeld: number;
  arBalance: number;
  overUnderBilling: number;
  leftToBill: number;
  forecastGrossProfit: number;
  forecastMargin: number;
  selfPerformedBudget: number;
  subcontractorBudget: number;
  materialBudget: number;
  equipmentBudget: number;
  otherBudget: number;
  selfPerformedCostToDate: number;
  subcontractorCostToDate: number;
  materialCostToDate: number;
  equipmentCostToDate: number;
  otherCostToDate: number;
  status: ProjectFinancialStatus;
  source: FinancialDataSource;
  needsReview: boolean;
  reviewNotes?: string;
  budgetIsEstimated?: boolean;
  budgetBasis?: 'EstimatedFrom20PercentTarget' | 'Workbook' | 'Manual' | 'MissingContract' | 'Imported';
  qboIncomeToDate?: number;
  qboExpenseToDate?: number;
  qboNetIncome?: number;
  updatedAt?: unknown;
  ownerId?: string;
}

export type PayAppStatus = 'Draft' | 'Submitted' | 'Approved' | 'Invoiced' | 'Paid' | 'Revised' | 'Void';

export type PayAppLineType = 'Contract' | 'ChangeOrder' | 'StoredMaterials' | 'Retainage' | 'Other';

export interface PayAppLine {
  id: string;
  payAppId: string;
  projectId: string;
  lineType: PayAppLineType;
  sourceRecordId?: string;
  description?: string;
  scheduledValue?: number;
  previousBilling?: number;
  currentBilling?: number;
  totalCompletedStored?: number;
  percentComplete?: number;
  balanceToFinish?: number;
  retainage?: number;
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

/** Extends legacy Billing — stored in `billings` collection. */
export interface PayApp {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  payAppNumber: string;
  billingPeriod?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  invoiceNumber?: string;
  originalContractAmount?: number;
  approvedChangeOrderAmount?: number;
  currentContractAmount?: number;
  scheduledValue?: number;
  previousApplications?: number;
  currentApplication?: number;
  workCompletedThisPeriod?: number;
  storedMaterials?: number;
  retainagePercent?: number;
  retainageAmount?: number;
  netDue?: number;
  arBalance?: number;
  totalBilledToDate?: number;
  amountPaid?: number;
  paymentDate?: string;
  status: PayAppStatus;
  includedChangeOrderIds?: string[];
  documentIds?: string[];
  signedDocumentId?: string;
  invoiceLink?: string;
  payAppLink?: string;
  changeOrderIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export type PurchaseOrderStatus = 'Draft' | 'Issued' | 'PartiallyInvoiced' | 'Closed' | 'Void';

export type BudgetLineType =
  | 'Labor'
  | 'Material'
  | 'Subcontractor'
  | 'Equipment'
  | 'GeneralConditions'
  | 'Other';

export type BudgetLineSource =
  | 'Manual'
  | 'Seed'
  | 'PO'
  | 'Time'
  | 'QuickBooks'
  | 'Imported'
  | 'Calculated';

export interface EnhancedBudgetLine {
  id: string;
  projectId: string;
  costCode?: string;
  category: string;
  description?: string;
  budgetAmount: number;
  committedAmount: number;
  actualCost: number;
  projectedCost: number;
  costToComplete: number;
  variance: number;
  source: BudgetLineSource;
  type: BudgetLineType;
  isEstimated?: boolean;
  notes?: string;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface EnhancedPurchaseOrder {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  poNumber: string;
  vendor: string;
  description?: string;
  costCode?: string;
  category?: string;
  committedAmount: number;
  approvedAmount?: number;
  invoicedAmount?: number;
  remainingCommitment?: number;
  status: PurchaseOrderStatus;
  linkedChangeOrderId?: string;
  linkedSubmittalId?: string;
  linkedBudgetLineId?: string;
  type?: BudgetLineType;
  documentIds?: string[];
  /** Legacy PO sheet fields */
  originalAmount?: number;
  itemsPurchased?: string;
  notes?: string;
  source?: 'sheet' | 'manual' | 'app';
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export type ArAgingBucket = 'Current' | '1-30' | '31-60' | '61-90' | '90+';
export type ArRecordStatus = 'Open' | 'Paid' | 'PartiallyPaid' | 'Disputed' | 'WrittenOff' | 'Void';
export type ArCollectionStatus =
  | 'NotStarted'
  | 'FollowUpNeeded'
  | 'Contacted'
  | 'PromiseToPay'
  | 'Disputed'
  | 'Escalated'
  | 'Closed';
export type ArSource =
  | 'Manual'
  | 'App'
  | 'PayApp'
  | 'QuickBooks'
  | 'QuickBooksArAging'
  | 'WipForecast'
  | 'Imported'
  | 'Seed';

export type ArWarningTone = 'critical' | 'amber' | 'quiet';

export interface ArWarningChip {
  label: string;
  tone: ArWarningTone;
}

export interface ARRecord {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  customer?: string;
  /** @deprecated use customer */
  customerName?: string;
  invoiceNumber?: string;
  payAppId?: string;
  /** @deprecated use payAppId */
  linkedPayAppId?: string;
  invoiceDate?: string;
  dueDate?: string;
  originalAmount: number;
  paidAmount?: number;
  openBalance: number;
  retainageAmount?: number;
  agingBucket: ArAgingBucket;
  status: ArRecordStatus;
  collectionStatus?: ArCollectionStatus;
  lastContactDate?: string;
  nextFollowUpDate?: string;
  notes?: string;
  source: ArSource;
  sourceRowId?: string;
  currentAmount?: number;
  days1To30?: number;
  days31To60?: number;
  days61To90?: number;
  days90Plus?: number;
  totalOpen?: number;
  nextAction?: string;
  lastSyncedAt?: string;
  updatedAt?: unknown;
  ownerId?: string;
}

export type WipGroup = 'ActiveWIP' | 'UpcomingWIP' | 'CloseoutAR' | 'NeedsReview' | 'ExcludedArchive';
export type WipRecordStatus = 'Active' | 'Precon' | 'Closeout' | 'Complete' | 'On Hold' | 'Archived';
export type WipConfidence = 'Good' | 'Estimated' | 'NeedsSource' | 'NeedsReview' | 'NotApplicable';
export type WipWarningTone = 'critical' | 'amber' | 'quiet';

export interface WipWarningChip {
  label: string;
  tone: WipWarningTone;
}

export interface WIPRecord {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  customer?: string;
  status: WipRecordStatus | string;
  wipGroup: WipGroup;
  /** @deprecated use wipGroup */
  wipCategory?: WipGroup | 'Active' | 'Archive';
  originalContractAmount: number;
  approvedChangeOrderAmount: number;
  pendingChangeOrderAmount: number;
  currentContractAmount: number;
  contractAmount: number;
  budgetAmount: number;
  estimatedFinalCost: number;
  costToDate: number;
  costToComplete: number;
  percentComplete: number;
  earnedRevenue: number;
  billedToDate: number;
  overUnderBilling: number;
  leftToBill: number;
  arBalance: number;
  retainageHeld: number;
  forecastGrossProfit: number;
  forecastMargin: number;
  selfPerformedAmount: number;
  subcontractorAmount: number;
  materialAmount: number;
  equipmentAmount: number;
  otherAmount: number;
  needsReview: boolean;
  reviewNotes?: string;
  reviewFlags?: string[];
  source: FinancialDataSource;
  notes?: string;
  budgetBasisLabel?: string;
  wipConfidence?: WipConfidence;
  warningChips?: WipWarningChip[];
  nextAction?: string;
  lifecycleLabel?: string;
  updatedAt?: unknown;
  ownerId?: string;
}

export type CoBillingStatus =
  | 'Approved'
  | 'IncludedInDraftPayApp'
  | 'SubmittedForBilling'
  | 'Billed'
  | 'Paid';

export type FinancialMetrics = {
  activeWipContractAmount: number;
  billedToDate: number;
  leftToBill: number;
  approvedUnbilledCOAmount: number;
  pendingCOAmount: number;
  arBalance: number;
  arOver30: number;
  forecastGrossProfit: number;
  forecastMargin: number;
  budgetOverrunCount: number;
  payAppsDueCount: number;
  poOverBudgetCount: number;
  closeoutArAmount: number;
};
