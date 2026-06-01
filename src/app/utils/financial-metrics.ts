import { Project, ChangeOrder, Billing, PO, ProjectBudgetLine } from '../models/types';
import { ProjectLaborActual } from '../models/labor-actual.types';
import { SubcontractorInvoice } from '../models/subcontractor.types';
import { ARRecord, FinancialMetrics, WIPRecord } from '../models/financial.types';
import { buildProjectFinancial } from './project-financial.compute';
import { computeBudgetRollup, derivePoStatus, poCommittedAmount } from './budget-line.compute';
import {
  coApprovedAmount,
  coTotalAmount,
  isApprovedUnbilledCo,
  isIncludedInDraftPayApp,
  isPendingCo,
} from './change-management';
import { isOverheadJob } from './project';
import { computeArPortfolioSummary, ArComputeContext } from './ar.compute';

export function computeFinancialMetrics(
  projects: Project[],
  changeOrders: ChangeOrder[],
  billings: Billing[],
  budgetLines: ProjectBudgetLine[],
  pos: PO[],
  arRecords: ARRecord[],
  wipRecords: WIPRecord[],
  laborActuals: ProjectLaborActual[] = [],
  subcontractorInvoices: SubcontractorInvoice[] = [],
  arContext?: Pick<ArComputeContext, 'qbHasArAgingTab'>,
): FinancialMetrics {
  const jobs = projects.filter(p => !isOverheadJob(p));
  let activeWipContractAmount = 0;
  let billedToDate = 0;
  let leftToBill = 0;
  let forecastGrossProfit = 0;

  for (const w of wipRecords) {
    if (w.wipGroup === 'ActiveWIP' || w.wipGroup === 'UpcomingWIP') {
      activeWipContractAmount += w.contractAmount;
      billedToDate += w.billedToDate;
      leftToBill += w.leftToBill;
      forecastGrossProfit += w.forecastGrossProfit;
    }
  }

  const arSummary = computeArPortfolioSummary({
    records: arRecords,
    projects: jobs,
    qbHasArAgingTab: arContext?.qbHasArAgingTab ?? arRecords.some(r => r.source === 'QuickBooks' || r.source === 'QuickBooksArAging'),
  });

  const arBalance = arSummary.openAr;
  const arOver30 = arSummary.pastDue;
  const closeoutArAmount = arSummary.closeoutAr;

  const approvedUnbilledCOAmount = changeOrders
    .filter(isApprovedUnbilledCo)
    .reduce((s, co) => s + coApprovedAmount(co), 0);

  const pendingCOAmount = changeOrders
    .filter(isPendingCo)
    .reduce((s, co) => s + coTotalAmount(co), 0);

  let budgetOverrunCount = 0;
  let poOverBudgetCount = 0;
  for (const project of jobs) {
    const f = buildProjectFinancial(project, changeOrders, billings, budgetLines, pos, [], arRecords, laborActuals, subcontractorInvoices);
    if (f.costToDate > f.budgetAmount && f.budgetAmount > 0) budgetOverrunCount++;
    const rollup = computeBudgetRollup(project, budgetLines, pos, [], laborActuals, subcontractorInvoices);
    if (rollup.budgetAmount > 0 && rollup.committedAmount > rollup.budgetAmount) poOverBudgetCount++;
    for (const po of pos.filter(p => p.projectId === project.id)) {
      if (derivePoStatus(po) === 'Void' || derivePoStatus(po) === 'Draft') continue;
      const lineBudget = rollup.budgetAmount;
      if (lineBudget > 0 && poCommittedAmount(po) > lineBudget) poOverBudgetCount++;
    }
  }

  const payAppsDueCount = billings.filter(b => b.status === 'Draft' || b.status === 'Submitted').length;

  const forecastMargin = activeWipContractAmount
    ? (forecastGrossProfit / activeWipContractAmount) * 100
    : 0;

  return {
    activeWipContractAmount,
    billedToDate,
    leftToBill,
    approvedUnbilledCOAmount,
    pendingCOAmount,
    arBalance,
    arOver30,
    forecastGrossProfit,
    forecastMargin,
    budgetOverrunCount,
    payAppsDueCount,
    poOverBudgetCount,
    closeoutArAmount,
  };
}
