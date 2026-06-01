export type ProjectPrimarySection = 'overview' | 'workflows' | 'financials' | 'documents';



export type WorkflowView =

  | 'all-work'

  | 'dashboard'

  | 'tasks'

  | 'changes'

  | 'field'

  | 'rfis'

  | 'submittals'

  | 'daily-logs'

  | 'field-issues'

  | 'certified-payroll'

  | 'safety'

  | 'inspections';



export type FinancialView =

  | 'summary'

  | 'budget'

  | 'pos'

  | 'billing'

  | 'wip'

  | 'ar'

  | 'labor-bonus'

  | 'sub-invoices'

  | 'cost-transactions'

  | 'import-source';



export type FileView =

  | 'all'

  | 'required'

  | 'generated'

  | 'uploads'

  | 'contracts'

  | 'change-orders'

  | 'billing'

  | 'cpr'

  | 'subs'

  | 'insurance'

  | 'lien-waivers'

  | 'submittals'

  | 'closeout'

  | 'drive-mapping';



export type UtilityView =

  | 'setup'

  | 'drive-mapping'

  | 'directory'

  | 'files'

  | 'schedule'

  | 'issues'

  | 'certified-payroll-setup';



export interface ProjectNavState {

  section: ProjectPrimarySection;

  workflowView: WorkflowView;

  financialView: FinancialView;

  fileView: FileView;

  utilityView: UtilityView | null;

}



export interface WorkflowChip {

  id: WorkflowView | 'billing' | 'certified-payroll';

  label: string;

  count: number;

  status: 'ok' | 'attention' | 'alert';

}



export type HealthStatus = 'On Track' | 'Needs Attention' | 'At Risk';



export interface NewItemAction {

  id: string;

  label: string;

  icon: string;

  section?: ProjectPrimarySection;

  view?: WorkflowView | FinancialView;

}



export const SECTION_LABELS: Record<ProjectPrimarySection, string> = {

  overview: 'Overview',

  workflows: 'Work',

  financials: 'Money',

  documents: 'Files',

};



export const WORKFLOW_VIEW_LABELS: Partial<Record<WorkflowView, string>> = {

  'all-work': 'All Work',

  dashboard: 'All Work',

  tasks: 'Tasks',

  changes: 'Changes',

  field: 'Field',

  rfis: 'RFIs',

  submittals: 'Submittals',

  'daily-logs': 'Daily Logs',

  'field-issues': 'Field Issues',

  'certified-payroll': 'Certified Payroll',

  safety: 'Safety',

  inspections: 'Inspections',

};



export const FINANCIAL_VIEW_LABELS: Partial<Record<FinancialView, string>> = {

  summary: 'Money Overview',

  budget: 'Budget & Costs',

  billing: 'Billing',

  pos: 'Commitments',

  wip: 'WIP Detail',

  ar: 'AR Detail',

  'labor-bonus': 'Foreman Bonus',

  'sub-invoices': 'Sub Invoices',

  'cost-transactions': 'Cost Transactions',

  'import-source': 'Import / Source Detail',

};



export const FILE_VIEW_LABELS: Partial<Record<FileView, string>> = {

  all: 'All Files',

  required: 'Required',

  generated: 'Generated',

  uploads: 'Uploads',

  contracts: 'Contracts',

  'change-orders': 'Change Orders',

  billing: 'Billing',

  cpr: 'Certified Payroll',

  subs: 'Subs',

  insurance: 'Insurance',

  'lien-waivers': 'Lien Waivers',

  submittals: 'Submittals',

  closeout: 'Closeout',

  'drive-mapping': 'Drive Mapping',

};


