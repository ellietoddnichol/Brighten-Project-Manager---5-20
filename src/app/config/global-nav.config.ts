import { GlobalModuleBadge, GlobalModuleId } from '@app/models/global-enabled-modules.types';

export type GlobalNavSectionId =
  | 'home'
  | 'jobs'
  | 'money'
  | 'field'
  | 'documents'
  | 'people'
  | 'payroll'
  | 'settings';

export type GlobalNavGroupId =
  | 'command'
  | 'operations'
  | 'money'
  | 'field'
  | 'people'
  | 'admin';

export interface GlobalNavItemConfig {
  id: GlobalNavSectionId;
  label: string;
  route: string;
  icon: string;
  group: GlobalNavGroupId;
  /** Badge sources. Only urgent and review counts are shown in the sidebar. */
  badgeSources?: GlobalModuleId[];
  isActive: (path: string) => boolean;
}

export interface GlobalNavGroupConfig {
  id: GlobalNavGroupId;
  label: string;
}

function pathMatches(path: string, prefix: string): boolean {
  if (prefix === '/') return path === '/';
  return path === prefix || path.startsWith(`${prefix}/`);
}

export const GLOBAL_MAIN_NAV: GlobalNavItemConfig[] = [
  {
    id: 'home',
    label: 'Home',
    route: '/',
    icon: 'home',
    group: 'command',
    isActive: path => path === '/' || path === '/active-2026-control',
  },
  {
    id: 'jobs',
    label: 'Projects',
    route: '/projects',
    icon: 'folder',
    group: 'operations',
    badgeSources: ['active-2026-control'],
    isActive: path =>
      pathMatches(path, '/projects')
      || pathMatches(path, '/active-2026-control'),
  },
  {
    id: 'money',
    label: 'Financials',
    route: '/financials',
    icon: 'payments',
    group: 'money',
    badgeSources: ['ar', 'billing', 'wip', 'pos'],
    isActive: path =>
      pathMatches(path, '/financials')
      || pathMatches(path, '/wip')
      || pathMatches(path, '/ar')
      || pathMatches(path, '/billing')
      || pathMatches(path, '/pos'),
  },
  {
    id: 'field',
    label: 'Tasks',
    route: '/tasks',
    icon: 'assignment',
    group: 'field',
    badgeSources: ['tasks', 'changes', 'rfis', 'submittals', 'daily-logs', 'field-issues'],
    isActive: path =>
      path === '/tasks'
      || pathMatches(path, '/tasks/board')
      || pathMatches(path, '/changes')
      || pathMatches(path, '/rfis')
      || pathMatches(path, '/submittals')
      || pathMatches(path, '/daily-logs')
      || pathMatches(path, '/field-issues'),
  },
  {
    id: 'documents',
    label: 'Documents',
    route: '/documents',
    icon: 'description',
    group: 'field',
    badgeSources: ['missing-required-docs'],
    isActive: path => pathMatches(path, '/documents'),
  },
  {
    id: 'people',
    label: 'Directory & Compliance',
    route: '/directory',
    icon: 'contacts',
    group: 'people',
    badgeSources: ['subcontractors', 'sub-invoices', 'certified-payroll', 'labor', 'labor-actuals'],
    isActive: path =>
      pathMatches(path, '/directory')
      || pathMatches(path, '/subcontractors')
      || pathMatches(path, '/certified-payroll')
      || pathMatches(path, '/labor-actuals')
      || pathMatches(path, '/labor'),
  },
];

export const GLOBAL_SETTINGS_NAV: GlobalNavItemConfig = {
  id: 'settings',
  label: 'Admin',
  route: '/settings',
  icon: 'settings',
  group: 'admin',
  isActive: path => pathMatches(path, '/settings'),
};

export const GLOBAL_NAV_GROUPS: GlobalNavGroupConfig[] = [
  { id: 'command', label: 'Command' },
  { id: 'operations', label: 'Operations' },
  { id: 'money', label: 'Financials' },
  { id: 'field', label: 'Field Ops' },
  { id: 'people', label: 'Directory & Compliance' },
];

export interface HubLink {
  title: string;
  description: string;
  route: string;
  icon: string;
  queryParams?: Record<string, string>;
}

export const FINANCIALS_HUB_LINKS: HubLink[] = [
  { title: 'WIP', description: 'Earned revenue vs billed - job-level WIP review.', route: '/wip', icon: 'monitoring' },
  { title: 'Accounts Receivable', description: 'Open invoices, aging, and collections follow-up.', route: '/ar', icon: 'receipt_long' },
  { title: 'Billing', description: 'Pay apps, billing status, and left-to-bill.', route: '/billing', icon: 'request_quote' },
  { title: 'Purchase Orders', description: 'Purchase orders and committed costs.', route: '/pos', icon: 'shopping_cart' },
  { title: 'Foreman Bonuses', description: 'Bonus eligibility, calculations, and exports.', route: '/foreman-bonuses', icon: 'military_tech' },
];

export const DIRECTORY_HUB_LINKS: HubLink[] = [
  { title: 'Subcontractors', description: 'Sub compliance, agreements, and project assignments.', route: '/subcontractors', icon: 'engineering' },
  { title: 'Vendors', description: 'Vendor balances and AP-related contacts.', route: '/subcontractors', icon: 'storefront', queryParams: { view: 'directory' } },
  { title: 'Customers', description: 'Job customers synced from projects and QuickBooks.', route: '/projects', icon: 'business' },
  { title: 'Employees & Contacts', description: 'PMs, supers, and key job contacts from project records.', route: '/projects', icon: 'groups' },
];

export const TASKS_HUB_LINKS: HubLink[] = [
  { title: 'Task Board', description: 'Manually added open tasks across active jobs.', route: '/tasks/board', icon: 'checklist' },
  { title: 'Changes', description: 'Change requests and orders needing pricing, approval, or billing.', route: '/changes', icon: 'sync_alt' },
];

export function sidebarBadgeForNavItem(
  item: GlobalNavItemConfig,
  badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>>,
): GlobalModuleBadge | undefined {
  if (!item.badgeSources?.length) return undefined;
  let urgentTotal = 0;
  let reviewTotal = 0;
  for (const id of item.badgeSources) {
    const b = badges[id];
    if (!b || b.count <= 0) continue;
    if (b.tone === 'urgent') urgentTotal += b.count;
    else if (b.tone === 'review') reviewTotal += b.count;
  }
  if (urgentTotal > 0) return { count: urgentTotal, tone: 'urgent' };
  if (reviewTotal > 0) return { count: reviewTotal, tone: 'review' };
  return undefined;
}
