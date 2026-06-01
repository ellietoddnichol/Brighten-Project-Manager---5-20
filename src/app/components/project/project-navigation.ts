import {

  FileView,

  FinancialView,

  ProjectNavState,

  ProjectPrimarySection,

  UtilityView,

  WorkflowView,

} from './project-detail.types';



const LEGACY_TAB_MAP: Record<string, Partial<ProjectNavState>> = {

  overview: { section: 'overview' },

  tasks: { section: 'workflows', workflowView: 'tasks' },

  changes: { section: 'workflows', workflowView: 'changes' },

  co: { section: 'workflows', workflowView: 'changes' },

  rfis: { section: 'workflows', workflowView: 'rfis' },

  submittals: { section: 'workflows', workflowView: 'submittals' },

  'daily-logs': { section: 'workflows', workflowView: 'daily-logs' },

  'field-issues': { section: 'workflows', workflowView: 'field-issues' },

  'certified-payroll': { section: 'workflows', workflowView: 'certified-payroll' },

  budget: { section: 'financials', financialView: 'budget' },

  pos: { section: 'financials', financialView: 'pos' },

  billing: { section: 'financials', financialView: 'billing' },

  wip: { section: 'financials', financialView: 'wip' },

  ar: { section: 'financials', financialView: 'ar' },

  'labor-bonus': { section: 'financials', financialView: 'labor-bonus' },

  'import-source': { section: 'financials', financialView: 'import-source' },

  documents: { section: 'documents' },

  'drive-mapping': { section: 'documents', fileView: 'drive-mapping' },

  setup: { section: 'overview', utilityView: 'setup' },

  files: { section: 'documents', utilityView: 'files' },

  issues: { section: 'workflows', workflowView: 'tasks' },

  schedule: { section: 'workflows', utilityView: 'schedule' },

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



  if (section === 'workflows' || section === 'financials' || section === 'documents' || section === 'overview') {

    base.section = section as ProjectPrimarySection;

  }



  if (view) {

    if (base.section === 'workflows') {

      base.workflowView = normalizeWorkflowView(view as WorkflowView);

    } else if (base.section === 'financials') {

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

  const wf = normalizeWorkflowView(state.workflowView);

  if (state.section === 'workflows' && wf !== 'all-work') {

    return { section: 'workflows', view: wf };

  }

  if (state.section === 'financials' && state.financialView !== 'summary') {

    return { section: 'financials', view: state.financialView };

  }

  if (state.section === 'documents' && state.fileView !== 'all') {

    return { section: 'documents', view: state.fileView };

  }

  if (state.section === 'overview') {

    return {};

  }

  if (state.section === 'documents') {

    return { section: 'documents' };

  }

  return { section: state.section };

}



export function openWorkflow(view: WorkflowView): ProjectNavState {

  return {

    ...defaultNavState(),

    section: 'workflows',

    workflowView: normalizeWorkflowView(view),

    utilityView: null,

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


