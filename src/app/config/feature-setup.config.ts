export type FeatureSetupStatus =
  | 'Active'
  | 'HiddenForNow'
  | 'NeedsVerification'
  | 'NeedsMigration'
  | 'NextUp';

export interface FeatureSetupEntry {
  id: string;
  label: string;
  status: FeatureSetupStatus;
  description: string;
  route?: string;
  fragment?: string;
}

export const FEATURE_SETUP_MATRIX: FeatureSetupEntry[] = [
  {
    id: 'work-comp-audit',
    label: 'Work Comp Audit',
    status: 'HiddenForNow',
    description: 'CSV export on Labor pages. Enable via Show all tools or Settings when audit mode is needed.',
  },
  {
    id: 'certified-payroll',
    label: 'Certified Payroll',
    status: 'Active',
    description: 'Prevailing wage CPR hub — ADP import, weekly drafts, review, and WH-347 print forms.',
    route: '/certified-payroll',
  },
  {
    id: 'daily-logs',
    label: 'Daily Logs',
    status: 'HiddenForNow',
    description: 'Hidden until records exist or Show all tools.',
    route: '/daily-logs',
  },
  {
    id: 'field-issues',
    label: 'Field Issues',
    status: 'HiddenForNow',
    description: 'Hidden until open field issues exist.',
    route: '/field-issues',
  },
  {
    id: 'safety',
    label: 'Safety',
    status: 'HiddenForNow',
    description: 'Hidden until safety records exist.',
  },
  {
    id: 'inspections',
    label: 'Inspections',
    status: 'HiddenForNow',
    description: 'Hidden until inspection records exist.',
  },
  {
    id: 'rfis',
    label: 'RFIs',
    status: 'HiddenForNow',
    description: 'Hidden unless open/overdue RFIs or Show all tools.',
    route: '/rfis',
  },
  {
    id: 'submittals',
    label: 'Submittals',
    status: 'HiddenForNow',
    description: 'Hidden unless open/overdue submittals or Show all tools.',
    route: '/submittals',
  },
  {
    id: 'quickbooks-sync',
    label: 'QuickBooks Sync',
    status: 'NeedsVerification',
    description: 'Live accounting sync from QB Project Mgmt workbook.',
    route: '/settings',
    fragment: 'sync-health',
  },
  {
    id: 'ar',
    label: 'AR',
    status: 'NeedsVerification',
    description: 'Normalized AR records from pay apps and QB aging.',
    route: '/ar',
  },
  {
    id: 'subcontractor-discovery',
    label: 'Subcontractor Discovery',
    status: 'NeedsVerification',
    description: 'Discover vendors from QuickBooks sync workbook and Drive Subs folders.',
    route: '/subcontractors',
  },
  {
    id: 'drive-mapping',
    label: 'Drive Storage / Mapping',
    status: 'NeedsVerification',
    description: 'Files in Drive; metadata in Firestore project-files.',
    route: '/settings',
    fragment: 'drive-folders',
  },
  {
    id: 'labor-codes',
    label: 'Labor Code Discovery',
    status: 'NeedsVerification',
    description: 'Discover codes from Master Time Sheet; mappings drive WIP, bonus, and CPR rules.',
    route: '/settings',
    fragment: 'labor-codes',
  },
  {
    id: 'foreman-bonus',
    label: 'Foreman Bonus',
    status: 'NeedsVerification',
    description: 'Bonus labor = approved wages + fringe on bonus-eligible codes only.',
    route: '/foreman-bonuses',
  },
  {
    id: 'budget-import',
    label: 'Budget Workbook Import',
    status: 'NextUp',
    description: 'Next phase — import actual job budget workbooks into Firestore. Not started yet.',
    route: '/settings',
    fragment: 'advanced',
  },
  {
    id: 'import-review-storage',
    label: 'Source Review exceptions',
    status: 'NeedsMigration',
    description: 'Import exceptions and run log are localStorage-only today — Firestore migration planned.',
    route: '/settings',
    fragment: 'import-review',
  },
  {
    id: 'qb-sync-cache',
    label: 'QuickBooks sync cache',
    status: 'NeedsMigration',
    description: 'QB workbook sync cache is localStorage today — normalized AR/cost rows migrate to Firestore over time.',
    route: '/settings',
    fragment: 'sync-health',
  },
  {
    id: 'labor-module-cache',
    label: 'Labor module sheet cache',
    status: 'NeedsMigration',
    description: 'Temporary UI cache for labor sheet refresh — source of truth is Master Time Sheet + Firestore.',
    route: '/settings',
    fragment: 'labor-codes',
  },
];

export const WORK_COMP_AUDIT_STORAGE_KEY = 'brighten.workCompAuditEnabled';

export function isWorkCompAuditEnabled(): boolean {
  try {
    return localStorage.getItem(WORK_COMP_AUDIT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setWorkCompAuditEnabled(value: boolean): void {
  try {
    localStorage.setItem(WORK_COMP_AUDIT_STORAGE_KEY, value ? 'true' : 'false');
  } catch { /* ignore */ }
}

export function shouldShowWorkCompAudit(input: {
  showAllTools?: boolean;
  auditModeEnabled?: boolean;
  pinned?: boolean;
}): boolean {
  return !!(input.showAllTools || input.auditModeEnabled || input.pinned);
}

export function featureSetupByStatus(status: FeatureSetupStatus): FeatureSetupEntry[] {
  return FEATURE_SETUP_MATRIX.filter(e => e.status === status);
}
