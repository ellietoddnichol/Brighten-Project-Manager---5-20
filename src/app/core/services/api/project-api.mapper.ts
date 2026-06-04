import { Project, ProjectStatus } from '@app/models/types';
import { ProjectDashboardApiRow } from './project-api.types';

function asBool(value: boolean | number | null | undefined): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return Boolean(value);
}

function mapProjectStatus(raw: string | null | undefined): ProjectStatus {
  const s = (raw ?? 'active').toLowerCase();
  switch (s) {
    case 'not_started':
    case 'lead':
    case 'precon':
      return 'Lead / Precon';
    case 'awarded':
    case 'setup':
    case 'setup_needed':
      return 'Setup Needed';
    case 'active':
    case 'in_progress':
      return 'Active';
    case 'closeout':
      return 'Closeout';
    case 'closed':
      return 'Closed';
    default:
      return 'Active';
  }
}

function mapBillingStatus(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase();
  switch (s) {
    case 'not_billed':
      return 'Not started / No billing yet';
    case 'progress_billing':
      return 'Progress billing';
    case 'fully_billed':
      return 'Final billing';
    case 'pending_contract':
      return 'Not started / No billing yet';
    default:
      return raw ?? 'Not started / No billing yet';
  }
}

function normalizeJobNumber(jobNumber: string): string {
  return jobNumber.replace(/^J/i, '').trim();
}

/** Map Cloud SQL v_project_dashboard row → existing Angular Project model. */
export function mapDashboardRowToProject(row: ProjectDashboardApiRow): Project {
  const jobNumber = normalizeJobNumber(row.job_number);
  const contractPending =
    !row.original_contract_amount
    && !row.revised_contract_amount
    && row.billing_status?.toLowerCase() === 'pending_contract';

  return {
    id: row.id,
    projectNumber: jobNumber,
    projectName: row.project_name,
    customer: row.customer ?? 'Brighten Builders LLC',
    superintendent: row.foreman ?? undefined,
    status: mapProjectStatus(row.project_status),
    projectStatus: row.project_status as Project['projectStatus'],
    billingStatus: mapBillingStatus(row.billing_status),
    originalContractAmount: row.original_contract_amount ?? undefined,
    contractPending,
    prevailingWage: asBool(row.prevailing_wage),
    certifiedPayrollRequired: asBool(row.cpr_required),
    driveFolderId: row.drive_folder_id ?? undefined,
    billedToDate: row.billed_to_date ?? undefined,
    wipLeftToBill: row.balance_to_bill ?? undefined,
    estCostBudget: row.total_estimated_cost ?? undefined,
    actualCostToDate: row.total_actual_cost ?? undefined,
    wipPercentComplete: row.percent_complete ?? undefined,
    forecastGP: row.profit ?? undefined,
    forecastMargin: row.profit_margin_percent ?? undefined,
    currentAR: row.latest_ar_total ?? undefined,
    seedCompletenessStatus: asBool(row.needs_review) ? 'NeedsReview' : 'Complete',
    includeInProjectsList: true,
    includeInActiveWip: row.project_status?.toLowerCase() === 'active'
      || row.project_status?.toLowerCase() === 'in_progress',
  };
}

export function mapDashboardRowsToProjects(rows: ProjectDashboardApiRow[]): Project[] {
  return rows.map(mapDashboardRowToProject);
}
