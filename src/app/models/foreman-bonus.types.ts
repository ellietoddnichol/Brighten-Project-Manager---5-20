export type LaborCostBasis = 'WagesOnly' | 'WagesPlusFringe' | 'WagesFringeAndBurden' | 'ManualOverride';
export type BonusReleaseBasis = 'BilledPercent' | 'CollectedPercent' | 'ManualPercentReceived';
export type ForemanAssignmentRole = 'Primary' | 'Split' | 'Backup';
export type ForemanBonusStatus = 'MissingData' | 'Calculated' | 'NeedsReview' | 'Approved' | 'Paid' | 'Closed';
export type ForemanBonusSource = 'App' | 'ImportedHistorical' | 'Manual';
export type ForemanBonusPaymentStatus = 'Draft' | 'Approved' | 'Paid' | 'Void';
export type ForemanBonusPayoutTiming = 'Monthly' | 'Quarterly' | 'AtCompletion' | 'Manual';

export interface ForemanBonusPolicy {
  id: string;
  name: string;
  defaultBonusRate: number;
  laborCostBasis: LaborCostBasis;
  releaseBasis: BonusReleaseBasis;
  defaultPayoutTiming: ForemanBonusPayoutTiming;
  allowSplits: boolean;
  allowNegativePayThisTerm: boolean;
  retainageHoldbackPercent?: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface ProjectForemanAssignment {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  foremanEmployeeId?: string;
  foremanName: string;
  role: ForemanAssignmentRole;
  sharePercent: number;
  startDate?: string;
  endDate?: string;
  bonusEligible: boolean;
  bonusRateOverride?: number;
  releasePercentOverride?: number;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface ForemanBonusRecord {
  id: string;
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  foremanEmployeeId?: string;
  foremanName: string;
  reportPeriodStart?: string;
  reportPeriodEnd?: string;
  laborCostBasis: LaborCostBasis;
  wagesAmount?: number;
  fringeAmount?: number;
  actualLaborCost: number;
  laborBudget: number;
  percentComplete: number;
  currentLaborBudget: number;
  laborSavings: number;
  bonusRate: number;
  grossBonusEarned: number;
  foremanSharePercent: number;
  foremanShareBonus: number;
  billingReleasePercent: number;
  bonusAvailableToReceive: number;
  previouslyPaid: number;
  payThisTerm: number;
  remainingPotential: number;
  status: ForemanBonusStatus;
  source: ForemanBonusSource;
  notes?: string;
  bonusNumber?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface ForemanBonusPayment {
  id: string;
  foremanEmployeeId?: string;
  foremanName: string;
  reportPeriodStart?: string;
  reportPeriodEnd?: string;
  paymentDate?: string;
  checkNumber?: string;
  amount: number;
  bonusRecordIds: string[];
  status: ForemanBonusPaymentStatus;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export interface ForemanBonusSummary {
  foremanName: string;
  foremanEmployeeId?: string;
  reportPeriodStart?: string;
  reportPeriodEnd?: string;
  totalJobs: number;
  /** Billing-capped bonus available/earned to date (sum of Bonus Total of Received). */
  totalBonusEarnedToDate: number;
  /** Full possible labor-savings bonus before billing cap (sum of Potential Total Bonus). */
  potentialTotalBonus: number;
  previouslyPaid: number;
  payThisTerm: number;
  remainingPotential: number;
  bonusNumber?: number;
}

export type ForemanBonusExportFormat = 'combined' | 'short' | 'full' | 'csv';

export interface ForemanBonusReportMeta {
  companyName?: string;
  reportThrough: string;
  reportPeriodStart?: string;
  reportPeriodEnd?: string;
  reportLabel?: string;
  bonusRunNumber?: number;
}

export type ForemanBonusFlag =
  | 'missingLaborBudget'
  | 'missingActualLaborCost'
  | 'missingForemanAssignment'
  | 'missingPercentComplete'
  | 'missingBillingPercent'
  | 'splitPercentMismatch'
  | 'specialBonusRate'
  | 'negativePayThisTerm'
  | 'laborCostOverBudget'
  | 'historicalMismatch';

export interface ForemanBonusTaskDescriptor {
  triggerKey: string;
  title: string;
  severity: 'warning' | 'error';
  flag: ForemanBonusFlag;
}
