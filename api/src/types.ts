import type { RowDataPacket } from 'mysql2';

export interface ProjectDashboardRow extends RowDataPacket {
  id: string;
  job_number: string;
  project_name: string;
  customer: string | null;
  foreman: string | null;
  project_status: string | null;
  billing_status: string | null;
  original_contract_amount: number | null;
  revised_contract_amount: number | null;
  billed_to_date: number | null;
  balance_to_bill: number | null;
  prevailing_wage: number | boolean | null;
  cpr_required: number | boolean | null;
  needs_review: number | boolean | null;
  drive_folder_id: string | null;
  drive_status: string | null;
  open_task_count: number | null;
  needed_document_count: number | null;
  linked_document_count: number | null;
  latest_ar_total: number | null;
  latest_financial_snapshot_date: string | Date | null;
  total_estimated_cost: number | null;
  total_actual_cost: number | null;
  percent_complete: number | null;
  total_estimated_income: number | null;
  total_actual_income: number | null;
  profit: number | null;
  profit_margin_percent: number | null;
}

export type GenericViewRow = RowDataPacket & Record<string, unknown>;
