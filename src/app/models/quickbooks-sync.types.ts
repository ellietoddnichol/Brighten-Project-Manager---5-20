import { ImportRecordStatus } from './import.types';

export interface QuickBooksSyncRun {
  id: string;
  spreadsheetId: string;
  startedAt: string;
  completedAt?: string;
  status: 'Running' | 'Completed' | 'CompletedWithWarnings' | 'Failed';
  tabsRead: string[];
  tabsMissing: string[];
  rowsRead: number;
  rowsImported: number;
  warnings: string[];
  errors: string[];
}

export interface QuickBooksCustomerProject {
  id: string;
  qboCustomerId?: string;
  jobNumber?: string;
  projectId?: string;
  customerName: string;
  fullName?: string;
  balance?: number;
  email?: string;
  company?: string;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export interface QuickBooksIncomeByCustomer {
  id: string;
  jobNumber?: string;
  projectId?: string;
  customerLabel: string;
  income: number;
  expenses: number;
  netIncome: number;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export interface QuickBooksInvoiceLine {
  id: string;
  jobNumber?: string;
  projectId?: string;
  invoiceDate?: string;
  paidDate?: string;
  memo?: string;
  amount: number;
  ledgerAmount?: number;
  accountLine?: string;
  splitAccount?: string;
  productService?: string;
  quantity?: number;
  rate?: number;
  className?: string;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export interface QuickBooksArAging {
  id: string;
  jobNumber?: string;
  projectId?: string;
  customerLabel: string;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days91Plus: number;
  total: number;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export interface QuickBooksVendorBalance {
  id: string;
  vendorName: string;
  subcontractorId?: string;
  totalOpenBalance: number;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export interface QuickBooksBillPayment {
  id: string;
  qboPaymentId?: string;
  paymentDate?: string;
  amount: number;
  linkedTxnId?: string;
  linkedTxnType?: string;
  vendorName?: string;
  subcontractorId?: string;
  projectId?: string;
  sourceRow: number;
  status: ImportRecordStatus;
  importKey: string;
}

export type QuickBooksCostCategory =
  | 'Labor'
  | 'Material'
  | 'Subcontractor'
  | 'Equipment'
  | 'GeneralConditions'
  | 'Other';

export interface QuickBooksProjectCostTransaction {
  id: string;
  source: 'QuickBooksProjectCostDetail';
  sourceTabName: string;
  qboTransactionId?: string;
  jobNumber?: string;
  projectId?: string;
  projectName?: string;
  vendorName?: string;
  subcontractorId?: string;
  transactionType?: string;
  transactionDate?: string;
  transactionNumber?: string;
  account?: string;
  category?: string;
  productService?: string;
  className?: string;
  memo?: string;
  description?: string;
  amount: number;
  openBalance?: number;
  paidStatus?: string;
  cleared?: string;
  costCategory: QuickBooksCostCategory;
  retainageFlag?: boolean;
  includeInWipActuals: boolean;
  status: ImportRecordStatus;
  sourceRow: number;
  importKey: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuickBooksSyncStore {
  lastRun?: QuickBooksSyncRun;
  customers: QuickBooksCustomerProject[];
  incomeByCustomer: QuickBooksIncomeByCustomer[];
  invoiceLines: QuickBooksInvoiceLine[];
  arAging: QuickBooksArAging[];
  vendorBalances: QuickBooksVendorBalance[];
  billPayments: QuickBooksBillPayment[];
  detailCostTransactions: QuickBooksProjectCostTransaction[];
  hasDetailCostTab: boolean;
  detailCostTabName?: string;
  detailCostWarning?: string;
}
