import { ProjectFinancial, PayApp, PayAppLine, ARRecord } from '../models/financial.types';
import { ProjectLaborActual } from '../models/labor-actual.types';
import { SubcontractorInvoice } from '../models/subcontractor.types';
import { Billing, ChangeOrder, PO, Project, ProjectBudgetLine, TimeEntry } from '../models/types';
import {
  coApprovedAmount,
  coTotalAmount,
  countsTowardApprovedContract,
  isApprovedUnbilledCo,
  isIncludedInDraftPayApp,
  isPendingCo,
} from './change-management';
import { computeBudgetRollup } from './budget-line.compute';
import { computeProjectArBalance } from './ar.compute';
import { isOpenArRecord } from './wip.compute';

export function payAppBillableAmount(b: Billing): number {
  if (b.status === 'Draft' || b.status === 'Void') return 0;
  return b.netDue ?? b.currentApplication ?? b.workCompletedThisPeriod ?? b.totalBilledToDate ?? 0;
}

export function computeBilledToDate(project: Project, projectBills: Billing[]): number {
  if (project.billedToDate != null && project.billedToDate > 0) {
    return project.billedToDate;
  }
  return projectBills
    .filter(b => b.status === 'Submitted' || b.status === 'Approved' || b.status === 'Invoiced'
      || b.status === 'Paid' || b.status === 'Past Due')
    .reduce((s, b) => s + payAppBillableAmount(b), 0);
}

export function safeDivide(n: number, d: number): number {
  if (!d || !Number.isFinite(d)) return 0;
  return n / d;
}

export function mapProjectFinancialStatus(project: Project): ProjectFinancial['status'] {
  switch (project.status) {
    case 'Lead / Precon':
    case 'Awarded':
    case 'Setup Needed':
      return 'Precon';
    case 'Closeout':
      return 'Closeout';
    case 'Closed':
      return 'Complete';
    default:
      return 'Active';
  }
}

export function computeArBalance(
  projectId: string,
  arRecords: ARRecord[],
  project: Project,
): number {
  return computeProjectArBalance(projectId, arRecords, project);
}

export function computeRetainageHeld(projectBills: Billing[]): number {
  return projectBills
    .filter(b => b.status !== 'Draft' && b.status !== 'Void')
    .reduce((s, b) => s + (b.retainageAmount ?? 0), 0);
}

export interface ImportCostOverrides {
  subcontractorCostToDate?: number;
  materialCostToDate?: number;
  equipmentCostToDate?: number;
  otherCostToDate?: number;
  selfPerformedCostToDate?: number;
  costToDate?: number;
  budgetImported?: boolean;
}

export interface QuickBooksSyncOverrides {
  billedToDate?: number;
  arBalance?: number;
  qboIncomeToDate?: number;
  qboExpenseToDate?: number;
  qboNetIncome?: number;
  /** Summary expense fallback only when no detailed cost or labor actuals. */
  expenseFallback?: number;
}

export function buildProjectFinancial(
  project: Project,
  changeOrders: ChangeOrder[],
  billings: Billing[],
  budgetLines: ProjectBudgetLine[],
  pos: PO[] = [],
  timeEntries: TimeEntry[] = [],
  arRecords: ARRecord[] = [],
  laborActuals: ProjectLaborActual[] = [],
  subcontractorInvoices: SubcontractorInvoice[] = [],
  importCosts?: ImportCostOverrides,
  qbSync?: QuickBooksSyncOverrides,
): ProjectFinancial {
  const projectCos = changeOrders.filter(co => co.projectId === project.id);
  const projectBills = billings.filter(b => b.projectId === project.id && b.status !== 'Void');

  const originalContractAmount = project.originalContractAmount ?? 0;
  const approvedChangeOrderAmount = projectCos
    .filter(countsTowardApprovedContract)
    .reduce((s, co) => s + coApprovedAmount(co), 0);
  const pendingChangeOrderAmount = projectCos
    .filter(isPendingCo)
    .reduce((s, co) => s + coTotalAmount(co), 0);
  const currentContractAmount = originalContractAmount + approvedChangeOrderAmount;

  const rollup = computeBudgetRollup(project, budgetLines, pos, timeEntries, laborActuals, subcontractorInvoices);
  let budgetAmount = project.wipBudgetOverride ?? rollup.budgetAmount;
  let budgetIsEstimated = rollup.budgetIsEstimated;
  let budgetBasis = rollup.budgetBasis;
  if (importCosts?.budgetImported && budgetAmount > 0) {
    budgetIsEstimated = false;
    budgetBasis = 'Imported';
  }

  let costToDate = rollup.costToDate;
  let selfPerformedCostToDate = rollup.selfPerformedCostToDate;
  let subcontractorCostToDate = rollup.subcontractorCostToDate;
  let materialCostToDate = rollup.materialCostToDate;
  let equipmentCostToDate = rollup.equipmentCostToDate;
  let otherCostToDate = rollup.otherCostToDate;

  if (importCosts) {
    if (importCosts.subcontractorCostToDate != null) {
      subcontractorCostToDate = Math.max(subcontractorCostToDate, importCosts.subcontractorCostToDate);
    }
    if (importCosts.materialCostToDate != null) {
      materialCostToDate = Math.max(materialCostToDate, importCosts.materialCostToDate);
    }
    if (importCosts.equipmentCostToDate != null) {
      equipmentCostToDate = Math.max(equipmentCostToDate, importCosts.equipmentCostToDate);
    }
    if (importCosts.otherCostToDate != null) {
      otherCostToDate = Math.max(otherCostToDate, importCosts.otherCostToDate);
    }
    if (importCosts.selfPerformedCostToDate != null && !laborActuals.some(a => a.projectId === project.id)) {
      selfPerformedCostToDate = Math.max(selfPerformedCostToDate, importCosts.selfPerformedCostToDate);
    }
    if (importCosts.costToDate != null) {
      costToDate = Math.max(costToDate, importCosts.costToDate);
    } else {
      costToDate = selfPerformedCostToDate + subcontractorCostToDate + materialCostToDate
        + equipmentCostToDate + otherCostToDate;
    }
  }

  const hasLaborActuals = laborActuals.some(a => a.projectId === project.id);
  const hasDetailedImportCost = !!(importCosts?.costToDate && importCosts.costToDate > 0);
  if (qbSync?.expenseFallback && !hasDetailedImportCost && !hasLaborActuals) {
    costToDate = Math.max(costToDate, qbSync.expenseFallback);
  }

  const estimatedFinalCost = project.wipEstimatedFinalCostOverride ?? rollup.estimatedFinalCost;
  const costToComplete = project.wipCostToComplete ?? rollup.costToComplete;
  const effectiveContract = project.wipContractOverride
    ?? (originalContractAmount + approvedChangeOrderAmount);

  const percentComplete = Math.min(100, safeDivide(costToDate, estimatedFinalCost) * 100);
  const earnedRevenue = project.earnedRevenue ?? (percentComplete / 100) * effectiveContract;

  const billedToDate = qbSync?.billedToDate && qbSync.billedToDate > computeBilledToDate(project, projectBills)
    ? qbSync.billedToDate
    : computeBilledToDate(project, projectBills);
  const leftToBill = Math.max(0, effectiveContract - billedToDate);

  const retainageHeld = computeRetainageHeld(projectBills);
  const arFromRecords = computeArBalance(project.id, arRecords, project);
  const arBalance = qbSync?.arBalance && qbSync.arBalance > arFromRecords
    ? qbSync.arBalance
    : arFromRecords;

  const overUnderBilling = project.overUnderBilled ?? (billedToDate - earnedRevenue);
  const forecastGrossProfit = project.forecastGP ?? (effectiveContract - estimatedFinalCost);
  const forecastMargin = project.forecastMargin
    ?? safeDivide(forecastGrossProfit, effectiveContract) * 100;

  const source: ProjectFinancial['source'] = project.seedProjectId ? 'Seed'
    : (project.qboSyncedAt || qbSync?.qboIncomeToDate) ? 'QuickBooks'
    : budgetIsEstimated ? 'Calculated'
    : 'App';

  return {
    id: project.id,
    projectId: project.id,
    jobNumber: project.projectNumber,
    projectName: project.projectName,
    originalContractAmount,
    approvedChangeOrderAmount,
    pendingChangeOrderAmount,
    currentContractAmount: effectiveContract,
    budgetAmount,
    estimatedFinalCost,
    costToDate,
    costToComplete,
    earnedRevenue,
    billedToDate,
    priorBilled: Math.max(0, billedToDate - (projectBills.at(-1)?.currentApplication ?? 0)),
    currentBilling: projectBills.find(b => b.status === 'Draft')?.currentApplication ?? 0,
    retainageHeld,
    arBalance,
    overUnderBilling,
    leftToBill,
    forecastGrossProfit,
    forecastMargin,
    selfPerformedBudget: rollup.selfPerformedBudget,
    subcontractorBudget: rollup.subcontractorBudget,
    materialBudget: rollup.materialBudget,
    equipmentBudget: rollup.equipmentBudget,
    otherBudget: rollup.otherBudget,
    selfPerformedCostToDate,
    subcontractorCostToDate,
    materialCostToDate,
    equipmentCostToDate,
    otherCostToDate,
    status: mapProjectFinancialStatus(project),
    source,
    needsReview: !!project.seedActionRequired
      || project.wipStatus === 'Needs Review'
      || (effectiveContract > 0 && forecastMargin < 20)
      || budgetBasis === 'MissingContract',
    reviewNotes: project.seedActionRequired,
    budgetIsEstimated,
    budgetBasis,
    qboIncomeToDate: qbSync?.qboIncomeToDate,
    qboExpenseToDate: qbSync?.qboExpenseToDate,
    qboNetIncome: qbSync?.qboNetIncome,
  };
}

export function agingBucketForDate(dueDate: string | undefined): ARRecord['agingBucket'] {
  if (!dueDate) return 'Current';
  const due = new Date(dueDate);
  const today = new Date();
  const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function payAppFromBilling(b: Billing): PayApp {
  return {
    ...b,
    status: (b.status === 'Past Due' ? 'Approved' : b.status) as PayApp['status'],
    includedChangeOrderIds: b.includedChangeOrderIds ?? b.changeOrderIds ?? [],
    changeOrderIds: b.changeOrderIds ?? b.includedChangeOrderIds ?? [],
  };
}

export function billingFromPayAppInput(p: Partial<PayApp>): Partial<Billing> {
  return {
    ...p,
    changeOrderIds: p.includedChangeOrderIds ?? p.changeOrderIds,
    includedChangeOrderIds: p.includedChangeOrderIds ?? p.changeOrderIds,
  } as Partial<Billing>;
}

export function buildPayAppLineFromCo(co: ChangeOrder, payAppId: string, projectId: string): Partial<PayAppLine> {
  const amount = coApprovedAmount(co);
  return {
    payAppId,
    projectId,
    lineType: 'ChangeOrder',
    sourceRecordId: co.id,
    description: co.title,
    scheduledValue: amount,
    currentBilling: amount,
    totalCompletedStored: amount,
    status: 'Draft',
  };
}
