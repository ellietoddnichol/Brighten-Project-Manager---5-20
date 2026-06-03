import {
  GlobalDashboardCard,
  GlobalDashboardListItem,
  GlobalEnabledModules,
  GlobalModuleBadge,
  GlobalModuleId,
  GlobalNavGroup,
  GlobalNavItem,
  GlobalNeedsInput,
} from '@app/models/global-enabled-modules.types';
import { isPinned } from '@shared/utils/global-pinned-tools';

function badge(count: number, tone: GlobalModuleBadge['tone']): GlobalModuleBadge | undefined {
  if (count <= 0) return undefined;
  return { count, tone };
}

function withBadge(item: GlobalNavItem, badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>>): GlobalNavItem {
  const b = badges[item.id];
  return b ? { ...item, badge: b } : item;
}

function nav(
  id: GlobalModuleId,
  label: string,
  route: string,
  opts: Partial<GlobalNavItem> = {},
): GlobalNavItem {
  return { id, label, route, ...opts };
}

const NAV: Record<GlobalModuleId, GlobalNavItem> = {
  dashboard: nav('dashboard', 'Home', '/', { exact: true }),
  'active-2026-control': nav('active-2026-control', 'Active 2026 Control', '/active-2026-control'),
  projects: nav('projects', 'Active 2026 Jobs', '/projects'),
  tasks: nav('tasks', 'Tasks', '/tasks'),
  changes: nav('changes', 'Changes', '/changes'),
  rfis: nav('rfis', 'RFIs', '/rfis'),
  submittals: nav('submittals', 'Submittals', '/submittals'),
  'daily-logs': nav('daily-logs', 'Daily Logs', '/daily-logs'),
  'field-issues': nav('field-issues', 'Field Issues', '/field-issues'),
  safety: nav('safety', 'Safety', '/field-issues'),
  inspections: nav('inspections', 'Inspections', '/daily-logs'),
  'certified-payroll': nav('certified-payroll', 'Certified Payroll', '/certified-payroll'),
  wip: nav('wip', 'WIP', '/wip'),
  ar: nav('ar', 'AR', '/ar'),
  billing: nav('billing', 'Billing', '/billing'),
  pos: nav('pos', 'Purchase Orders', '/pos'),
  'cost-transactions': nav('cost-transactions', 'Cost Transactions', '/wip'),
  'sub-invoices': nav('sub-invoices', 'Sub Invoices', '/subcontractors'),
  'import-source': nav('import-source', 'Import Source Detail', '/settings', { fragment: 'import-review' }),
  'foreman-bonuses': nav('foreman-bonuses', 'Foreman Bonuses', '/foreman-bonuses'),
  labor: nav('labor', 'Labor Overview', '/labor'),
  'labor-actuals': nav('labor-actuals', 'Labor Actuals', '/labor-actuals'),
  subcontractors: nav('subcontractors', 'Subcontractors', '/subcontractors'),
  documents: nav('documents', 'Project Files', '/documents'),
  'drive-mapping': nav('drive-mapping', 'Drive Links / Mapping', '/settings', { fragment: 'drive-folders' }),
  'generated-docs': nav('generated-docs', 'Generated Documents', '/documents'),
  'missing-required-docs': nav('missing-required-docs', 'Missing Required Docs', '/documents'),
  'import-review': nav('import-review', 'Import Review', '/settings', { fragment: 'import-review' }),
  'seed-completeness': nav('seed-completeness', 'Setup Completeness', '/settings', { fragment: 'setup-completeness' }),
  settings: nav('settings', 'Settings', '/settings'),
  reports: nav('reports', 'Reports', '/reports'),
  closeout: nav('closeout', 'Closeout', '/projects', { queryParams: { view: 'closeout' } }),
  'labor-codes': nav('labor-codes', 'Labor Codes', '/settings', { fragment: 'labor-codes' }),
};

export function globalNavLabel(id: GlobalModuleId): string {
  if (id === 'dashboard') return 'Home';
  return NAV[id]?.label ?? id;
}

export function isGlobalModuleVisible(id: GlobalModuleId, input: GlobalNeedsInput): boolean {
  if (input.showAllTools) return true;
  if (isPinned(id, input.pinnedTools)) return true;

  switch (id) {
    case 'dashboard':
    case 'active-2026-control':
    case 'projects':
    case 'tasks':
    case 'changes':
    case 'wip':
    case 'ar':
    case 'billing':
    case 'documents':
    case 'drive-mapping':
    case 'labor':
    case 'subcontractors':
    case 'settings':
      return true;

    case 'rfis':
      return input.openRfiCount > 0 || input.overdueRfiCount > 0;
    case 'submittals':
      return input.openSubmittalCount > 0 || input.overdueSubmittalCount > 0;
    case 'daily-logs':
      return input.dailyLogCount > 0 || input.dailyLogsRequiredOnActiveJob;
    case 'field-issues':
      return input.openFieldIssueCount > 0;
    case 'safety':
      return input.safetyItemCount > 0;
    case 'inspections':
      return input.inspectionItemCount > 0;
    case 'certified-payroll':
      return false;

    case 'foreman-bonuses':
      return input.hasForemanBonusRecords || input.hasBonusEligibleJobs || input.foremanBonusReviewCount > 0;
    case 'labor-actuals':
      return input.hasLaborActuals;
    case 'pos':
      return input.hasSubsOrPos;
    case 'cost-transactions':
    case 'import-source':
      return input.hasQuickBooksDetailCosts;
    case 'sub-invoices':
      return input.hasSubInvoices || input.hasSubsOrPos;

    case 'generated-docs':
      return input.hasGeneratedDocs;
    case 'missing-required-docs':
      return input.missingRequiredDocCount > 0;
    case 'import-review':
      return input.importReviewExceptionCount > 0;
    case 'seed-completeness':
      return input.seedCompletenessIssueCount > 0;
    case 'closeout':
      return input.hasCloseoutJobs;
    case 'reports':
    case 'labor-codes':
      return false;

    default:
      return false;
  }
}

function buildBadges(input: GlobalNeedsInput): Partial<Record<GlobalModuleId, GlobalModuleBadge>> {
  const badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>> = {};
  const set = (id: GlobalModuleId, count: number, tone: GlobalModuleBadge['tone']) => {
    const b = badge(count, tone);
    if (b) badges[id] = b;
  };

  set('tasks', input.overdueTaskCount, 'urgent');
  set('changes', input.changesNeedingActionCount, input.changesNeedingActionCount > 0 ? 'review' : 'neutral');
  set('rfis', input.overdueRfiCount || input.openRfiCount, input.overdueRfiCount > 0 ? 'urgent' : 'review');
  set('submittals', input.overdueSubmittalCount || input.openSubmittalCount, input.overdueSubmittalCount > 0 ? 'urgent' : 'review');
  set('field-issues', input.openFieldIssueCount, input.openFieldIssueCount > 0 ? 'urgent' : 'neutral');
  set('subcontractors', input.subComplianceGapCount, input.subComplianceGapCount > 0 ? 'urgent' : 'review');
  set('missing-required-docs', input.missingRequiredDocCount, 'review');

  return badges;
}

function buildUrgentModules(input: GlobalNeedsInput): GlobalModuleId[] {
  const urgent: GlobalModuleId[] = [];
  if (input.overdueTaskCount > 0) urgent.push('tasks');
  if (input.changesNeedingActionCount > 0) urgent.push('changes');
  if (input.overdueRfiCount > 0) urgent.push('rfis');
  if (input.openFieldIssueCount > 0) urgent.push('field-issues');
  return urgent;
}

function buildDashboard(input: GlobalNeedsInput): {
  cards: GlobalDashboardCard[];
  list: GlobalDashboardListItem[];
} {
  const cards: GlobalDashboardCard[] = [
    {
      id: 'active-jobs',
      label: 'Active Jobs',
      value: String(input.active2026JobCount),
      route: '/active-2026-control',
      icon: 'work',
    },
    {
      id: 'at-risk',
      label: 'Critical Risk',
      value: String(input.atRiskJobCount),
      subtext: input.atRiskJobCount ? 'Needs attention' : undefined,
      route: '/active-2026-control',
      queryParams: { segment: 'criticalRisk' },
      alert: input.atRiskJobCount > 0,
      icon: 'warning',
    },
    {
      id: 'open-ar',
      label: 'Open AR',
      value: fmtCurrency(input.openArTotal),
      route: '/ar',
      icon: 'receipt_long',
    },
    {
      id: 'billing-actions',
      label: 'Billing Actions',
      value: String(input.billingActionCount),
      subtext: input.billingActionCount ? 'Jobs need billing follow-up' : undefined,
      route: '/billing',
      alert: input.billingActionCount > 0,
      icon: 'payments',
    },
  ];

  const list: GlobalDashboardListItem[] = [];

  if (input.overdueTaskCount > 0) {
    list.push({
      id: 'overdue-tasks',
      title: `${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? '' : 's'}`,
      description: 'Review open tasks across active jobs',
      route: '/tasks/board',
      severity: 'error',
    });
  }
  if (input.changesNeedingActionCount > 0) {
    list.push({
      id: 'changes-action',
      title: `${input.changesNeedingActionCount} change${input.changesNeedingActionCount === 1 ? '' : 's'} need action`,
      description: 'Pricing, approval, or billing follow-up',
      route: '/changes',
      severity: 'warning',
    });
  }

  return { cards, list: list.slice(0, 8) };
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function filterItems(ids: GlobalModuleId[], input: GlobalNeedsInput, badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>>): GlobalNavItem[] {
  return ids
    .filter(id => isGlobalModuleVisible(id, input))
    .map(id => withBadge(NAV[id], badges));
}

function filterSubgroup(label: string, ids: GlobalModuleId[], input: GlobalNeedsInput, badges: Partial<Record<GlobalModuleId, GlobalModuleBadge>>) {
  const items = filterItems(ids, input, badges);
  return items.length ? { label, items } : null;
}

function withoutPinned(items: GlobalNavItem[], pinnedSet: Set<GlobalModuleId>): GlobalNavItem[] {
  return items.filter(i => !pinnedSet.has(i.id));
}

function dedupeGroup(group: GlobalNavGroup, pinnedSet: Set<GlobalModuleId>): GlobalNavGroup {
  const subgroups = group.subgroups
    ?.map(sub => {
      const items = withoutPinned(sub.items, pinnedSet);
      return items.length ? { ...sub, items } : null;
    })
    .filter((s): s is NonNullable<typeof s> => !!s);
  return {
    ...group,
    items: withoutPinned(group.items, pinnedSet),
    subgroups: subgroups?.length ? subgroups : undefined,
  };
}

export function computeGlobalEnabledModules(input: GlobalNeedsInput): GlobalEnabledModules {
  const badges = buildBadges(input);
  const urgentModules = buildUrgentModules(input);
  const { cards, list } = buildDashboard(input);

  const pinnedIds: GlobalModuleId[] = [...new Set(input.pinnedTools)];
  const pinnedSet = new Set(pinnedIds);

  const pinned: GlobalNavItem[] = pinnedIds.map(id => {
    const item = id === 'dashboard'
      ? { ...NAV.dashboard, label: 'Dashboard', icon: 'dashboard' }
      : { ...NAV[id], icon: pinIcon(id) };
    return withBadge(item, badges);
  });

  const workMoreIds: GlobalModuleId[] = [
    'rfis', 'submittals', 'daily-logs', 'field-issues', 'safety', 'inspections',
  ];
  const workItems = filterItems(['tasks', 'changes'], input, badges);
  const workMore = filterItems(workMoreIds, input, badges);

  const financialItems = filterItems(
    ['active-2026-control', 'wip', 'ar', 'billing', 'foreman-bonuses', 'pos', 'cost-transactions', 'sub-invoices'],
    input,
    badges,
  );

  const documentItems = filterItems(
    ['documents', 'drive-mapping', 'generated-docs', 'missing-required-docs'],
    input,
    badges,
  );

  const moreSubgroups = [
    filterSubgroup('Work Tools', workMoreIds, input, badges),
    filterSubgroup('Labor', ['labor', 'labor-actuals', 'foreman-bonuses', 'labor-codes'], input, badges),
    filterSubgroup('Financials', ['pos', 'cost-transactions', 'sub-invoices'], input, badges),
    filterSubgroup('Documents', ['generated-docs', 'missing-required-docs', 'closeout'], input, badges),
    filterSubgroup('Projects', ['closeout'], input, badges),
    filterSubgroup('Imports', ['import-review', 'seed-completeness'], input, badges),
    filterSubgroup('Settings', ['settings', 'reports'], input, badges),
  ].filter((g): g is NonNullable<typeof g> => !!g);

  const groups: GlobalNavGroup[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      items: filterItems(['active-2026-control', 'dashboard'], input, badges),
    },
    {
      id: 'projects',
      label: 'Projects',
      icon: 'folder',
      items: [
        withBadge(NAV.projects, badges),
        withBadge(nav('ar', 'Closeout AR', '/ar', { queryParams: { view: 'closeout' } }), badges),
        withBadge(nav('projects', 'Archive / All', '/projects', { queryParams: { view: 'all' } }), badges),
      ],
    },
    {
      id: 'work',
      label: 'Work',
      icon: 'construction',
      items: workItems,
      subgroups: workMore.length ? [{ label: 'More Tools', items: workMore }] : undefined,
    },
    {
      id: 'financials',
      label: 'Financials',
      icon: 'account_balance',
      items: financialItems,
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: 'description',
      items: documentItems,
    },
    {
      id: 'more',
      label: 'More',
      icon: 'more_horiz',
      items: filterItems(['labor', 'subcontractors', 'import-review', 'seed-completeness', 'settings'], input, badges),
      subgroups: moreSubgroups.length ? moreSubgroups : undefined,
    },
  ].map(g => dedupeGroup(g, pinnedSet));

  const allIds = Object.keys(NAV) as GlobalModuleId[];
  const hiddenModules = allIds.filter(id => !isGlobalModuleVisible(id, input));

  return {
    pinned,
    groups,
    hiddenModules,
    urgentModules,
    badges,
    dashboardCards: cards,
    dashboardList: list,
    nextActions: list.slice(0, 3).map(item => ({ label: item.title, route: item.route })),
    showAllTools: input.showAllTools,
  };
}

function pinIcon(id: GlobalModuleId): string {
  switch (id) {
    case 'dashboard': return 'dashboard';
    case 'projects': return 'folder';
    case 'tasks': return 'construction';
    case 'wip': return 'account_balance';
    case 'ar': return 'receipt_long';
    case 'billing': return 'payments';
    case 'certified-payroll': return 'health_and_safety';
    case 'subcontractors': return 'engineering';
    case 'foreman-bonuses': return 'military_tech';
    case 'import-review': return 'sync_problem';
    case 'labor': return 'groups';
    case 'documents': return 'description';
    case 'rfis': return 'help_outline';
    case 'submittals': return 'inventory_2';
    case 'changes': return 'sync_alt';
    case 'active-2026-control': return 'monitoring';
    default: return 'push_pin';
  }
}

export function globalModuleHiddenMessage(id: GlobalModuleId): string {
  return 'This tool is hidden from the main sidebar because there are no active items right now.';
}

export function routeToGlobalModuleId(path: string, fragment?: string | null): GlobalModuleId | null {
  const clean = path.replace(/^\//, '').split('?')[0];
  if (!clean || clean === '') return 'dashboard';
  if (clean === 'active-2026-control') return 'active-2026-control';
  if (clean === 'projects') return 'projects';
  if (clean === 'tasks') return 'tasks';
  if (clean === 'changes') return 'changes';
  if (clean === 'rfis') return 'rfis';
  if (clean === 'submittals') return 'submittals';
  if (clean === 'daily-logs') return 'daily-logs';
  if (clean === 'field-issues') return 'field-issues';
  if (clean === 'certified-payroll') return 'certified-payroll';
  if (clean === 'wip') return 'wip';
  if (clean === 'ar') return 'ar';
  if (clean === 'billing') return 'billing';
  if (clean === 'pos') return 'pos';
  if (clean === 'foreman-bonuses') return 'foreman-bonuses';
  if (clean === 'labor') return 'labor';
  if (clean === 'labor-actuals') return 'labor-actuals';
  if (clean === 'subcontractors') return 'subcontractors';
  if (clean === 'documents') return 'documents';
  if (clean === 'reports') return 'reports';
  if (clean === 'settings') {
    if (fragment === 'import-review') return 'import-review';
    if (fragment === 'seed-completeness') return 'seed-completeness';
    if (fragment === 'drive-folders') return 'drive-mapping';
    if (fragment === 'labor-codes') return 'labor-codes';
    return 'settings';
  }
  return null;
}
