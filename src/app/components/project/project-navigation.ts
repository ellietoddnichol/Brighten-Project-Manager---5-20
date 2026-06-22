import {
  FileView,
  FinancialView,
  ProjectNavState,
  ProjectPrimarySection,
  UtilityView,
  WorkflowView,
} from './project-detail.types';

const PRIMARY_SECTIONS = new Set<ProjectPrimarySection>([
  'overview',
  'labor',
  'materials',
  'changes',
  'documents',
  'todos',
  'activities',
  'subs',
  'financials',
]);

const FINANCIAL_VIEWS = new Set<FinancialView>([
  'summary',
  'budget',
  'pos',
  'billing',
  'wip',
  'ar',
  'labor-bonus',
  'sub-invoices',
  'cost-transactions',
  'import-source',
]);

const LEGACY_TAB_MAP: Record<string, Partial<ProjectNavState>> = {
  overview: { section: 'overview' },
  labor: { section: 'labor' },
  materials: { section: 'materials' },
  changes: { section: 'changes' },
  documents: { section: 'documents' },
  todos: { section: 'todos' },
  activities: { section: 'activities' },
  subs: { section: 'subs' },
  financials: { section: 'financials' },
  tasks: { section: 'todos', workflowView: 'tasks' },
  co: { section: 'changes' },
  billing: { section: 'financials', financialView: 'billing' },
  budget: { section: 'financials', financialView: 'budget' },
  rfis: { section: 'todos', workflowView: 'rfis' },
  submittals: { section: 'todos', workflowView: 'submittals' },
  'daily-logs': { section: 'todos', workflowView: 'daily-logs' },
  'field-issues': { section: 'todos', workflowView: 'field-issues' },
  'certified-payroll': { section: 'todos', workflowView: 'certified-payroll' },
  pos: { section: 'financials', financialView: 'pos' },
  wip: { section: 'financials', financialView: 'wip' },
  ar: { section: 'financials', financialView: 'ar' },
  'labor-bonus': { section: 'financials', financialView: 'labor-bonus' },
  'import-source': { section: 'financials', financialView: 'import-source' },
  'drive-mapping': { section: 'documents', fileView: 'drive-mapping' },
  setup: { section: 'overview', utilityView: 'setup' },
  files: { section: 'documents', utilityView: 'files' },
  issues: { section: 'todos', workflowView: 'tasks' },
  schedule: { section: 'overview', utilityView: 'schedule' },
};

const LEGACY_SECTION_MAP: Record<string, ProjectPrimarySection> = {
  workflows: 'todos',
  financials: 'financials',
};

export function normalizeWorkflowView(view: WorkflowView): WorkflowView {
  return view === 'dashboard' ? 'all-work' : view;
}

export function defaultNavState(): ProjectNavState {
  return {
    section: 'overview',
    workflowView: 'all-work',
    financialView: 'summary',
    fileView: 'all',
    utilityView: null,
  };
}

export function resolveNavFromQuery(
  tab: string | null,
  section: string | null,
  view: string | null,
): ProjectNavState {
  const base = defaultNavState();

  if (tab && LEGACY_TAB_MAP[tab]) {
    const mapped = { ...base, ...LEGACY_TAB_MAP[tab] };
    mapped.workflowView = normalizeWorkflowView(mapped.workflowView);
    return mapped;
  }

  if (section === 'workflows' || section === 'financials') {
    base.section = LEGACY_SECTION_MAP[section];
    if (view && FINANCIAL_VIEWS.has(view as FinancialView)) {
      base.financialView = view as FinancialView;
    }
  } else if (section && PRIMARY_SECTIONS.has(section as ProjectPrimarySection)) {
    base.section = section as ProjectPrimarySection;
    if (base.section === 'financials' && view && FINANCIAL_VIEWS.has(view as FinancialView)) {
      base.financialView = view as FinancialView;
    }
  }

  if (view && base.section === 'documents') {
    base.fileView = view as FileView;
  }

  return base;
}

export function navQueryParams(state: ProjectNavState): Record<string, string> {
  if (state.utilityView) {
    return { tab: state.utilityView };
  }

  if (state.section === 'documents' && state.fileView !== 'all') {
    return { section: 'documents', view: state.fileView };
  }

  if (state.section === 'financials') {
    const params: Record<string, string> = { section: 'financials' };
    if (state.financialView && state.financialView !== 'summary') {
      params['view'] = state.financialView;
    }
    return params;
  }

  if (state.section === 'overview') {
    return {};
  }

  if (state.section === 'todos') {
    const params: Record<string, string> = { section: 'todos' };
    if (state.workflowView && state.workflowView !== 'all-work') {
      params['tab'] = state.workflowView;
    }
    return params;
  }

  if (state.section === 'changes') {
    return { section: 'changes' };
  }

  return { section: state.section };
}

export function openWorkflow(view: WorkflowView): ProjectNavState {
  const section: ProjectPrimarySection =
    view === 'changes' ? 'changes' : 'todos';
  return {
    ...defaultNavState(),
    section,
    workflowView: normalizeWorkflowView(view),
  };
}

export function openFinancial(view: FinancialView): ProjectNavState {
  return { ...defaultNavState(), section: 'financials', financialView: view, utilityView: null };
}

export function openFileView(view: FileView): ProjectNavState {
  return { ...defaultNavState(), section: 'documents', fileView: view, utilityView: null };
}

export function openUtility(view: UtilityView): ProjectNavState {
  return { ...defaultNavState(), utilityView: view };
}

export function persistProjectNavKey(projectId: string): string {
  return `brighten.projectNav.${projectId}`;
}

export function loadPersistedNav(projectId: string): Partial<ProjectNavState> | null {
  try {
    const raw = localStorage.getItem(persistProjectNavKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ProjectNavState>;
  } catch {
    return null;
  }
}

export function persistShowAllToolsKey(projectId: string): string {
  return `brighten.projectShowAllTools.${projectId}`;
}

export function persistLastTabKey(projectId: string): string {
  return `brighten.lastTab.${projectId}`;
}

export function loadPersistedLastTab(projectId: string): ProjectPrimarySection | null {
  try {
    const raw = localStorage.getItem(persistLastTabKey(projectId));
    if (!raw) {
      const legacy = loadPersistedNav(projectId);
      return legacy?.section ?? null;
    }
    if (LEGACY_SECTION_MAP[raw]) {
      return LEGACY_SECTION_MAP[raw];
    }
    if (PRIMARY_SECTIONS.has(raw as ProjectPrimarySection)) {
      return raw as ProjectPrimarySection;
    }
    const legacy = loadPersistedNav(projectId);
    return legacy?.section ?? null;
  } catch {
    return null;
  }
}

export function savePersistedLastTab(projectId: string, section: ProjectPrimarySection): void {
  try {
    localStorage.setItem(persistLastTabKey(projectId), section);
  } catch {
    /* ignore */
  }
}

export function savePersistedNav(projectId: string, state: ProjectNavState): void {
  try {
    localStorage.setItem(persistProjectNavKey(projectId), JSON.stringify({
      section: state.section,
      workflowView: state.workflowView,
      financialView: state.financialView,
      fileView: state.fileView,
    }));
  } catch {
    /* ignore */
  }
}
