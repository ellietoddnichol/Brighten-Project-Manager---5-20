export interface BillingSovSummaryRow {
  jobNumber: string;
  projectName?: string;
  payAppNumber: string;
  periodStart?: string;
  periodEnd?: string;
  sourceFileName?: string;
  sourceType?: string;
  originalContract?: number;
  netChangeOrders?: number;
  payAppContractSum?: number;
  appContractOverride?: number | null;
  completedToDate?: number;
  earnedLessRetainage?: number;
  previousCertificates?: number;
  currentDue?: number;
  balanceToFinish?: number;
  retainageToDate?: number;
  currentRetainage?: number;
  retainagePercent?: number;
  percentComplete?: number;
  billingStatus?: string;
  notes?: string;
  sovScheduledTotal?: number;
  sovCompletedTotal?: number;
  contractSovDiff?: number;
  reviewFlag?: string;
  billingType?: string;
  recordType?: 'PayApp' | 'Invoice';
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
}

export interface BillingSovLineRow {
  jobNumber: string;
  projectName?: string;
  payAppNumber?: string;
  lineNumber?: number;
  costCode?: string;
  description?: string;
  scheduledValue?: number;
  previousCompleted?: number;
  thisPeriod?: number;
  storedMaterials?: number;
  totalCompleted?: number;
  percentComplete?: number;
  balanceToFinish?: number;
  retainage?: number;
  categoryGuess?: string;
  sourceFileName?: string;
  confidence?: string;
  reviewNote?: string;
}

export interface BillingSovReviewItem {
  priority?: string;
  jobNumber: string;
  issue: string;
  whyItMatters?: string;
  recommendedBehavior?: string;
}

export interface BillingSovSourceFile {
  sourceFileName: string;
  jobs?: string;
  importedWhat?: string;
  citationNote?: string;
}

export interface BillingSovSeed {
  meta: {
    asOfDate: string;
    sourceFile: string;
    projectCount: number;
    sovLineCount: number;
  };
  billingSummaries: BillingSovSummaryRow[];
  sovLines: BillingSovLineRow[];
  reviewItems: BillingSovReviewItem[];
  sourceFiles: BillingSovSourceFile[];
}

export interface BillingSovImportResult {
  billingsCreated: number;
  billingsUpdated: number;
  sovLinesUpserted: number;
  projectsPatched: number;
  exceptions: number;
  unmatched: number;
}
