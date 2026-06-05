import { JobBudgetType } from '@app/config/active-2026-jobs.config';
import { ProjectLifecycleGroup } from './project-lifecycle.types';

export type JobHealthStatus = 'Green' | 'Yellow' | 'Red';

export type ControlBudgetBasis =
  | 'Imported'
  | 'Manual'
  | 'EstimatedFrom20PercentTarget'
  | 'Missing';

export type ControlSortKey =
  | 'jobNumber'
  | 'highestAr'
  | 'lowestMargin'
  | 'largestContract'
  | 'largestCostOverrun'
  | 'mostMissing'
  | 'nextBilling'
  | 'projectName';

export type ControlFilterId =
  | 'under20Margin'
  | 'missingContract'
  | 'missingBudget'
  | 'missingLaborBudget'
  | 'missingPmForeman'
  | 'missingDrive'
  | 'openAr'
  | 'arPastDue'
  | 'approvedCoNotBilled'
  | 'cprRequired'
  | 'cprMissingSetup'
  | 'missingSubCompliance'
  | 'needsReview'
  | 'tmDemo'
  | 'smallInstall'
  | 'fullConstruction'
  | 'specialtySubHeavy';

export interface ControlNextAction {
  label: string;
  route: string;
  queryParams?: Record<string, string>;
  fragment?: string;
}

export interface Active2026ControlRow {
  projectId: string;
  jobNumber: string;
  projectName: string;
  customer: string;
  status: string;
  lifecycleGroup: ProjectLifecycleGroup;
  pm: string;
  foreman: string;
  budgetType: JobBudgetType;

  currentContract: number;
  approvedCos: number;
  pendingCos: number;
  contract2026: number;
  billedToDate: number;
  leftToBill: number;
  arBalance: number;
  arPastDue: number;
  retainage: number;
  billingStatus: string;

  budgetBasis: ControlBudgetBasis;
  totalBudget: number;
  actualCostToDate: number;
  costToComplete: number;
  estimatedFinalCost: number;
  budgetVariance: number;

  projectedProfit: number;
  projectedMarginPct: number;
  overUnderBilling: number;
  wipStatus: string;
  reviewFlags: string[];

  laborBudget: number;
  laborActualCost: number;
  laborVariance: number;
  foremanBonusEligible: boolean;
  foremanAssigned: string;
  bonusStatus: string;

  subcontractorCount: number;
  subcontractorCostToDate: number;
  missingW9Count: number;
  missingCoiCount: number;
  lienWaiverNeededCount: number;

  driveLinked: boolean;
  cprRequired: boolean;
  cprStatus: string;
  seedCompletenessStatus: string;
  missingItemCount: number;

  healthStatus: JobHealthStatus;
  nextAction: ControlNextAction;
  hasApprovedCoNotBilled: boolean;
  missingContract: boolean;
  contractPending: boolean;
  contractPendingNote?: string;
  missingBudget: boolean;
  missingLaborBudget: boolean;
  needsReview: boolean;
}

export interface Active2026ControlSummary {
  activeJobs: number;
  /** @deprecated use jobsCriticalRisk */
  jobsAtRisk: number;
  jobsCriticalRisk: number;
  jobsSetupNeeded: number;
  jobsReviewNeeded: number;
  currentContractTotal: number;
  budgetTotal: number;
  actualCostTotal: number;
  projectedProfitTotal: number;
  projectedMarginPct: number;
  billedToDateTotal: number;
  leftToBillTotal: number;
  openArTotal: number;
  jobsUnder20Margin: number;
  jobsMissingContract: number;
  jobsMissingBudget: number;
  jobsMissingLaborBudget: number;
  jobsArPastDue: number;
  jobsMissingSubCompliance: number;
  jobsMissingCprSetup: number;
}

export type ControlSegmentId = 'activeJobs' | 'all' | 'criticalRisk' | 'setupNeeded' | 'reviewNeeded' | 'billing' | 'cpr' | 'subs';
