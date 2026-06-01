import { ProjectLaborActual } from '../models/labor-actual.types';
import { Project, ProjectBudgetLine } from '../models/types';
import {
  ForemanBonusFlag,
  ForemanBonusPolicy,
  ForemanBonusRecord,
  ForemanBonusSource,
  ForemanBonusStatus,
  ForemanBonusSummary,
  ForemanBonusTaskDescriptor,
  LaborCostBasis,
  ProjectForemanAssignment,
} from '../models/foreman-bonus.types';
import { safeDivide } from './project-financial.compute';

export const DEFAULT_FOREMAN_BONUS_RATE = 0.10;

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function wagesAndFringeFromActuals(actuals: ProjectLaborActual[]): { wages: number; fringe: number } {
  let wages = 0;
  let fringe = 0;

  for (const actual of actuals) {
    if (actual.approvalStatus !== 'Approved') continue;
    const base = actual.baseRate ?? 0;
    const fringeRate = actual.fringeRate ?? 0;
    const reg = actual.regularHours ?? 0;
    const ot = actual.overtimeHours ?? 0;
    const dt = actual.doubleTimeHours ?? 0;
    const totalHours = actual.totalHours ?? reg + ot + dt;

    if (base > 0 || fringeRate > 0) {
      wages += reg * base + ot * base * 1.5 + dt * base * 2;
      fringe += totalHours * fringeRate;
    } else {
      wages += actual.totalLaborCost ?? 0;
    }
  }

  return { wages: roundCurrency(wages), fringe: roundCurrency(fringe) };
}

export function actualLaborCostFromBasis(
  basis: LaborCostBasis,
  wages: number,
  fringe: number,
  burden = 0,
  override?: number,
): number {
  if (basis === 'ManualOverride' && override != null) return roundCurrency(override);
  if (basis === 'WagesOnly') return roundCurrency(wages);
  if (basis === 'WagesFringeAndBurden') return roundCurrency(wages + fringe + burden);
  return roundCurrency(wages + fringe);
}

export function laborBudgetFromLines(projectId: string, budgetLines: ProjectBudgetLine[]): number {
  return budgetLines
    .filter(line => line.projectId === projectId && line.category === 'Labor')
    .reduce((sum, line) => sum + (line.budgetAmount ?? line.revisedBudget ?? line.originalBudget ?? 0), 0);
}

export function billingReleasePercent(
  billedToDate: number,
  currentContractAmount: number,
  override?: number,
): number {
  if (override != null && Number.isFinite(override)) {
    return Math.min(Math.max(override, 0), 1);
  }
  if (!currentContractAmount || currentContractAmount <= 0) return 0;
  return Math.min(Math.max(safeDivide(billedToDate, currentContractAmount), 0), 1);
}

export function percentCompleteDecimal(
  project: Project,
  costPercentComplete?: number,
): number | undefined {
  if (project.wipPercentComplete != null && project.wipPercentComplete >= 0) {
    return Math.min(project.wipPercentComplete / 100, 1);
  }
  if (costPercentComplete != null && Number.isFinite(costPercentComplete)) {
    return Math.min(Math.max(costPercentComplete / 100, 0), 1);
  }
  return undefined;
}

export interface ForemanBonusCalcInput {
  actualLaborCost?: number;
  laborBudget?: number;
  percentComplete?: number;
  bonusRate?: number;
  foremanSharePercent?: number;
  billingReleasePercent?: number;
  previouslyPaid?: number;
}

export interface ForemanBonusCalcResult {
  currentLaborBudget: number;
  laborSavings: number;
  grossBonusEarned: number;
  foremanShareBonus: number;
  bonusAvailableToReceive: number;
  payThisTerm: number;
  remainingPotential: number;
}

export function computeForemanBonusAmounts(input: ForemanBonusCalcInput): ForemanBonusCalcResult {
  const laborBudget = input.laborBudget ?? 0;
  const percentComplete = input.percentComplete ?? 0;
  const actualLaborCost = input.actualLaborCost ?? 0;
  const bonusRate = input.bonusRate ?? DEFAULT_FOREMAN_BONUS_RATE;
  const foremanSharePercent = input.foremanSharePercent ?? 1;
  const billingPct = input.billingReleasePercent ?? 0;
  const previouslyPaid = input.previouslyPaid ?? 0;

  const currentLaborBudget = roundCurrency(laborBudget * percentComplete);
  const laborSavings = roundCurrency(currentLaborBudget - actualLaborCost);
  const grossBonusEarned = roundCurrency(Math.max(laborSavings, 0) * bonusRate);
  const foremanShareBonus = roundCurrency(grossBonusEarned * foremanSharePercent);
  const bonusAvailableToReceive = roundCurrency(foremanShareBonus * billingPct);
  const payThisTerm = roundCurrency(bonusAvailableToReceive - previouslyPaid);
  const remainingPotential = roundCurrency(foremanShareBonus - bonusAvailableToReceive);

  return {
    currentLaborBudget,
    laborSavings,
    grossBonusEarned,
    foremanShareBonus,
    bonusAvailableToReceive,
    payThisTerm,
    remainingPotential,
  };
}

export function recordsMatchWithinTolerance(
  stored: number | undefined,
  computed: number,
  tolerance = 0.05,
): boolean {
  if (stored == null) return true;
  return Math.abs(stored - computed) <= tolerance;
}

export function detectForemanBonusFlags(
  record: ForemanBonusRecord,
  assignments: ProjectForemanAssignment[],
  policy: ForemanBonusPolicy,
  computed?: ForemanBonusCalcResult,
): ForemanBonusFlag[] {
  const flags: ForemanBonusFlag[] = [];
  const projectAssignments = assignments.filter(
    a => a.projectId === record.projectId && a.bonusEligible,
  );

  if (!record.laborBudget || record.laborBudget <= 0) flags.push('missingLaborBudget');
  if (!record.actualLaborCost && record.actualLaborCost !== 0) flags.push('missingActualLaborCost');
  if (!projectAssignments.length) flags.push('missingForemanAssignment');
  if (record.percentComplete == null || record.percentComplete < 0) flags.push('missingPercentComplete');
  if (record.billingReleasePercent == null || record.billingReleasePercent < 0) {
    flags.push('missingBillingPercent');
  }

  const splitTotal = projectAssignments
    .filter(a => a.role === 'Split' || a.role === 'Primary')
    .reduce((sum, a) => sum + (a.sharePercent ?? 0), 0);
  if (projectAssignments.length > 1 && Math.abs(splitTotal - 1) > 0.001) {
    flags.push('splitPercentMismatch');
  }

  if (record.bonusRate !== policy.defaultBonusRate) flags.push('specialBonusRate');
  if (record.payThisTerm < 0 && !policy.allowNegativePayThisTerm) flags.push('negativePayThisTerm');
  if (record.actualLaborCost > record.laborBudget && record.laborBudget > 0) {
    flags.push('laborCostOverBudget');
  }

  if (record.source === 'ImportedHistorical' && computed) {
    const mismatch =
      !recordsMatchWithinTolerance(record.foremanShareBonus, computed.foremanShareBonus)
      || !recordsMatchWithinTolerance(record.bonusAvailableToReceive, computed.bonusAvailableToReceive)
      || !recordsMatchWithinTolerance(record.payThisTerm, computed.payThisTerm, 0.25);
    if (mismatch) flags.push('historicalMismatch');
  }

  return flags;
}

export function deriveForemanBonusStatus(
  record: ForemanBonusRecord,
  flags: ForemanBonusFlag[],
  policy: ForemanBonusPolicy,
): ForemanBonusStatus {
  if (record.status === 'Approved' || record.status === 'Paid' || record.status === 'Closed') {
    return record.status;
  }

  const missingFlags = new Set<ForemanBonusFlag>([
    'missingLaborBudget',
    'missingActualLaborCost',
    'missingForemanAssignment',
    'missingPercentComplete',
    'missingBillingPercent',
  ]);
  if (flags.some(flag => missingFlags.has(flag))) return 'MissingData';

  const reviewFlags = new Set<ForemanBonusFlag>([
    'splitPercentMismatch',
    'negativePayThisTerm',
    'historicalMismatch',
    'laborCostOverBudget',
  ]);
  if (flags.some(flag => reviewFlags.has(flag))) return 'NeedsReview';
  if (record.source === 'ImportedHistorical' && flags.includes('specialBonusRate')) {
    return record.status === 'NeedsReview' ? 'NeedsReview' : 'Calculated';
  }

  if (record.payThisTerm > 0 && !policy.allowNegativePayThisTerm) return 'Calculated';
  return record.status === 'NeedsReview' ? 'NeedsReview' : 'Calculated';
}

export function buildCalculatedForemanBonusRecord(
  base: Partial<ForemanBonusRecord>,
  policy: ForemanBonusPolicy,
): ForemanBonusRecord {
  const calc = computeForemanBonusAmounts({
    actualLaborCost: base.actualLaborCost,
    laborBudget: base.laborBudget,
    percentComplete: base.percentComplete,
    bonusRate: base.bonusRate ?? policy.defaultBonusRate,
    foremanSharePercent: base.foremanSharePercent ?? 1,
    billingReleasePercent: base.billingReleasePercent,
    previouslyPaid: base.previouslyPaid,
  });

  const record: ForemanBonusRecord = {
    id: base.id ?? '',
    projectId: base.projectId ?? '',
    jobNumber: base.jobNumber,
    projectName: base.projectName,
    foremanEmployeeId: base.foremanEmployeeId,
    foremanName: base.foremanName ?? '',
    reportPeriodStart: base.reportPeriodStart,
    reportPeriodEnd: base.reportPeriodEnd,
    laborCostBasis: base.laborCostBasis ?? policy.laborCostBasis,
    wagesAmount: base.wagesAmount,
    fringeAmount: base.fringeAmount,
    actualLaborCost: base.actualLaborCost ?? 0,
    laborBudget: base.laborBudget ?? 0,
    percentComplete: base.percentComplete ?? 0,
    currentLaborBudget: calc.currentLaborBudget,
    laborSavings: calc.laborSavings,
    bonusRate: base.bonusRate ?? policy.defaultBonusRate,
    grossBonusEarned: calc.grossBonusEarned,
    foremanSharePercent: base.foremanSharePercent ?? 1,
    foremanShareBonus: calc.foremanShareBonus,
    billingReleasePercent: base.billingReleasePercent ?? 0,
    bonusAvailableToReceive: calc.bonusAvailableToReceive,
    previouslyPaid: base.previouslyPaid ?? 0,
    payThisTerm: calc.payThisTerm,
    remainingPotential: calc.remainingPotential,
    status: base.status ?? 'Calculated',
    source: base.source ?? 'App',
    notes: base.notes,
  };

  const flags = detectForemanBonusFlags(record, [], policy, calc);
  record.status = deriveForemanBonusStatus(record, flags, policy);
  return record;
}

export function preserveHistoricalRecord(
  record: ForemanBonusRecord,
  policy: ForemanBonusPolicy,
  assignments: ProjectForemanAssignment[] = [],
): ForemanBonusRecord {
  const computed = computeForemanBonusAmounts({
    actualLaborCost: record.actualLaborCost,
    laborBudget: record.laborBudget,
    percentComplete: record.percentComplete,
    bonusRate: record.bonusRate,
    foremanSharePercent: record.foremanSharePercent,
    billingReleasePercent: record.billingReleasePercent,
    previouslyPaid: record.previouslyPaid,
  });
  const flags = detectForemanBonusFlags(record, assignments, policy, computed);
  return {
    ...record,
    status: deriveForemanBonusStatus(record, flags, policy),
  };
}

export function summarizeForemanBonusRecords(
  records: ForemanBonusRecord[],
  foremanName: string,
  reportPeriodEnd?: string,
): ForemanBonusSummary {
  const filtered = records.filter(r =>
    r.foremanName === foremanName
    && (!reportPeriodEnd || r.reportPeriodEnd === reportPeriodEnd),
  );

  return {
    foremanName,
    foremanEmployeeId: filtered[0]?.foremanEmployeeId,
    reportPeriodStart: filtered[0]?.reportPeriodStart,
    reportPeriodEnd: reportPeriodEnd ?? filtered[0]?.reportPeriodEnd,
    totalJobs: filtered.length,
    totalBonusEarnedToDate: roundCurrency(
      filtered.reduce((sum, r) => sum + r.bonusAvailableToReceive, 0),
    ),
    potentialTotalBonus: roundCurrency(
      filtered.reduce((sum, r) => sum + r.foremanShareBonus, 0),
    ),
    previouslyPaid: roundCurrency(filtered.reduce((sum, r) => sum + r.previouslyPaid, 0)),
    payThisTerm: roundCurrency(filtered.reduce((sum, r) => sum + r.payThisTerm, 0)),
    remainingPotential: roundCurrency(filtered.reduce((sum, r) => sum + r.remainingPotential, 0)),
    bonusNumber: filtered[0]?.bonusNumber,
  };
}

export function bonusTaskDescriptors(
  record: ForemanBonusRecord,
  flags: ForemanBonusFlag[],
): ForemanBonusTaskDescriptor[] {
  const tasks: ForemanBonusTaskDescriptor[] = [];
  const label = `${record.jobNumber ?? record.projectName ?? 'Job'} — ${record.foremanName}`;

  const push = (flag: ForemanBonusFlag, title: string, severity: 'warning' | 'error') => {
    if (!flags.includes(flag)) return;
    tasks.push({
      triggerKey: `foreman-bonus-${flag}-${record.id}`,
      title,
      severity,
      flag,
    });
  };

  push('missingLaborBudget', `Add labor budget for foreman bonus (${label})`, 'warning');
  push('missingForemanAssignment', `Assign foreman for labor bonus (${label})`, 'warning');
  push('missingBillingPercent', `Confirm billing release percent for bonus (${label})`, 'warning');
  push('splitPercentMismatch', `Review foreman bonus split (${label})`, 'warning');
  push('historicalMismatch', `Review imported foreman bonus record (${label})`, 'warning');
  push('negativePayThisTerm', `Review foreman bonus negative pay (${label})`, 'error');
  push('laborCostOverBudget', `Review labor cost over budget (${label})`, 'warning');

  if (record.status === 'Calculated' && record.payThisTerm > 0) {
    tasks.push({
      triggerKey: `foreman-bonus-review-${record.id}`,
      title: `Review foreman bonus (${label})`,
      severity: 'warning',
      flag: 'specialBonusRate',
    });
  }

  if (record.status === 'Approved' && record.payThisTerm > 0) {
    tasks.push({
      triggerKey: `foreman-bonus-pay-${record.id}`,
      title: `Pay foreman bonus (${label})`,
      severity: 'warning',
      flag: 'specialBonusRate',
    });
  }

  return tasks;
}

export function isHistoricalSource(source: ForemanBonusSource): boolean {
  return source === 'ImportedHistorical';
}
