import { ProjectBudgetApiResponse } from './project-api.types';

export interface ProjectSqlBudgetLine {
  id: string;
  costCode: string;
  category: string;
  description: string;
  budgetAmount: number;
  actualCost: number;
  committedAmount: number;
  projectedFinalCost: number;
  sourceType: string;
}

export interface ProjectSqlBudget {
  source: 'sql';
  projectId: string;
  jobNumber: string;
  lineCount: number;
  totalBudget: number;
  lines: ProjectSqlBudgetLine[];
}

function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapBudgetResponse(resp: ProjectBudgetApiResponse): ProjectSqlBudget {
  const lines = (resp.lines ?? []).map((row, index) => ({
    id: String(row['id'] ?? `sql-budget-${index}`),
    costCode: String(row['cost_code'] ?? ''),
    category: String(row['category'] ?? 'Other'),
    description: String(row['description'] ?? ''),
    budgetAmount: num(row['budget_amount']),
    actualCost: num(row['actual_to_date']),
    committedAmount: num(row['committed_amount']),
    projectedFinalCost: num(row['projected_final_cost']),
    sourceType: String(row['source_type'] ?? ''),
  }));

  const totalBudget = lines.reduce((sum, line) => sum + line.budgetAmount, 0);
  const summary = resp.summary ?? {};
  const projectId = String(summary['project_id'] ?? summary['projectId'] ?? '');
  const jobNumber = String(summary['job_number'] ?? summary['jobNumber'] ?? '');

  return {
    source: 'sql',
    projectId,
    jobNumber,
    lineCount: resp.lineCount ?? lines.length,
    totalBudget,
    lines,
  };
}
