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
};

const EXTRA_SQL = `
  SELECT address, city, state, zip, county_code, start_date, target_end_date, tax_exempt, bond_required
  FROM brighten_pm.projects
  WHERE id = ?
  LIMIT 1
`;

export async function findDashboardProject(key: string): Promise<ProjectDashboardRow | null> {
  const job = normalizeJobNumber(key);
  return queryOne<ProjectDashboardRow>(ONE_SQL, [key, job, `J${job}`]);
}

/** Dashboard view plus base-table fields not exposed on v_project_dashboard. */
export async function fetchMergedProjectDetail(routeKey: string): Promise<ProjectExtraRow | null> {
  const dash = await findDashboardProject(routeKey);
  if (!dash) return null;

  const extra = await queryOne<ProjectExtraRow>(EXTRA_SQL, [dash.id]);
  if (!extra) return dash;

  return { ...dash, ...extra };
}
