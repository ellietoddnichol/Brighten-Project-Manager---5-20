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
  tasks: { section: 'todos', workflowView: 'tasks' },
  co: { section: 'changes' },
  billing: { section: 'overview', financialView: 'billing' },
  budget: { section: 'overview', financialView: 'budget' },
  rfis: { section: 'todos', workflowView: 'rfis' },
  submittals: { section: 'todos', workflowView: 'submittals' },
  'daily-logs': { section: 'todos', workflowView: 'daily-logs' },
  'field-issues': { section: 'todos', workflowView: 'field-issues' },
  'certified-payroll': { section: 'todos', workflowView: 'certified-payroll' },
  pos: { section: 'overview', financialView: 'pos' },
  wip: { section: 'overview', financialView: 'wip' },
  ar: { section: 'overview', financialView: 'ar' },
  'labor-bonus': { section: 'overview', financialView: 'labor-bonus' },
  'import-source': { section: 'overview', financialView: 'import-source' },
  'drive-mapping': { section: 'documents', fileView: 'drive-mapping' },
  setup: { section: 'overview', utilityView: 'setup' },
  files: { section: 'documents', utilityView: 'files' },
  issues: { section: 'todos', workflowView: 'tasks' },
  schedule: { section: 'overview', utilityView: 'schedule' },
};

const LEGACY_SECTION_MAP: Record<string, ProjectPrimarySection> = {
  workflows: 'todos',
  financials: 'overview',
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

  let legacySection: 'workflows' | 'financials' | null = null;

  if (section === 'workflows' || section === 'financials') {
    legacySection = section;
    base.section = LEGACY_SECTION_MAP[section];
  } else if (section && PRIMARY_SECTIONS.has(section as ProjectPrimarySection)) {
    base.section = section as ProjectPrimarySection;
  }

  if (view) {
    if (legacySection === 'workflows') {
      base.workflowView = normalizeWorkflowView(view as WorkflowView);
    } else if (legacySection === 'financials') {
      base.financialView = view as FinancialView;
    } else if (base.section === 'documents') {
      base.fileView = view as FileView;
    }
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

  if (state.section === 'overview') {
    return {};
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
  return { ...defaultNavState(), section: 'overview', financialView: view, utilityView: null };
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
