export interface NormalizedProject {
  projectId: string;
  projectNo: string;
  projectName: string;
  status: string;
  customer?: string;
  address?: string;
  projectManager?: string;
  originalContract: number;
  revisedContract: number;
  billedToDate: number;
  openAR: number;
  remainingToBill: number;
  pendingChanges: number;
  approvedChanges: number;
  nextAction?: string;
  notes?: string;
  budgetTotal?: number;
  actualTotal?: number;
  selfPerformedAmount?: number;
  subcontractorAmount?: number;
  vendorMaterialAmount?: number;
  projectedFinalCost?: number;
  variance?: number;
  source: 'google_sheets';
  updatedAt?: Date;
}

export interface NormalizedBreakdown {
  projectId: string;
  projectNo: string;
  category: string;
  scope?: string;
  budget: number;
  actual: number;
  forecast: number;
  variance: number;
  status: string;
}

export interface NormalizedChangeLog {
  id: string;
  projectId: string;
  projectNo: string;
  changeNo: string;
  title: string;
  description?: string;
  status: string;
  submittedAmount: number;
  approvedAmount: number;
  billedAmount: number;
  nextStep?: string;
  dateSubmitted?: string;
  dateApproved?: string;
}

export interface NormalizedInvoice {
  id: string;
  projectId: string;
  projectNo: string;
  invoiceNo: string;
  billingPeriod: string;
  status: string;
  grossBilled: number;
  retainage: number;
  paid: number;
  arBalance: number;
}

export interface NormalizedProposal {
  id: string;
  projectId: string;
  projectNo: string;
  proposalNo: string;
  title: string;
  status: string;
  amount: number;
  dateSubmitted?: string;
}

export interface NormalizedMonthlyBilling {
  projectId: string;
  projectNo: string;
  month: string;
  contractBilling: number;
  changeBilling: number;
  paidAmount: number;
  arBalance: number;
  forecastBilling: number;
}

export interface NormalizedWorkbookData {
  projects: NormalizedProject[];
  breakdown: NormalizedBreakdown[];
  changes: NormalizedChangeLog[];
  invoices: NormalizedInvoice[];
  proposals: NormalizedProposal[];
  monthlyBilling: NormalizedMonthlyBilling[];
  fetchedAt: Date;
  missingTabs: string[];
  source: 'google_sheets';
}

export interface WorkbookRefreshStatus {
  lastRefreshAt?: string;
  lastError?: string;
  missingTabs?: string[];
  projectCount?: number;
  invoiceCount?: number;
  changeCount?: number;
}
