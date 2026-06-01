export type LaborExceptionType =
  | 'missing-employee-match'
  | 'missing-classification'
  | 'missing-base-rate'
  | 'missing-fringe-rate'
  | 'employee-no-qbo-match'
  | 'project-no-match'
  | 'certified-payroll-non-certified-class'
  | 'approved-not-in-qbo'
  | 'qbo-no-timekeeper-hours'
  | 'office-labor-on-job'
  | 'unassigned-labor-code'
  | 'unmapped-labor-code';

export type RateMatchSource =
  | 'employee-summary'
  | 'classification'
  | 'area-default'
  | 'missing';

export interface FringeComponents {
  healthWelfare?: number;
  pension?: number;
  vacation?: number;
  apprenticeTraining?: number;
  otherFringe?: number;
}

export interface EmployeeRecord {
  employeeName: string;
  email?: string;
  status?: string;
  defaultClassification?: string;
  unionArea?: string;
  baseRate?: number;
  fringeRate?: number;
  fringeEligible?: boolean;
  qboMatch?: string;
  timekeeperMatch?: boolean;
  notes?: string;
  effectiveDate?: string;
  source?: string;
}

export interface ClassificationRateRecord {
  unionArea: string;
  classification: string;
  baseRate: number;
  fringeRate: number;
  totalPackage: number;
  fringeComponents?: FringeComponents;
  effectiveDate?: string;
  source?: string;
}

export interface FringeRateRecord {
  unionArea: string;
  classification: string;
  fringeRate: number;
  components?: FringeComponents;
  effectiveDate?: string;
  source?: string;
}

export interface LaborTimeEntry {
  id: string;
  userEmail?: string;
  workDate?: string;
  employeeName?: string;
  jobIdLabel?: string;
  projectNumber?: string;
  classification?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  laborCode?: string;
  laborCode1?: string;
  laborCode2?: string;
  laborCode3?: string;
  hours1?: number;
  hours2?: number;
  hours3?: number;
  approvalStatus?: string;
  timeStamp?: string;
  sourceRowId?: string;
}

export interface NormalizedLaborEntry extends LaborTimeEntry {
  month: string;
  totalHours: number;
  rateSource: RateMatchSource;
  unionArea?: string;
  baseRate?: number;
  fringeRate?: number;
  totalPackage?: number;
  regularWageCost: number;
  overtimeWageCost: number;
  doubleTimeWageCost: number;
  wageCost: number;
  fringeCost: number;
  estimatedLaborTotal: number;
  projectId?: string;
  projectName?: string;
  rateMissing: boolean;
}

export interface MonthlyLaborAccrual {
  id: string;
  month: string;
  projectNo: string;
  projectId?: string;
  projectName?: string;
  employeeName: string;
  classification: string;
  laborCode?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  baseRate?: number;
  fringeRate?: number;
  wageCost: number;
  fringeCost: number;
  estimatedLaborTotal: number;
  qbActualLaborCost?: number;
  laborNotYetInQb?: number;
  exceptions: LaborExceptionType[];
}

export interface QbLaborActual {
  projectNo: string;
  projectId?: string;
  month?: string;
  qbActualLaborCost?: number;
  source?: 'qbo-project' | 'qbo-wip';
  syncedAt?: string;
}

export interface LaborException {
  id: string;
  type: LaborExceptionType;
  severity: 'warning' | 'error';
  title: string;
  description: string;
  employeeName?: string;
  projectNo?: string;
  classification?: string;
  month?: string;
  hours?: number;
  estimatedCost?: number;
}

export interface LaborOverviewKpis {
  approvedHoursThisMonth: number;
  estimatedWageCost: number;
  estimatedFringeCost: number;
  estimatedTotalLabor: number;
  laborNotYetInQbo: number;
  missingRates: number;
}

export interface LaborRefreshStatus {
  lastRefreshAt?: string;
  source: 'google-sheets' | 'cache' | 'seed';
  timekeeperRowCount: number;
  approvedRowCount: number;
  employeeCount: number;
  rateCount: number;
  error?: string;
}
