import type mysql from 'mysql2/promise';

export class LaborEntryValidationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'LaborEntryValidationError';
  }
}

export interface LaborEntryInput {
  workDate: string;
  employeeName: string;
  classification?: string | null;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  hourlyRate?: number | null;
  laborCost?: number | null;
  notes?: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(value: unknown, field: string, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new LaborEntryValidationError(`Field "${field}" must be a number.`);
  }
  return num;
}

function toNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new LaborEntryValidationError(`Field "${field}" must be a number.`);
  }
  return num;
}

export function parseLaborEntryInput(body: unknown): LaborEntryInput {
  if (!body || typeof body !== 'object') {
    throw new LaborEntryValidationError('Request body must be an object.');
  }
  const raw = body as Record<string, unknown>;

  const workDate = typeof raw.workDate === 'string' ? raw.workDate.trim() : '';
  if (!DATE_PATTERN.test(workDate)) {
    throw new LaborEntryValidationError('Field "workDate" is required and must be in YYYY-MM-DD format.');
  }

  const employeeName = typeof raw.employeeName === 'string' ? raw.employeeName.trim() : '';
  if (!employeeName) {
    throw new LaborEntryValidationError('Field "employeeName" is required.');
  }

  const regularHours = toNumber(raw.regularHours, 'regularHours');
  const overtimeHours = toNumber(raw.overtimeHours, 'overtimeHours');
  const doubleTimeHours = toNumber(raw.doubleTimeHours, 'doubleTimeHours');
  const hourlyRate = toNullableNumber(raw.hourlyRate, 'hourlyRate');
  let laborCost = toNullableNumber(raw.laborCost, 'laborCost');

  if (laborCost === null && hourlyRate !== null) {
    const totalHours = regularHours + overtimeHours * 1.5 + doubleTimeHours * 2;
    laborCost = Math.round(totalHours * hourlyRate * 100) / 100;
  }

  return {
    workDate,
    employeeName,
    classification: raw.classification != null ? String(raw.classification).trim() : null,
    regularHours,
    overtimeHours,
    doubleTimeHours,
    hourlyRate,
    laborCost,
    notes: raw.notes != null ? String(raw.notes).trim() : null,
  };
}

export async function insertLaborEntry(
  conn: mysql.PoolConnection,
  projectId: string,
  input: LaborEntryInput,
): Promise<string> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `INSERT INTO brighten_pm.labor_entries
      (project_id, work_date, employee_name, classification, regular_hours, overtime_hours,
       double_time_hours, hourly_rate, labor_cost, source_type, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
    [
      projectId,
      input.workDate,
      input.employeeName,
      input.classification,
      input.regularHours,
      input.overtimeHours,
      input.doubleTimeHours,
      input.hourlyRate,
      input.laborCost,
      input.notes,
    ],
  );
  return String(result.insertId);
}

export async function updateLaborEntry(
  conn: mysql.PoolConnection,
  projectId: string,
  entryId: string,
  input: LaborEntryInput,
): Promise<boolean> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `UPDATE brighten_pm.labor_entries
     SET work_date = ?, employee_name = ?, classification = ?, regular_hours = ?, overtime_hours = ?,
         double_time_hours = ?, hourly_rate = ?, labor_cost = ?, notes = ?
     WHERE id = ? AND project_id = ?`,
    [
      input.workDate,
      input.employeeName,
      input.classification,
      input.regularHours,
      input.overtimeHours,
      input.doubleTimeHours,
      input.hourlyRate,
      input.laborCost,
      input.notes,
      entryId,
      projectId,
    ],
  );
  return result.affectedRows > 0;
}

export async function deleteLaborEntry(
  conn: mysql.PoolConnection,
  projectId: string,
  entryId: string,
): Promise<boolean> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `DELETE FROM brighten_pm.labor_entries WHERE id = ? AND project_id = ?`,
    [entryId, projectId],
  );
  return result.affectedRows > 0;
}
