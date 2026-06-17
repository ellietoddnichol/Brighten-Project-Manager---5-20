import { HomePriorityItem, HomePrioritySeverity, HomePrioritySource } from '@shared/utils/home-hub.compute';
import { ActionCenterApiRow, BackendReadinessApiRow } from './project-api.types';

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function pick(row: ActionCenterApiRow | BackendReadinessApiRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return undefined;
}

function mapSeverity(raw: unknown): HomePrioritySeverity {
  const text = String(raw ?? '').toLowerCase();
  if (text.includes('error') || text.includes('critical') || text.includes('high')) return 'error';
  return 'warning';
}

function mapSource(raw: unknown): HomePrioritySource {
  const text = String(raw ?? '').toLowerCase();
  if (text.includes('qb') || text.includes('quickbooks') || text.includes('billing')) return 'QB';
  if (text.includes('drive')) return 'Drive';
  if (text.includes('time') || text.includes('labor')) return 'Time';
  return 'Manual';
}

function projectRoute(row: ActionCenterApiRow): { route: string; projectId?: string } {
  const explicit = str(pick(row, 'route', 'next_action_route'));
  if (explicit?.startsWith('/')) return { route: explicit, projectId: str(pick(row, 'project_id')) };

  const projectId = str(pick(row, 'project_id', 'id'));
  if (projectId) return { route: `/projects/${projectId}`, projectId };
  return { route: '/projects' };
}

/** Map Cloud SQL v_action_center rows → home priority cards. */
export function mapActionCenterRowsToPriorities(rows: ActionCenterApiRow[]): HomePriorityItem[] {
  return rows
    .map((row, index): HomePriorityItem => {
      const { route, projectId } = projectRoute(row);
      const jobNumber = str(pick(row, 'job_number'))?.replace(/^J/i, '');
      const issue =
        str(pick(row, 'issue'))
        ?? str(pick(row, 'issue_label'))
        ?? str(pick(row, 'action_type'))
        ?? str(pick(row, 'title'))
        ?? str(pick(row, 'description'))
        ?? 'Follow up needed';

      return {
        id: str(pick(row, 'id', 'action_id')) ?? `action-center-${index}`,
        jobNumber,
        projectName: str(pick(row, 'project_name')),
        projectId,
        issue,
        severity: mapSeverity(pick(row, 'severity', 'priority', 'action_priority')),
        nextActionLabel:
          str(pick(row, 'next_action_label'))
          ?? str(pick(row, 'next_action'))
          ?? str(pick(row, 'action_label'))
          ?? 'Open job',
        route,
        fragment: str(pick(row, 'fragment', 'route_fragment')),
        source: mapSource(pick(row, 'source', 'source_system')),
        rank: Number(pick(row, 'priority_rank', 'rank', 'sort_order') ?? index + 1),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 12);
}

export interface BackendReadinessSummary {
  id: string;
  label: string;
  status: string;
  detail?: string;
  count?: number;
}

export function mapBackendReadinessRows(rows: BackendReadinessApiRow[]): BackendReadinessSummary[] {
  return rows.map((row, index) => ({
    id: str(pick(row, 'id', 'module_key', 'area')) ?? `readiness-${index}`,
    label: str(pick(row, 'label', 'module_name', 'area')) ?? 'Module',
    status: str(pick(row, 'status', 'readiness_status')) ?? 'unknown',
    detail: str(pick(row, 'detail', 'notes', 'message')),
    count: pick(row, 'count') == null ? undefined : Number(pick(row, 'count')),
  }));
}
