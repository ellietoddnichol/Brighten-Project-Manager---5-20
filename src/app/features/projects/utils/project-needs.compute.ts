import {

  ProjectEnabledModules,

  ProjectModuleId,

  ProjectNeedsInput,

} from '@app/models/project-needs.types';

import { FinancialView, FileView, WorkflowView } from '@app/components/project/project-detail.types';
import { shouldShowCertifiedPayroll } from '@features/labor/utils/certified-payroll-week';



const WORK_PRIMARY: WorkflowView[] = ['all-work', 'tasks', 'changes', 'field'];



function showRfis(input: ProjectNeedsInput): boolean {

  return input.showAllTools || input.hasRFIs || input.requiresRfis;

}



function showSubmittals(input: ProjectNeedsInput): boolean {

  return input.showAllTools

    || input.hasSubmittals

    || input.requiresSubmittals

    || input.hasMaterialScope;

}



function showCpr(input: ProjectNeedsInput): boolean {
  return shouldShowCertifiedPayroll(input);
}



function showDailyLogsInMore(input: ProjectNeedsInput): boolean {

  return input.showAllTools || input.hasDailyLogs || input.requiresDailyLogs;

}



function showFieldIssuesInMore(input: ProjectNeedsInput): boolean {

  return input.showAllTools || input.hasFieldIssues;

}



function showSafetyInMore(input: ProjectNeedsInput): boolean {

  return input.showAllTools || input.hasSafetyRecords;

}



function showInspectionsInMore(input: ProjectNeedsInput): boolean {

  return input.showAllTools || input.hasInspectionRecords;

}



function showWip(input: ProjectNeedsInput): boolean {
  return input.showAllTools || input.isActive2026;
}



function showForemanBonus(input: ProjectNeedsInput): boolean {

  return input.showAllTools

    || input.bonusEligible

    || input.hasForemanAssignment

    || input.hasLaborBudget

    || input.hasBonusRecords;

}



export function computeProjectEnabledModules(input: ProjectNeedsInput): ProjectEnabledModules {

  const workMore: WorkflowView[] = [];

  const urgent: ProjectModuleId[] = [];

  const hidden: ProjectModuleId[] = [];



  if (showRfis(input)) {

    workMore.push('rfis');

    if (input.hasRFIs) urgent.push('rfis');

  } else {

    hidden.push('rfis');

  }



  if (showSubmittals(input)) {

    workMore.push('submittals');

    if (input.hasSubmittals) urgent.push('submittals');

  } else {

    hidden.push('submittals');

  }



  if (showDailyLogsInMore(input)) workMore.push('daily-logs');

  else hidden.push('daily-logs');



  if (showFieldIssuesInMore(input)) workMore.push('field-issues');

  else hidden.push('field-issues');



  if (showCpr(input)) {

    workMore.push('certified-payroll');

    if (input.certifiedPayrollRequired && !input.hasCPRRecords) urgent.push('certified-payroll');

  } else {

    hidden.push('certified-payroll');

  }



  if (showSafetyInMore(input)) workMore.push('safety');

  else hidden.push('safety');



  if (showInspectionsInMore(input)) workMore.push('inspections');

  else hidden.push('inspections');



  const moneyPrimary: FinancialView[] = ['summary', 'budget', 'billing'];



  const showCommitments = input.showAllTools || input.hasSubs || input.hasPOs || input.hasSubcontractorCosts;

  if (showCommitments) moneyPrimary.push('pos');
  else hidden.push('pos');

  if (showWip(input)) moneyPrimary.push('wip');
  else hidden.push('wip');

  const moneyMore: FinancialView[] = [];



  if (input.showAllTools || input.hasAR) {

    moneyMore.push('ar');

    if (input.hasAR) urgent.push('ar');

  } else {

    hidden.push('ar');

  }



  if (showForemanBonus(input)) moneyMore.push('labor-bonus');

  else hidden.push('labor-bonus');



  if (input.showAllTools || input.hasSubInvoices || input.hasSubs) {

    moneyMore.push('sub-invoices');

  } else {

    hidden.push('sub-invoices');

  }



  if (input.showAllTools || input.hasQuickBooksDetailCosts) {

    moneyMore.push('cost-transactions', 'import-source');

  } else {

    hidden.push('cost-transactions', 'import-source');

  }



  const filesPrimary: FileView[] = ['all', 'required', 'generated', 'uploads'];

  const filesMore: FileView[] = ['contracts', 'change-orders', 'billing', 'drive-mapping'];



  if (input.showAllTools || input.certifiedPayrollRequired || input.hasCPRRecords) {

    filesMore.push('cpr');

  } else {

    hidden.push('cpr');

  }



  if (input.showAllTools || input.hasSubs || input.hasSubcontractorCosts) {

    filesMore.push('subs', 'insurance', 'lien-waivers');

  } else {

    hidden.push('subs', 'insurance', 'lien-waivers');

  }



  if (showSubmittals(input)) filesMore.push('submittals');

  else hidden.push('submittals');



  if (input.showAllTools || input.isCloseoutOrClosed) filesMore.push('closeout');

  else hidden.push('closeout');



  if (!input.hasDriveFolder && input.isActive2026) urgent.push('drive-mapping');



  if (input.hasApprovedCoNotBilled) urgent.push('billing');

  if (input.hasOpenTasks) urgent.push('tasks');



  return {

    workPrimary: WORK_PRIMARY,

    workMore,

    moneyPrimary,

    moneyMore,

    filesPrimary,

    filesMore,

    urgentModules: urgent,

    hiddenModules: hidden,

    profile: input.projectProfile,

    showAllTools: input.showAllTools,

  };

}



export function workflowChipVisible(

  chipId: WorkflowView | 'billing' | 'certified-payroll',

  modules: ProjectEnabledModules,

  count: number,

  urgent: boolean,

): boolean {

  if (modules.showAllTools) return true;

  if (count > 0) return true;

  if (urgent) return true;

  if (chipId === 'billing') return count > 0;

  if (chipId === 'certified-payroll') return modules.workMore.includes('certified-payroll');

  if (chipId === 'changes') return true;

  if (chipId === 'tasks') return true;

  if (chipId === 'field') return count > 0;

  return !modules.hiddenModules.includes(chipId);

}



export function emptyModuleMessage(moduleId: ProjectModuleId): string {

  switch (moduleId) {

    case 'daily-logs':

      return 'Nothing needed here right now. Daily logs are hidden until records exist or you enable Show all tools.';

    case 'field-issues':

      return 'Nothing needed here right now. Field issues appear when records exist.';

    case 'rfis':

      return 'RFIs are hidden because this job profile does not require them yet.';

    case 'submittals':

      return 'Submittals are hidden because this job profile does not require them.';

    case 'certified-payroll':

    case 'cpr':

      return 'CPR is not required for this project.';

    case 'safety':

      return 'Safety items appear when safety records exist on this job.';

    case 'inspections':

      return 'Inspections appear when inspection records exist on this job.';

    case 'pos':

      return 'No subcontractors are required for this job.';

    case 'labor-bonus':

      return 'Foreman bonus is not applicable for this job.';

    case 'ar':

      return 'No open AR on this project.';

    case 'wip':

      return 'WIP detail is available for active jobs only.';

    default:

      return 'Nothing needed here right now.';

  }

}


