import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

export class BudgetLineValidationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'BudgetLineValidationError';
  }
}

export interface BudgetLineInput {
  costCode: string;
  category: string;
  description?: string | null;
  budgetAmount?: number | null;
  actualToDate?: number | null;
  committedAmount?: number | null;
  projectedFinalCost?: number | null;
  varianceAmount?: number | null;
  status?: string | null;
  notes?: string | null;
}

const REQUIRED_FIELDS: Array<keyof BudgetLineInput> = ['costCode', 'category'];

const NUMERIC_FIELDS: Array<keyof BudgetLineInput> = [
  'budgetAmount',
  'actualToDate',
  'committedAmount',
  'projectedFinalCost',
  'varianceAmount',
];

function toNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new BudgetLineValidationError(`Field "${field}" must be a number.`);
  }
  return num;
}

export function parseBudgetLineInput(body: unknown): BudgetLineInput {
  if (!body || typeof body !== 'object') {
    throw new BudgetLineValidationError('Request body must be an object.');
  }
  const raw = body as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    const value = raw[field];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BudgetLineValidationError(`Field "${field}" is required.`);
    }
  }

  const input: BudgetLineInput = {
    costCode: String(raw.costCode).trim(),
    category: String(raw.category).trim(),
    description: raw.description != null ? String(raw.description).trim() : null,
    status: raw.status != null ? String(raw.status).trim() : null,
    notes: raw.notes != null ? String(raw.notes).trim() : null,
  };

  const numbers: Record<string, number | null> = {};
  for (const field of NUMERIC_FIELDS) {
    numbers[field] = toNullableNumber(raw[field], field);
  }

  return {
    ...input,
    budgetAmount: numbers.budgetAmount,
    actualToDate: numbers.actualToDate,
    committedAmount: numbers.committedAmount,
    projectedFinalCost: numbers.projectedFinalCost,
    varianceAmount: numbers.varianceAmount,
  };
}

export async function resolveProjectId(
  conn: mysql.PoolConnection | mysql.Pool,
  projectIdOrJob: string,
  job: string,
): Promise<string | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM brighten_pm.v_project_dashboard
     WHERE id = ? OR job_number = ? OR job_number = ?
     LIMIT 1`,
    [projectIdOrJob, job, `J${job}`],
  );
  return rows[0]?.id ?? null;
}

export async function insertBudgetLine(
  conn: mysql.PoolConnection,
  projectId: string,
  input: BudgetLineInput,
): Promise<string> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `INSERT INTO brighten_pm.budget_lines
      (project_id, cost_code, category, description, budget_amount, actual_to_date,
       committed_amount, projected_final_cost, variance_amount, source_type, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    [
      projectId,
      input.costCode,
      input.category,
      input.description,
      input.budgetAmount,
      input.actualToDate,
      input.committedAmount,
      input.projectedFinalCost,
      input.varianceAmount,
      input.status ?? 'Active',
      input.notes,
    ],
  );
  return String(result.insertId);
}

export async function updateBudgetLine(
  conn: mysql.PoolConnection,
  projectId: string,
  lineId: string,
  input: BudgetLineInput,
): Promise<boolean> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `UPDATE brighten_pm.budget_lines
     SET cost_code = ?, category = ?, description = ?, budget_amount = ?, actual_to_date = ?,
         committed_amount = ?, projected_final_cost = ?, variance_amount = ?, status = ?, notes = ?
     WHERE id = ? AND project_id = ?`,
    [
      input.costCode,
      input.category,
      input.description,
      input.budgetAmount,
      input.actualToDate,
      input.committedAmount,
      input.projectedFinalCost,
      input.varianceAmount,
      input.status ?? 'Active',
      input.notes,
      lineId,
      projectId,
    ],
  );
  return result.affectedRows > 0;
}

export async function deleteBudgetLine(
  conn: mysql.PoolConnection,
  projectId: string,
  lineId: string,
): Promise<boolean> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `DELETE FROM brighten_pm.budget_lines WHERE id = ? AND project_id = ?`,
    [lineId, projectId],
  );
  return result.affectedRows > 0;
}
