import { ControlNextAction } from './active-2026-control.types';

export type GlobalModuleId =
  | 'dashboard'
  | 'active-2026-control'
  | 'projects'
  | 'tasks'
  | 'changes'
  | 'rfis'
  | 'submittals'
  | 'daily-logs'
  | 'field-issues'
  | 'safety'
  | 'inspections'
  | 'certified-payroll'
  | 'wip'
  | 'ar'
  | 'billing'
  | 'pos'
  | 'cost-transactions'
  | 'sub-invoices'
  | 'import-source'
  | 'foreman-bonuses'
  | 'labor'
  | 'labor-actuals'
  | 'subcontractors'
  | 'documents'
  | 'drive-mapping'
  | 'generated-docs'
  | 'missing-required-docs'
  | 'import-review'
  | 'seed-completeness'
  | 'settings'
  | 'reports'
  | 'closeout'
  | 'labor-codes';

export type GlobalBadgeTone = 'urgent' | 'review' | 'neutral';

export interface GlobalModuleBadge {
  count: number;
  tone: GlobalBadgeTone;
}

export interface GlobalNavItem {
  id: GlobalModuleId;
  label: string;
  route: string;
  icon?: string;
  exact?: boolean;
  fragment?: string;
  queryParams?: Record<string, string>;
  badge?: GlobalModuleBadge;
}

export interface GlobalNavSubgroup {
  label: string;
  items: GlobalNavItem[];
}

export interface GlobalNavGroup {
  id: string;
  label: string;
  icon: string;
  items: GlobalNavItem[];
  subgroups?: GlobalNavSubgroup[];
}

export interface GlobalDashboardCard {
  id: string;
  label: string;
  value: string;
  subtext?: string;
  route: string;
  queryParams?: Record<string, string>;
  alert?: boolean;
  icon?: string;
}

export interface GlobalDashboardListItem {
  id: string;
  title: string;
  description: string;
  route: string;
  severity: 'warning' | 'error';
}

export interface GlobalEnabledModules {
  pinned: GlobalNavItem[];
  groups: GlobalNavGroup[];
  hiddenModules: GlobalModuleId[];
  urgentModules: GlobalModuleId[];
  badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>>;
  dashboardCards: GlobalDashboardCard[];
  dashboardList: GlobalDashboardListItem[];
  nextActions: ControlNextAction[];
  showAllTools: boolean;
}

export interface GlobalNeedsInput {
  active2026JobCount: number;
  atRiskJobCount: number;
  openArTotal: number;
  arPastDueCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  openChangeCount: number;
  changesNeedingActionCount: number;
  openRfiCount: number;
  overdueRfiCount: number;
  openSubmittalCount: number;
  overdueSubmittalCount: number;
  dailyLogCount: number;
  dailyLogsRequiredOnActiveJob: boolean;
  openFieldIssueCount: number;
  cprRequiredJobCount: number;
  prevailingWageJobCount: number;
  cprRecordCount: number;
  cprExceptionCount: number;
  safetyItemCount: number;
  inspectionItemCount: number;
  wipNeedsReviewCount: number;
  subComplianceGapCount: number;
  foremanBonusReviewCount: number;
  hasForemanBonusRecords: boolean;
  hasBonusEligibleJobs: boolean;
  importReviewExceptionCount: number;
  seedCompletenessIssueCount: number;
  hasQuickBooksDetailCosts: boolean;
  hasSubInvoices: boolean;
  hasGeneratedDocs: boolean;
  missingRequiredDocCount: number;
  hasLaborActuals: boolean;
  hasCloseoutJobs: boolean;
  hasSubsOrPos: boolean;
  billingActionCount: number;
  pinnedTools: GlobalModuleId[];
  showAllTools: boolean;
}
