import { ControlNextAction } from '@app/models/active-2026-control.types';
import { ProjectFinancial } from '@app/models/financial.types';
import { Project } from '@app/models/types';
import { ProjectEnabledModules } from '@app/models/project-needs.types';
import { FinancialView } from '@app/components/project/project-detail.types';

export type BudgetSegment = 'budget' | 'actuals' | 'variance' | 'sources';
export type BillingSegment = 'summary' | 'pay-apps' | 'sov' | 'source' | 'review' | 'ar' | 'retainage';
export type MoneyDrawerType =
  | 'contract'
  | 'budget'
  | 'actual-cost'
  | 'billing'
  | 'ar'
  | 'sub-cost'
  | 'source';

export interface MoneyOverviewCard {
  id: MoneyDrawerType | 'margin' | 'ar-left';
  label: string;
  value: string;
  subtext?: string;
  alert?: boolean;
}

export interface MoneyCompactStat {
  label: string;
  value: string;
  alert?: boolean;
  drawer?: MoneyDrawerType;
}

export interface MoneyMissingPrompt {
  id: string;
  label: string;
  actionLabel: string;
  view: FinancialView;
}

export interface MoneyNextAction extends ControlNextAction {
  view?: FinancialView;
}

function openFinancial(pid: string, view: FinancialView): ControlNextAction {
  return {
    label: '',
    route: `/projects/${pid}`,
    queryParams: { section: 'financials', view },
  };
}

export function isMissingContract(
  financial: ProjectFinancial,
  project?: Pick<Project, 'contractPending'>,
): boolean {
  if (project?.contractPending) return false;
  return !financial.currentContractAmount || financial.budgetBasis === 'MissingContract';
}

export function isMissingRealBudget(financial: ProjectFinancial): boolean {
  return !financial.budgetIsEstimated
    && financial.budgetAmount <= 0
    && financial.budgetBasis !== 'Imported'
    && financial.budgetBasis !== 'Workbook';
}

export function missingMoneyPrompts(
  project: Project,
  financial: ProjectFinancial,
  hasApprovedCoNotBilled: boolean,
  sqlBudgetConfirmed = false,
): MoneyMissingPrompt[] {
  const prompts: MoneyMissingPrompt[] = [];
  if (project.contractPending) {
    prompts.push({
      id: 'contract-pending',
      label: project.contractPendingNote ?? 'Pending — waiting on awarded contract / proposal amount.',
      actionLabel: 'Awaiting contract',
      view: 'summary',
    });
  } else if (isMissingContract(financial, project)) {
    prompts.push({
      id: 'missing-contract',
      label: 'Contract amount missing',
      actionLabel: 'Add contract amount',
      view: 'summary',
    });
  }
  if (isMissingRealBudget(financial)) {
    prompts.push({
      id: 'missing-budget',
      label: 'Budget not imported',
      actionLabel: 'Import budget',
      view: 'budget',
    });
  }
  if (financial.budgetIsEstimated && financial.currentContractAmount > 0 && !sqlBudgetConfirmed) {
    prompts.push({
      id: 'confirm-estimate',
      label: 'Budget is an 80% estimate — confirm or import a workbook',
      actionLabel: 'Confirm estimate',
      view: 'budget',
    });
  }
  return prompts.slice(0, 2);
}

export function deriveMoneyNextAction(input: {
  projectId: string;
  financial: ProjectFinancial;
  missingContract: boolean;
  missingRealBudget: boolean;
  hasApprovedCoNotBilled: boolean;
  arPastDue: number;
  arBalance: number;
  costOverBudget: boolean;
  subComplianceGap: boolean;
  qbReviewNeeded: boolean;
  isCloseout: boolean;
  sqlBudgetConfirmed?: boolean;
}): MoneyNextAction {
  const pid = input.projectId;
  const fin = input.financial;

  if (input.missingContract) {
    return { ...openFinancial(pid, 'summary'), label: 'Add contract amount', view: 'summary' };
  }
  if (input.missingRealBudget) {
    return { ...openFinancial(pid, 'budget'), label: 'Import budget', view: 'budget' };
  }
  if (fin.budgetIsEstimated && fin.currentContractAmount > 0 && !input.sqlBudgetConfirmed) {
    return { ...openFinancial(pid, 'budget'), label: 'Confirm 80% budget estimate', view: 'budget' };
  }
  if (input.costOverBudget) {
    return { ...openFinancial(pid, 'budget'), label: 'Review cost over budget', view: 'budget' };
  }
  if (input.subComplianceGap) {
    return { ...openFinancial(pid, 'pos'), label: 'Review subcontractor compliance', view: 'pos' };
  }
  if (input.qbReviewNeeded) {
    return { label: 'Review QuickBooks unmatched rows', route: '/settings', fragment: 'import-review', view: 'import-source' };
  }
  if (input.isCloseout && fin.retainageHeld > 0) {
    return { ...openFinancial(pid, 'billing'), label: 'Add retainage / closeout info', view: 'billing' };
  }
  return { label: 'On track', route: `/projects/${pid}`, view: 'summary' };
}

export function moneyOverviewCards(
  financial: ProjectFinancial,
  project?: Pick<Project, 'contractPending' | 'contractPendingNote'>,
): MoneyOverviewCard[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  const marginAlert = false;
  const arOrLeft = financial.arBalance > 0
    ? { label: 'Open AR', value: fmt(financial.arBalance), id: 'ar' as const }
    : { label: 'Left to Bill', value: fmt(financial.leftToBill), id: 'billing' as const };

  const contractValue = project?.contractPending
    ? (project.contractPendingNote ?? 'Pending')
    : fmt(financial.currentContractAmount);

  return [
    { id: 'contract', label: 'Contract', value: contractValue, subtext: project?.contractPending ? undefined : (financial.approvedChangeOrderAmount ? `+${fmt(financial.approvedChangeOrderAmount)} COs` : undefined) },
    { id: 'actual-cost', label: 'Actual Cost', value: fmt(financial.costToDate), subtext: `Est final ${fmt(financial.estimatedFinalCost)}` },
    { id: 'margin', label: 'Projected Margin', value: `${financial.forecastMargin.toFixed(1)}%`, subtext: fmt(financial.forecastGrossProfit) + ' profit', alert: marginAlert },
    { id: arOrLeft.id, label: arOrLeft.label, value: arOrLeft.value },
  ];
}

export function moneyCompactStats(
  financial: ProjectFinancial,
  nextActionLabel: string,
  approvedUnbilledCoCount: number,
  sqlBudgetConfirmed = false,
): MoneyCompactStat[] {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

  let budgetBasis = 'Missing';
  if (sqlBudgetConfirmed) budgetBasis = '80% confirmed (SQL)';
  else if (financial.budgetIsEstimated) budgetBasis = '80% estimate';
  else if (financial.budgetBasis === 'Imported' || financial.budgetBasis === 'Workbook') budgetBasis = 'Imported';
  else if (financial.budgetBasis === 'Manual') budgetBasis = 'Manual';

  return [
    { label: 'Budget Basis', value: budgetBasis, drawer: 'budget' },
    { label: 'Cost to Complete', value: fmt(financial.costToComplete), drawer: 'actual-cost' },
    { label: 'Over/Under Billing', value: fmt(financial.overUnderBilling), drawer: 'billing' },
    { label: 'Approved Unbilled COs', value: String(approvedUnbilledCoCount), drawer: 'billing' },
    { label: 'Next Action', value: nextActionLabel },
  ];
}

export function moneyMoreVisible(
  view: FinancialView,
  modules: ProjectEnabledModules,
  counts: { ar: number; qbCosts: number; bonus: number; subInvoices: number },
): boolean {
  if (modules.showAllTools) return true;
  if (modules.moneyMore.includes(view)) {
    switch (view) {
      case 'wip': return modules.moneyMore.includes('wip');
      case 'ar': return counts.ar > 0 || modules.moneyMore.includes('ar');
      case 'labor-bonus': return modules.moneyMore.includes('labor-bonus');
      case 'sub-invoices': return counts.subInvoices > 0 || modules.moneyMore.includes('sub-invoices');
      case 'cost-transactions':
      case 'import-source':
        return counts.qbCosts > 0 || modules.moneyMore.includes('cost-transactions');
      default: return true;
    }
  }
  return false;
}
