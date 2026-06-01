import { ProjectNavState } from '../components/project/project-detail.types';
import { openFinancial, openUtility, openWorkflow } from '../components/project/project-navigation';
import { ActionItem } from './action-items';

export interface ActionItemNavHint {
  label: string;
  nav: ProjectNavState;
}

export function resolveActionItemNav(item: Pick<ActionItem, 'id' | 'type' | 'title'>): ActionItemNavHint {
  const nav = resolveNavState(item);
  return { label: navLabel(nav), nav };
}

function resolveNavState(item: Pick<ActionItem, 'id' | 'type' | 'title'>): ProjectNavState {
  const id = item.id;

  if (id.startsWith('cpr-wage-order') || id.startsWith('cpr-county') || id.startsWith('cpr-exceptions') || id.startsWith('cpr-final')) {
    return openWorkflow('certified-payroll');
  }
  if (id.startsWith('foreman-bonus')) return openFinancial('labor-bonus');
  if (id.startsWith('ar-') || id.startsWith('closeout-ar-')) return openFinancial('ar');
  if (id.startsWith('overbill-') || id.startsWith('wip-review') || id.startsWith('margin-')) return openFinancial('wip');
  if (id.startsWith('budget-') || id.startsWith('budget-est-') || id.startsWith('budget-over-')) return openFinancial('budget');
  if (id.startsWith('billed-over-') || id.startsWith('neg-ltb-') || id.startsWith('contract-')) return openFinancial('billing');
  if (id.startsWith('co-')) return openWorkflow('changes');
  if (id.startsWith('po-') || id.startsWith('sub-')) return openFinancial('pos');
  if (id.startsWith('labor-')) return openFinancial('budget');
  if (id.startsWith('addr-') || id.startsWith('start-')) return openUtility('setup');

  switch (item.type) {
    case 'Budget':
      return openFinancial('budget');
    case 'WIP':
      return openFinancial('wip');
    case 'Billing':
      return openFinancial('billing');
    case 'AR':
      return openFinancial('ar');
    case 'Certified Payroll':
      return openWorkflow('certified-payroll');
    case 'Foreman Bonus':
      return openFinancial('labor-bonus');
    case 'Cost':
    case 'Subcontractors':
      return openFinancial('pos');
    case 'CO':
      return openWorkflow('changes');
    case 'Schedule':
      return openUtility('schedule');
    case 'Labor':
      return openFinancial('budget');
    case 'Project Info':
    case 'Setup':
      return openUtility('setup');
    case 'Labor Code':
      return openFinancial('import-source');
    default:
      return openFinancial('summary');
  }
}

function navLabel(state: ProjectNavState): string {
  if (state.utilityView === 'setup') return 'Open setup';
  if (state.utilityView === 'schedule') return 'Open schedule';

  if (state.section === 'workflows') {
    switch (state.workflowView) {
      case 'certified-payroll': return 'Open certified payroll';
      case 'changes': return 'Open changes';
      default: return 'Open work';
    }
  }

  if (state.section === 'financials') {
    switch (state.financialView) {
      case 'budget': return 'Open budget';
      case 'wip': return 'Open WIP';
      case 'billing': return 'Open billing';
      case 'ar': return 'Open AR';
      case 'pos': return 'Open commitments';
      case 'labor-bonus': return 'Open foreman bonus';
      case 'import-source': return 'Open sources';
      default: return 'Open money';
    }
  }

  return 'Review';
}
