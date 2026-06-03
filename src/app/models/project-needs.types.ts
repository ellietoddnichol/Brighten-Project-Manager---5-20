import { ControlNextAction } from './active-2026-control.types';
import { ProjectProfile } from './project-requirements.types';
import { FinancialView, WorkflowView, FileView } from '@app/components/project/project-detail.types';

export type ProjectModuleId =
  | WorkflowView
  | FinancialView
  | FileView
  | 'safety'
  | 'inspections'
  | 'drive-mapping';

export interface ProjectEnabledModules {
  workPrimary: WorkflowView[];
  workMore: WorkflowView[];
  moneyPrimary: FinancialView[];
  moneyMore: FinancialView[];
  filesPrimary: FileView[];
  filesMore: FileView[];
  urgentModules: ProjectModuleId[];
  hiddenModules: ProjectModuleId[];
  profile?: ProjectProfile;
  showAllTools: boolean;
}

export interface ProjectNeedsInput {
  projectId: string;
  jobNumber?: string;
  projectProfile?: ProjectProfile;
  lifecycleGroup?: string;
  isActive2026: boolean;
  prevailingWage: boolean;
  certifiedPayrollRequired: boolean;
  bonusEligible: boolean;
  hasForemanAssignment: boolean;
  hasLaborBudget: boolean;
  hasDriveFolder: boolean;
  hasRFIs: boolean;
  hasSubmittals: boolean;
  hasDailyLogs: boolean;
  hasFieldIssues: boolean;
  hasOpenTasks: boolean;
  hasCPRRecords: boolean;
  hasSubs: boolean;
  hasPOs: boolean;
  hasSubcontractorCosts: boolean;
  hasSubInvoices: boolean;
  hasAR: boolean;
  hasBilling: boolean;
  hasQuickBooksDetailCosts: boolean;
  hasApprovedCoNotBilled: boolean;
  hasBonusRecords: boolean;
  requiresRfis: boolean;
  requiresSubmittals: boolean;
  requiresDailyLogs: boolean;
  hasMaterialScope: boolean;
  hasSafetyRecords: boolean;
  hasInspectionRecords: boolean;
  isCloseoutOrClosed: boolean;
  showAllTools: boolean;
}
