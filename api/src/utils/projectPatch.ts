import type { RowDataPacket } from 'mysql2';
import { queryRows, withTransaction } from '../db.js';
import type { ProjectDashboardRow } from '../types.js';
import { normalizeJobNumber } from './projectFilter.js';
import { uiBillingStatusToSql, uiStatusToSqlStatus } from './projectStatus.js';
import { fetchMergedProjectDetail, findDashboardProject } from './projectDetail.js';

/** Allowed keys in PATCH JSON body (UI-shaped). */
export const ALLOWED_PATCH_KEYS = new Set([
  'projectNumber',
  'projectName',
  'customer',
  'status',
  'projectStatus',
  'address',
  'city',
  'state',
  'zip',
  'county',
  'countyCode',
  'originalContractAmount',
  'billingStatus',
  'startDate',
  'targetCompletionDate',
  'targetEndDate',
  'prevailingWage',
  'certifiedPayrollRequired',
  'taxExempt',
  'bondRequired',
  'driveFolderId',
  'superintendent',
  'foreman',
  // Phase 1B — Overview completion (projects columns)
  'projectProfile',
  'retainagePercent',
  'awardDate',
  'currentPhase',
  // Phase 1B — project_scope (1:1) fields
  'scopeSummary',
  'includedWork',
  'exclusions',
  'scheduleAccessNotes',
  'closeoutRequirements',
]);

/** UI key → project_scope column. Order defines column list for upsert. */
export const SCOPE_FIELD_COLUMNS: Record<string, string> = {
  scopeSummary: 'scope_summary',
  includedWork: 'included_work',
  exclusions: 'exclusions',
  scheduleAccessNotes: 'schedule_access_notes',
  closeoutRequirements: 'closeout_requirements',
};

export class PatchValidationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
    this.name = 'PatchValidationError';
  }
}

async function resolveCompanyId(customerName: string): Promise<string> {
  const name = customerName.trim();
  if (!name) {
    throw new PatchValidationError('Customer name is required to resolve customer_company_id.');
  }
  const rows = await queryRows<RowDataPacket & { id: string }>(
    `SELECT id FROM brighten_pm.companies
     WHERE LOWER(TRIM(company_name)) = LOWER(TRIM(?))
     LIMIT 2`,
    [name],
  );
  if (rows.length === 0) {
    throw new PatchValidationError(`No company found matching customer "${name}".`);
  }
  if (rows.length > 1) {
    throw new PatchValidationError(`Multiple companies match customer "${name}". Resolve manually in SQL.`);
  }
  return rows[0].id;
}

async function resolveForemanUserId(displayName: string): Promise<string | null> {
  const name = displayName.trim();
  if (!name) return null;
  const rows = await queryRows<RowDataPacket & { id: string }>(
    `SELECT id FROM brighten_pm.users
     WHERE LOWER(TRIM(display_name)) = LOWER(TRIM(?))
     LIMIT 2`,
    [name],
  );
  if (rows.length === 0) {
    throw new PatchValidationError(`No user found matching superintendent/foreman "${name}".`);
  }
  if (rows.length > 1) {
    throw new PatchValidationError(`Multiple users match superintendent/foreman "${name}".`);
  }
  return rows[0].id;
}

function asOptionalString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new PatchValidationError(`${field} must be a string.`);
  }
  return value;
}

function asOptionalNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) {
    throw new PatchValidationError(`${field} must be a number.`);
  }
  return n;
}

function asOptionalPercent(value: unknown, field: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) {
    throw new PatchValidationError(`${field} must be a number.`);
  }
  if (n < 0 || n > 100) {
    throw new PatchValidationError(`${field} must be between 0 and 100.`);
  }
  return n;
}

function asOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new PatchValidationError(`${field} must be a boolean.`);
}

function asOptionalDate(value: unknown, field: string): string | null | undefined {
  const s = asOptionalString(value, field);
  if (s === undefined || s === null) return s;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
    throw new PatchValidationError(`${field} must be an ISO date (YYYY-MM-DD).`);
  }
  return s.slice(0, 10);
}

export type ProjectPatchColumnUpdate = {
  sql: string;
  params: unknown[];
};

/** Validate body keys and build SQL SET clauses for brighten_pm.projects. */
export async function buildProjectPatchUpdates(
  body: Record<string, unknown>,
): Promise<ProjectPatchColumnUpdate[]> {
  const keys = Object.keys(body);
  if (keys.length === 0) {
    throw new PatchValidationError('Request body must include at least one allowed field.');
  }

  const unknown = keys.filter((k) => !ALLOWED_PATCH_KEYS.has(k));
  if (unknown.length) {
    throw new PatchValidationError(`Unknown fields: ${unknown.join(', ')}`);
  }

  const updates: ProjectPatchColumnUpdate[] = [];

  if (body.projectNumber !== undefined) {
    const num = asOptionalString(body.projectNumber, 'projectNumber');
    if (num != null) updates.push({ sql: 'job_number = ?', params: [normalizeJobNumber(num)] });
  }

  if (body.projectName !== undefined) {
    const v = asOptionalString(body.projectName, 'projectName');
    if (v != null) updates.push({ sql: 'project_name = ?', params: [v] });
  }

  if (body.status !== undefined) {
    const v = asOptionalString(body.status, 'status');
    if (v != null) updates.push({ sql: 'project_status = ?', params: [uiStatusToSqlStatus(v)] });
  } else if (body.projectStatus !== undefined) {
    const v = asOptionalString(body.projectStatus, 'projectStatus');
    if (v != null) updates.push({ sql: 'project_status = ?', params: [uiStatusToSqlStatus(v)] });
  }

  if (body.address !== undefined) {
    const v = asOptionalString(body.address, 'address');
    if (v !== undefined) updates.push({ sql: 'address = ?', params: [v] });
  }

  if (body.city !== undefined) {
    const v = asOptionalString(body.city, 'city');
    if (v !== undefined) updates.push({ sql: 'city = ?', params: [v] });
  }

  if (body.state !== undefined) {
    const v = asOptionalString(body.state, 'state');
    if (v !== undefined) updates.push({ sql: 'state = ?', params: [v] });
  }

  if (body.zip !== undefined) {
    const v = asOptionalString(body.zip, 'zip');
    if (v !== undefined) updates.push({ sql: 'zip = ?', params: [v] });
  }

  const countyRaw = body.county ?? body.countyCode;
  if (countyRaw !== undefined) {
    const v = asOptionalString(countyRaw, 'county');
    if (v !== undefined) updates.push({ sql: 'county_code = ?', params: [v] });
  }

  if (body.originalContractAmount !== undefined) {
    const v = asOptionalNumber(body.originalContractAmount, 'originalContractAmount');
    if (v !== undefined) updates.push({ sql: 'original_contract_amount = ?', params: [v] });
  }

  if (body.billingStatus !== undefined) {
    const v = asOptionalString(body.billingStatus, 'billingStatus');
    if (v != null) updates.push({ sql: 'billing_status = ?', params: [uiBillingStatusToSql(v)] });
  }

  if (body.startDate !== undefined) {
    const v = asOptionalDate(body.startDate, 'startDate');
    if (v !== undefined) updates.push({ sql: 'start_date = ?', params: [v] });
  }

  const targetRaw = body.targetCompletionDate ?? body.targetEndDate;
  if (targetRaw !== undefined) {
    const v = asOptionalDate(targetRaw, 'targetCompletionDate');
    if (v !== undefined) updates.push({ sql: 'target_end_date = ?', params: [v] });
  }

  if (body.prevailingWage !== undefined || body.certifiedPayrollRequired !== undefined) {
    const pw =
      asOptionalBoolean(body.prevailingWage, 'prevailingWage')
      ?? asOptionalBoolean(body.certifiedPayrollRequired, 'certifiedPayrollRequired');
    if (pw !== undefined) {
      const bit = pw ? 1 : 0;
      updates.push({ sql: 'prevailing_wage = ?', params: [bit] });
      updates.push({ sql: 'cpr_required = ?', params: [bit] });
    }
  }

  if (body.taxExempt !== undefined) {
    const v = asOptionalBoolean(body.taxExempt, 'taxExempt');
    if (v !== undefined) updates.push({ sql: 'tax_exempt = ?', params: [v ? 1 : 0] });
  }

  if (body.bondRequired !== undefined) {
    const v = asOptionalBoolean(body.bondRequired, 'bondRequired');
    if (v !== undefined) updates.push({ sql: 'bond_required = ?', params: [v ? 1 : 0] });
  }

  if (body.driveFolderId !== undefined) {
    const v = asOptionalString(body.driveFolderId, 'driveFolderId');
    if (v !== undefined) updates.push({ sql: 'drive_folder_id = ?', params: [v] });
  }

  const foremanRaw = body.superintendent ?? body.foreman;
  if (foremanRaw !== undefined) {
    const name = asOptionalString(foremanRaw, 'superintendent');
    const userId = name == null || name === '' ? null : await resolveForemanUserId(name);
    updates.push({ sql: 'foreman_user_id = ?', params: [userId] });
  }

  if (body.customer !== undefined) {
    const name = asOptionalString(body.customer, 'customer');
    if (name != null && name !== '') {
      const companyId = await resolveCompanyId(name);
      updates.push({ sql: 'customer_company_id = ?', params: [companyId] });
    }
  }

  if (body.projectProfile !== undefined) {
    const v = asOptionalString(body.projectProfile, 'projectProfile');
    if (v !== undefined) updates.push({ sql: 'project_profile = ?', params: [v] });
  }

  if (body.retainagePercent !== undefined) {
    const v = asOptionalPercent(body.retainagePercent, 'retainagePercent');
    if (v !== undefined) updates.push({ sql: 'retainage_percent = ?', params: [v] });
  }

  if (body.awardDate !== undefined) {
    const v = asOptionalDate(body.awardDate, 'awardDate');
    if (v !== undefined) updates.push({ sql: 'award_date = ?', params: [v] });
  }

  if (body.currentPhase !== undefined) {
    const v = asOptionalString(body.currentPhase, 'currentPhase');
    if (v !== undefined) updates.push({ sql: 'current_phase = ?', params: [v] });
  }

  return updates;
}

/** Build project_scope column → value map from whitelisted scope keys. */
export function buildScopeValues(body: Record<string, unknown>): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const [key, column] of Object.entries(SCOPE_FIELD_COLUMNS)) {
    if (body[key] === undefined) continue;
    const v = asOptionalString(body[key], key);
    if (v !== undefined) values[column] = v;
  }
  return values;
}

export async function applyProjectPatch(
  routeKey: string,
  body: Record<string, unknown>,
): Promise<ProjectDashboardRow> {
  const existing = await findDashboardProject(routeKey);
  if (!existing) {
    throw new PatchValidationError('Project not found', 404);
  }

  const columnUpdates = await buildProjectPatchUpdates(body);
  const scopeValues = buildScopeValues(body);

  if (columnUpdates.length === 0 && Object.keys(scopeValues).length === 0) {
    throw new PatchValidationError('No valid fields to update after validation.');
  }

  await withTransaction(async (conn) => {
    if (columnUpdates.length > 0) {
      const updates = [...columnUpdates, { sql: 'updated_at = CURRENT_TIMESTAMP', params: [] }];
      const setClause = updates.map((u) => u.sql).join(', ');
      const params = updates.flatMap((u) => u.params);
      await conn.query(
        `UPDATE brighten_pm.projects SET ${setClause} WHERE id = ?`,
        [...params, existing.id],
      );
    }

    const scopeColumns = Object.keys(scopeValues);
    if (scopeColumns.length > 0) {
      const insertCols = ['project_id', ...scopeColumns];
      const placeholders = insertCols.map(() => '?').join(', ');
      const updateClause = scopeColumns.map((c) => `${c} = VALUES(${c})`).join(', ');
      const insertParams = [existing.id, ...scopeColumns.map((c) => scopeValues[c])];
      await conn.query(
        `INSERT INTO brighten_pm.project_scope (${insertCols.join(', ')})
         VALUES (${placeholders})
         ON DUPLICATE KEY UPDATE ${updateClause}`,
        insertParams,
      );
    }
  });

  const refreshed = await fetchMergedProjectDetail(existing.id);
  if (!refreshed) {
    throw new PatchValidationError('Project not found after update', 404);
  }
  return refreshed;
}
