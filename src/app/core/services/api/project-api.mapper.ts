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

function formatDateField(value: string | Date | null | undefined): string | undefined {
  if (value == null || value === '') return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Standard Google Drive folder URL when only folder id is known from SQL. */
export function driveFolderUrlFromId(folderId: string | null | undefined): string | undefined {
  const id = folderId?.trim();
  if (!id) return undefined;
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Map Cloud SQL v_project_dashboard row → existing Angular Project model. */
export function mapDashboardRowToProject(row: ProjectDashboardApiRow): Project {
  const jobNumber = normalizeJobNumber(row.job_number);
  const contractPending =
    !row.original_contract_amount
    && !row.revised_contract_amount
    && row.billing_status?.toLowerCase() === 'pending_contract';
  const driveFolderId = row.drive_folder_id ?? undefined;
  const county = row.county_code ?? undefined;

  return {
    id: row.id,
    projectNumber: jobNumber,
    projectName: row.project_name,
    customer: row.customer ?? 'Brighten Builders LLC',
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    county,
    superintendent: row.foreman ?? undefined,
    status: mapProjectStatus(row.project_status),
    projectStatus: row.project_status as Project['projectStatus'],
    billingStatus: mapBillingStatus(row.billing_status),
    originalContractAmount: row.original_contract_amount ?? undefined,
    contractPending,
    prevailingWage: asBool(row.prevailing_wage),
    certifiedPayrollRequired: asBool(row.cpr_required ?? row.prevailing_wage),
    taxExempt: asBool(row.tax_exempt),
    startDate: formatDateField(row.start_date),
    targetCompletionDate: formatDateField(row.target_end_date),
    driveFolderId,
    driveFolderUrl: driveFolderUrlFromId(driveFolderId),
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
