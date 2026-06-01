/** Raw row shapes — field names match likely sheet headers (flexible parsing). */
export interface RawProjectRow {
  projectNo?: string;
  projectName?: string;
  status?: string;
  customer?: string;
  contractAmount?: string | number;
  originalContract?: string | number;
  revisedContract?: string | number;
  billedToDate?: string | number;
  openAR?: string | number;
  remainingToBill?: string | number;
  leftToBill?: string | number;
  notes?: string;
  nextAction?: string;
  currentActivity?: string;
  address?: string;
  projectManager?: string;
  [key: string]: string | number | undefined;
}

export interface RawBreakdownRow {
  projectNo?: string;
  category?: string;
  scope?: string;
  budget?: string | number;
  actual?: string | number;
  forecast?: string | number;
  variance?: string | number;
  status?: string;
  [key: string]: string | number | undefined;
}

export interface RawChangeLogRow {
  projectNo?: string;
  changeNo?: string;
  description?: string;
  title?: string;
  status?: string;
  submittedAmount?: string | number;
  approvedAmount?: string | number;
  billedAmount?: string | number;
  nextStep?: string;
  dateSubmitted?: string;
  dateApproved?: string;
  [key: string]: string | number | undefined;
}

export interface RawInvoicePayAppRow {
  projectNo?: string;
  invoiceNo?: string;
  payAppNumber?: string;
  billingPeriod?: string;
  period?: string;
  status?: string;
  grossBilled?: string | number;
  totalBilled?: string | number;
  retainage?: string | number;
  paid?: string | number;
  amountPaid?: string | number;
  arBalance?: string | number;
  [key: string]: string | number | undefined;
}

export interface RawProposalRow {
  projectNo?: string;
  proposalNo?: string;
  description?: string;
  title?: string;
  status?: string;
  amount?: string | number;
  dateSubmitted?: string;
  [key: string]: string | number | undefined;
}

export interface RawMonthlyBillingRow {
  projectNo?: string;
  month?: string;
  contractBilling?: string | number;
  changeBilling?: string | number;
  paidAmount?: string | number;
  arBalance?: string | number;
  forecastBilling?: string | number;
  [key: string]: string | number | undefined;
}
