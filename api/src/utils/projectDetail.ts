import { queryOne } from '../db.js';
import type { ProjectDashboardRow } from '../types.js';
import { normalizeJobNumber } from './projectFilter.js';

const ONE_SQL = `
  SELECT *
  FROM brighten_pm.v_project_dashboard
  WHERE id = ? OR job_number = ? OR job_number = ?
  LIMIT 1
`;

type ProjectExtraRow = ProjectDashboardRow & {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county_code?: string | null;
  start_date?: string | Date | null;
  target_end_date?: string | Date | null;
  tax_exempt?: number | boolean | null;
  bond_required?: number | boolean | null;
  project_profile?: string | null;
  retainage_percent?: number | string | null;
  award_date?: string | Date | null;
  current_phase?: string | null;
  scope_summary?: string | null;
  included_work?: string | null;
  exclusions?: string | null;
  schedule_access_notes?: string | null;
  closeout_requirements?: string | null;
};

const EXTRA_SQL = `
  SELECT address, city, state, zip, county_code, start_date, target_end_date,
         tax_exempt, bond_required, project_profile, retainage_percent, award_date, current_phase
  FROM brighten_pm.projects
  WHERE id = ?
  LIMIT 1
`;

const SCOPE_SQL = `
  SELECT scope_summary, included_work, exclusions, schedule_access_notes, closeout_requirements
  FROM brighten_pm.project_scope
  WHERE project_id = ?
  LIMIT 1
`;

export async function findDashboardProject(key: string): Promise<ProjectDashboardRow | null> {
  const job = normalizeJobNumber(key);
  return queryOne<ProjectDashboardRow>(ONE_SQL, [key, job, `J${job}`]);
}

/** Dashboard view plus base-table fields and project_scope (1:1, may be absent). */
export async function fetchMergedProjectDetail(routeKey: string): Promise<ProjectExtraRow | null> {
  const dash = await findDashboardProject(routeKey);
  if (!dash) return null;

  const extra = await queryOne<ProjectExtraRow>(EXTRA_SQL, [dash.id]);
  const scope = await queryOne<ProjectExtraRow>(SCOPE_SQL, [dash.id]);

  return {
    ...dash,
    ...(extra ?? {}),
    scope_summary: scope?.scope_summary ?? null,
    included_work: scope?.included_work ?? null,
    exclusions: scope?.exclusions ?? null,
    schedule_access_notes: scope?.schedule_access_notes ?? null,
    closeout_requirements: scope?.closeout_requirements ?? null,
  } as ProjectExtraRow;
}
