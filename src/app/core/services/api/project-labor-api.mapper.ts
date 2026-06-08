export interface ProjectSqlLaborEntry {
  id: string;
  workDate: string;
  employeeName: string;
  classification: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  hourlyRate: number | null;
  laborCost: number | null;
  notes: string;
}

export interface ProjectSqlLabor {
  source: 'sql';
  projectId: string;
  entryCount: number;
  totalHours: number;
  totalLaborCost: number;
  entries: ProjectSqlLaborEntry[];
}

interface LaborApiResponse {
  ok: boolean;
  projectId: string;
  summary?: Record<string, unknown> | null;
  entries?: Array<Record<string, unknown>>;
  entryCount?: number;
}

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapLaborResponse(resp: LaborApiResponse): ProjectSqlLabor {
  const entries = (resp.entries ?? []).map((row, index) => ({
    id: String(row['id'] ?? `sql-labor-${index}`),
    workDate: String(row['work_date'] ?? ''),
    employeeName: String(row['employee_name'] ?? ''),
    classification: String(row['classification'] ?? ''),
    regularHours: num(row['regular_hours']),
    overtimeHours: num(row['overtime_hours']),
    doubleTimeHours: num(row['double_time_hours']),
    hourlyRate: nullableNum(row['hourly_rate']),
    laborCost: nullableNum(row['labor_cost']),
    notes: String(row['notes'] ?? ''),
  }));

  const totalHours = entries.reduce((sum, e) => sum + e.regularHours + e.overtimeHours + e.doubleTimeHours, 0);
  const totalLaborCost = entries.reduce((sum, e) => sum + (e.laborCost ?? 0), 0);

  return {
    source: 'sql',
    projectId: String(resp.projectId ?? ''),
    entryCount: resp.entryCount ?? entries.length,
    totalHours,
    totalLaborCost,
    entries,
  };
}
