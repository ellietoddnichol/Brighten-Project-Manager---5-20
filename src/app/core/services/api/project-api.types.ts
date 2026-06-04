/** Raw row shape from GET /api/projects (v_project_dashboard). */
export interface ProjectDashboardApiRow {
  id: string;
  job_number: string;
  project_name: string;
  customer?: string | null;
  foreman?: string | null;
  project_status?: string | null;
  billing_status?: string | null;
  original_contract_amount?: number | null;
  revised_contract_amount?: number | null;
  billed_to_date?: number | null;
  balance_to_bill?: number | null;
  prevailing_wage?: boolean | number | null;
  cpr_required?: boolean | number | null;
  needs_review?: boolean | number | null;
  drive_folder_id?: string | null;
  drive_status?: string | null;
  open_task_count?: number | null;
  needed_document_count?: number | null;
  linked_document_count?: number | null;
  latest_ar_total?: number | null;
  latest_financial_snapshot_date?: string | null;
  total_estimated_cost?: number | null;
  total_actual_cost?: number | null;
  percent_complete?: number | null;
  total_estimated_income?: number | null;
  total_actual_income?: number | null;
  profit?: number | null;
  profit_margin_percent?: number | null;
  /** From projects table merge on GET/PATCH detail */
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county_code?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
  tax_exempt?: boolean | number | null;
  bond_required?: boolean | number | null;
  /** Phase 1B — Overview completion columns + project_scope (1:1) */
  project_profile?: string | null;
  retainage_percent?: number | string | null;
  award_date?: string | null;
  current_phase?: string | null;
  scope_summary?: string | null;
  included_work?: string | null;
  exclusions?: string | null;
  schedule_access_notes?: string | null;
  closeout_requirements?: string | null;
}

/** UI-shaped body for PATCH /api/projects/:id */
export type ProjectApiUpdateBody = Record<string, unknown>;

export interface ApiListResponse<T> {
  ok: boolean;
  count: number;
  items: T[];
}

export interface ApiItemResponse<T> {
  ok: boolean;
  item: T;
}

export interface ProjectFinancialSummaryApiResponse {
  ok: boolean;
  source: 'sql';
  asOfDate: string | null;
  item: ProjectFinancialSummaryApiItem;
}

export interface ProjectFinancialSummaryApiItem {
  projectId: string;
  jobNumber: string;
  contract: {
    originalContractAmount: number | string | null;
    revisedContractAmount: number | string | null;
  };
  billing: {
    billedToDate: number | string | null;
    remainingToBill: number | string | null;
    arBalance: number | string | null;
  };
  cost: {
    estimatedCost: number | string | null;
    actualCost: number | string | null;
    laborActual: number | string | null;
    materialsActual: number | string | null;
    subcontractorsActual: number | string | null;
    otherPreconActual: number | string | null;
  };
  profit: {
    profit: number | string | null;
    marginPercent: number | string | null;
  };
  dataWarnings: string[];
}

export interface ApiHealthResponse {
  ok: boolean;
  database: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
}
