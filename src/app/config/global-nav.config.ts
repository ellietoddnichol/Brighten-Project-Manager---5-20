import { GlobalModuleBadge, GlobalModuleId } from '../models/global-enabled-modules.types';

export type GlobalNavSectionId =
  | 'home'
  | 'projects'
  | 'tasks'
  | 'financials'
  | 'documents'
  | 'directory'
  | 'settings';

export interface GlobalNavItemConfig {
  id: GlobalNavSectionId;
  label: string;
  route: string;
  icon: string;
  /** Badge sources — only urgent counts are shown in the sidebar. */
  badgeSources?: GlobalModuleId[];
  isActive: (path: string) => boolean;
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
    isActive: path => path === '/' || path === '/active-2026-control',
  },
  {
    id: 'projects',
    label: 'Projects',
    route: '/projects',
    icon: 'folder',
    isActive: path => pathMatches(path, '/projects'),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    route: '/tasks',
    icon: 'task_alt',
    badgeSources: ['tasks', 'changes'],
    isActive: path =>
      path === '/tasks'
      || pathMatches(path, '/tasks/board')
      || pathMatches(path, '/changes'),
  },
  {
    id: 'financials',
    label: 'Financials',
    route: '/financials',
    icon: 'payments',
    badgeSources: ['ar'],
    isActive: path =>
      pathMatches(path, '/financials')
      || pathMatches(path, '/wip')
      || pathMatches(path, '/ar')
      || pathMatches(path, '/billing')
      || pathMatches(path, '/pos')
      || pathMatches(path, '/foreman-bonuses')
      || pathMatches(path, '/labor'),
  },
  {
    id: 'documents',
    label: 'Documents',
    route: '/documents',
    icon: 'description',
    badgeSources: ['missing-required-docs'],
    isActive: path => pathMatches(path, '/documents'),
  },
  {
    id: 'directory',
    label: 'Directory',
    route: '/directory',
    icon: 'contacts',
    badgeSources: ['subcontractors'],
    isActive: path => pathMatches(path, '/directory') || pathMatches(path, '/subcontractors'),
  },
];

export const GLOBAL_SETTINGS_NAV: GlobalNavItemConfig = {
  id: 'settings',
  label: 'Settings',
  route: '/settings',
  icon: 'settings',
  isActive: path => pathMatches(path, '/settings'),
};

export interface HubLink {
  title: string;
  description: string;
  route: string;
  icon: string;
  queryParams?: Record<string, string>;
}

export const FINANCIALS_HUB_LINKS: HubLink[] = [
  { title: 'WIP', description: 'Earned revenue vs billed — job-level WIP review.', route: '/wip', icon: 'monitoring' },
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
