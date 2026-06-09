import { Router } from 'express';
import { getPool, queryOne, queryRows, withTransaction } from '../db.js';
import { confirmEstimatedBudgetForProject } from '../utils/budgetConfirm.js';
import {
  BudgetLineValidationError,
  deleteBudgetLine,
  insertBudgetLine,
  parseBudgetLineInput,
  resolveProjectId,
  updateBudgetLine,
} from '../utils/budgetLines.js';
import {
  LaborEntryValidationError,
  deleteLaborEntry,
  insertLaborEntry,
  parseLaborEntryInput,
  updateLaborEntry,
} from '../utils/laborEntries.js';
import type { GenericViewRow, ProjectDashboardRow } from '../types.js';
import { normalizeJobNumber, projectFilterParams } from '../utils/projectFilter.js';
import { applyProjectPatch, PatchValidationError } from '../utils/projectPatch.js';
import { fetchMergedProjectDetail } from '../utils/projectDetail.js';

export const projectsRouter = Router();

const LIST_SQL = `
  SELECT *
  FROM brighten_pm.v_project_dashboard
  ORDER BY CAST(job_number AS UNSIGNED)
`;

const ONE_SQL = `
  SELECT *
  FROM brighten_pm.v_project_dashboard
  WHERE id = ? OR job_number = ? OR job_number = ?
  LIMIT 1
`;

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function timestampOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text === '' ? null : text;
}

function buildFinancialWarnings(row: GenericViewRow): string[] {
  const warnings: string[] = [];
  const confidence = typeof row.confidence === 'string' ? row.confidence.trim() : '';
  const missingNextStep = typeof row.missing_next_step === 'string' ? row.missing_next_step.trim() : '';
  const estimatedCost = numericOrNull(row.total_estimated_cost);
  const hasProfit = numericOrNull(row.profit) !== null || numericOrNull(row.profit_margin_percent) !== null;

  if (confidence && confidence.toLowerCase() !== 'high') {
    warnings.push(`Financial confidence is ${confidence}.`);
  }
  if (missingNextStep) {
    warnings.push(missingNextStep);
  }
  if (estimatedCost === null) {
    warnings.push('Estimated cost is not available from SQL.');
  }
  if (estimatedCost === null && hasProfit) {
    warnings.push('Profit/margin may be incomplete because estimated cost is missing.');
  }
  return warnings;
}

function costCategory(
  category: 'Labor' | 'Materials' | 'Subcontractors' | 'Other / Precon',
  actual: unknown,
): { category: string; budget: null; actual: number | null; remaining: null } {
  return {
    category,
    budget: null,
    actual: numericOrNull(actual),
    remaining: null,
  };
}

function projectLookupParams(key: string): [string, string, string] {
  const job = normalizeJobNumber(key);
  return [key, job, `J${job}`];
}

async function findProjectIdentity(key: string): Promise<{ projectId: string; jobNumber: string } | null> {
  const project = await queryOne<GenericViewRow>(
    `SELECT id, job_number
     FROM brighten_pm.projects
     WHERE id = ? OR job_number = ? OR job_number = ?
     LIMIT 1`,
    projectLookupParams(key),
  );

  if (!project?.id || !project?.job_number) return null;
  return {
    projectId: String(project.id),
    jobNumber: String(project.job_number),
  };
}

function mapPayAppHeader(row: GenericViewRow): Record<string, unknown> {
  return {
    id: textOrNull(row.id),
    projectId: textOrNull(row.project_id),
    jobNumber: textOrNull(row.job_number),
    payAppNumber: textOrNull(row.pay_app_number),
    billingPeriodStart: dateOrNull(row.billing_period_start),
    billingPeriodEnd: dateOrNull(row.billing_period_end),
    applicationDate: dateOrNull(row.application_date),
    contractSum: numericOrNull(row.contract_sum),
    netChangeByChangeOrders: numericOrNull(row.net_change_by_change_orders),
    contractSumToDate: numericOrNull(row.contract_sum_to_date),
    totalCompletedStoredToDate: numericOrNull(row.total_completed_stored_to_date),
    retainageAmount: numericOrNull(row.retainage_amount),
    totalEarnedLessRetainage: numericOrNull(row.total_earned_less_retainage),
    previousCertificates: numericOrNull(row.previous_certificates),
    currentPaymentDue: numericOrNull(row.current_payment_due),
    balanceToFinish: numericOrNull(row.balance_to_finish),
    status: textOrNull(row.status),
    notes: textOrNull(row.notes),
    sovLineCount: numericOrNull(row.sov_line_count) ?? 0,
    sourceDocumentId: textOrNull(row.source_document_id),
    createdAt: timestampOrNull(row.created_at),
  };
}

function mapSovLine(row: GenericViewRow): Record<string, unknown> {
  return {
    id: textOrNull(row.id),
    payAppId: textOrNull(row.pay_app_id),
    projectId: textOrNull(row.project_id),
    lineNumber: textOrNull(row.line_number),
    description: textOrNull(row.description),
    scheduledValue: numericOrNull(row.scheduled_value),
    workCompletedPrevious: numericOrNull(row.work_completed_previous),
    workCompletedThisPeriod: numericOrNull(row.work_completed_this_period),
    materialsPresentlyStored: numericOrNull(row.materials_presently_stored),
    totalCompletedAndStored: numericOrNull(row.total_completed_and_stored),
    percentComplete: numericOrNull(row.percent_complete),
    balanceToFinish: numericOrNull(row.balance_to_finish),
    retainage: numericOrNull(row.retainage),
    costCode: textOrNull(row.cost_code),
    createdAt: timestampOrNull(row.created_at),
  };
}

function buildCostBreakdown(row: GenericViewRow): {
  asOfDate: string | null;
  confidence: string | null;
  categories: Array<{ category: string; budget: null; actual: number | null; remaining: null }>;
  dataWarnings: string[];
} {
  const confidence = typeof row.confidence === 'string' && row.confidence.trim()
    ? row.confidence.trim()
    : null;
  const missingNextStep = typeof row.missing_next_step === 'string' ? row.missing_next_step.trim() : '';
  const warnings = [
    'Budget amounts are not available from SQL yet. Showing actual cost snapshot only.',
  ];

  if (confidence && confidence.toLowerCase() !== 'high') {
    warnings.push(`Cost breakdown confidence is ${confidence}.`);
  }
  if (missingNextStep) {
    warnings.push(missingNextStep);
  }

  return {
    asOfDate: dateOrNull(row.snapshot_date),
    confidence,
    categories: [
      costCategory('Labor', row.labor_actual),
      costCategory('Materials', row.materials_actual),
      costCategory('Subcontractors', row.subcontractors_actual),
      costCategory('Other / Precon', row.other_precon_actual),
    ],
    dataWarnings: warnings,
  };
}

projectsRouter.get('/projects', async (_req, res, next) => {
  try {
    const items = await queryRows<ProjectDashboardRow>(LIST_SQL);
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id', async (req, res, next) => {
  try {
    const row = await fetchMergedProjectDetail(req.params.id);
    if (!row) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    res.json({ ok: true, item: row });
  } catch (err) {
    next(err);
  }
});

projectsRouter.patch('/projects/:id', async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ ok: false, error: 'Request body must be a JSON object.' });
      return;
    }
    const item = await applyProjectPatch(req.params.id, body as Record<string, unknown>);
    res.json({ ok: true, item });
  } catch (err) {
    if (err instanceof PatchValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    next(err);
  }
});

projectsRouter.get('/projects/:id/readiness', async (req, res, next) => {
  try {
    const params = projectFilterParams(req.params.id);
    const items = await queryRows<GenericViewRow>(
      `SELECT * FROM brighten_pm.v_project_readiness
       WHERE project_id = ? OR id = ? OR job_number = ? OR job_number = ?`,
      params,
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/tasks', async (req, res, next) => {
  try {
    const params = projectFilterParams(req.params.id);
    const items = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_tasks
       WHERE project_id = ? OR id = ? OR job_number = ? OR job_number = ?
       ORDER BY
         CASE
           WHEN priority IN ('High', 'high') THEN 1
           WHEN priority IN ('Normal', 'normal') THEN 2
           ELSE 3
         END,
         due_date,
         created_at`,
      params,
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/documents', async (req, res, next) => {
  try {
    const params = projectFilterParams(req.params.id);
    const items = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_documents
       WHERE project_id = ? OR id = ? OR job_number = ? OR job_number = ?
       ORDER BY source_status, document_type, created_at`,
      params,
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/financials', async (req, res, next) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const params = [req.params.id, job, `J${job}`];
    const row = await queryOne<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_financial_detail
       WHERE project_id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    if (!row) {
      res.status(404).json({ ok: false, error: 'Financial detail not found for project' });
      return;
    }

    const dashboard = await queryOne<GenericViewRow>(
      `SELECT latest_ar_total
       FROM brighten_pm.v_project_dashboard
       WHERE id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );

    const asOfDate = dateOrNull(row.snapshot_date);
    res.json({
      ok: true,
      source: 'sql',
      asOfDate,
      item: {
        projectId: row.project_id,
        jobNumber: row.job_number,
        contract: {
          originalContractAmount: numericOrNull(row.original_contract_amount),
          revisedContractAmount: numericOrNull(row.revised_contract_amount),
        },
        billing: {
          billedToDate: numericOrNull(row.billed_to_date),
          remainingToBill: numericOrNull(row.balance_to_bill),
          arBalance: numericOrNull(dashboard?.latest_ar_total),
        },
        cost: {
          estimatedCost: numericOrNull(row.total_estimated_cost),
          actualCost: numericOrNull(row.total_actual_cost) ?? numericOrNull(row.bucket_total),
          laborActual: numericOrNull(row.labor_actual),
          materialsActual: numericOrNull(row.materials_actual),
          subcontractorsActual: numericOrNull(row.subcontractors_actual),
          otherPreconActual: numericOrNull(row.other_precon_actual),
        },
        profit: {
          profit: numericOrNull(row.profit),
          marginPercent: numericOrNull(row.profit_margin_percent),
        },
        dataWarnings: buildFinancialWarnings(row),
        costBreakdown: buildCostBreakdown(row),
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/pay-apps', async (req, res, next) => {
  try {
    const project = await findProjectIdentity(req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }

    const rows = await queryRows<GenericViewRow>(
      `SELECT
         pa.*,
         p.job_number,
         COUNT(sl.id) AS sov_line_count
       FROM brighten_pm.pay_apps pa
       JOIN brighten_pm.projects p
         ON p.id = pa.project_id
       LEFT JOIN brighten_pm.sov_lines sl
         ON sl.pay_app_id = pa.id
       WHERE pa.project_id = ?
       GROUP BY
         pa.id, pa.project_id, pa.pay_app_number, pa.billing_period_start,
         pa.billing_period_end, pa.application_date, pa.contract_sum,
         pa.net_change_by_change_orders, pa.contract_sum_to_date,
         pa.total_completed_stored_to_date, pa.retainage_amount,
         pa.total_earned_less_retainage, pa.previous_certificates,
         pa.current_payment_due, pa.balance_to_finish, pa.status,
         pa.source_document_id, pa.notes, pa.created_at, p.job_number
       ORDER BY
         pa.billing_period_end DESC,
         pa.application_date DESC,
         pa.created_at DESC`,
      [project.projectId],
    );

    res.json({
      ok: true,
      source: 'sql',
      projectId: project.projectId,
      jobNumber: project.jobNumber,
      items: rows.map(mapPayAppHeader),
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/projects/:id/pay-apps/:payAppId', async (req, res, next) => {
  try {
    const project = await findProjectIdentity(req.params.id);
    if (!project) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }

    const row = await queryOne<GenericViewRow>(
      `SELECT
         pa.*,
         p.job_number,
         COUNT(sl.id) AS sov_line_count
       FROM brighten_pm.pay_apps pa
       JOIN brighten_pm.projects p
         ON p.id = pa.project_id
       LEFT JOIN brighten_pm.sov_lines sl
         ON sl.pay_app_id = pa.id
       WHERE pa.project_id = ?
         AND pa.id = ?
       GROUP BY
         pa.id, pa.project_id, pa.pay_app_number, pa.billing_period_start,
         pa.billing_period_end, pa.application_date, pa.contract_sum,
         pa.net_change_by_change_orders, pa.contract_sum_to_date,
         pa.total_completed_stored_to_date, pa.retainage_amount,
         pa.total_earned_less_retainage, pa.previous_certificates,
         pa.current_payment_due, pa.balance_to_finish, pa.status,
         pa.source_document_id, pa.notes, pa.created_at, p.job_number
       LIMIT 1`,
      [project.projectId, req.params.payAppId],
    );

    if (!row) {
      res.status(404).json({ ok: false, error: 'Pay app not found for project' });
      return;
    }

    const lines = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.sov_lines
       WHERE pay_app_id = ?
         AND project_id = ?
       ORDER BY
         CAST(line_number AS UNSIGNED),
         line_number`,
      [req.params.payAppId, project.projectId],
    );

    res.json({
      ok: true,
      source: 'sql',
      projectId: project.projectId,
      jobNumber: project.jobNumber,
      item: {
        ...mapPayAppHeader(row),
        lines: lines.map(mapSovLine),
      },
    });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/budget/confirm-estimate', async (req, res, next) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const params = [req.params.id, job, `J${job}`];
    const project = await queryOne<GenericViewRow>(
      `SELECT id FROM brighten_pm.v_project_dashboard
       WHERE id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    if (!project?.id) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const result = await withTransaction(conn =>
      confirmEstimatedBudgetForProject(conn, String(project.id)),
    );
    res.json({ ok: true, source: 'sql', projectId: project.id, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Budget confirm failed';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.get('/projects/:id/budget', async (req, res, next) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const params = [req.params.id, job, `J${job}`];
    const summary = await queryOne<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_budget_summary
       WHERE project_id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    const project = await queryOne<GenericViewRow>(
      `SELECT id
       FROM brighten_pm.v_project_dashboard
       WHERE id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    const projectId = summary?.project_id ?? project?.id ?? req.params.id;
    const lines = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.budget_lines
       WHERE project_id = ?
       ORDER BY cost_code`,
      [projectId],
    );
    res.json({ ok: true, summary, lines, lineCount: lines.length });
  } catch (err) {
    next(err);
  }
});

projectsRouter.post('/projects/:id/budget/lines', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const input = parseBudgetLineInput(req.body);
    const lineId = await withTransaction(conn => insertBudgetLine(conn, projectId, input));
    res.status(201).json({ ok: true, projectId, lineId });
  } catch (err) {
    if (err instanceof BudgetLineValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create budget line';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.post('/projects/:id/budget/lines/import', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const rawLines = (req.body as { lines?: unknown[] })?.lines;
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      res.status(400).json({ ok: false, error: 'Request body must include a non-empty "lines" array.' });
      return;
    }

    const inputs = rawLines.map((line, index) => {
      try {
        return parseBudgetLineInput(line);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid line';
        throw new BudgetLineValidationError(`Line ${index + 1}: ${message}`);
      }
    });

    const lineIds = await withTransaction(async conn => {
      const ids: string[] = [];
      for (const input of inputs) {
        ids.push(await insertBudgetLine(conn, projectId, input));
      }
      return ids;
    });

    res.status(201).json({ ok: true, projectId, imported: lineIds.length, lineIds });
  } catch (err) {
    if (err instanceof BudgetLineValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import budget lines';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.patch('/projects/:id/budget/lines/:lineId', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const input = parseBudgetLineInput(req.body);
    const updated = await withTransaction(conn =>
      updateBudgetLine(conn, projectId, req.params.lineId, input),
    );
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Budget line not found' });
      return;
    }
    res.json({ ok: true, projectId, lineId: req.params.lineId });
  } catch (err) {
    if (err instanceof BudgetLineValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update budget line';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.delete('/projects/:id/budget/lines/:lineId', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const deleted = await withTransaction(conn => deleteBudgetLine(conn, projectId, req.params.lineId));
    if (!deleted) {
      res.status(404).json({ ok: false, error: 'Budget line not found' });
      return;
    }
    res.json({ ok: true, projectId, lineId: req.params.lineId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete budget line';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.get('/projects/:id/labor', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const summary = await queryOne<GenericViewRow>(
      `SELECT * FROM brighten_pm.v_project_labor_summary WHERE project_id = ? LIMIT 1`,
      [projectId],
    );
    const entries = await queryRows<GenericViewRow>(
      `SELECT * FROM brighten_pm.labor_entries WHERE project_id = ? ORDER BY work_date DESC, id DESC`,
      [projectId],
    );
    res.json({ ok: true, projectId, summary, entries, entryCount: entries.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load labor entries';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.post('/projects/:id/labor', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const input = parseLaborEntryInput(req.body);
    const entryId = await withTransaction(conn => insertLaborEntry(conn, projectId, input));
    res.status(201).json({ ok: true, projectId, entryId });
  } catch (err) {
    if (err instanceof LaborEntryValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create labor entry';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.post('/projects/:id/labor/import', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const rawEntries = (req.body as { entries?: unknown[] })?.entries;
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      res.status(400).json({ ok: false, error: 'Request body must include a non-empty "entries" array.' });
      return;
    }

    const inputs = rawEntries.map((entry, index) => {
      try {
        return parseLaborEntryInput(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid entry';
        throw new LaborEntryValidationError(`Row ${index + 1}: ${message}`);
      }
    });

    const entryIds = await withTransaction(async conn => {
      const ids: string[] = [];
      for (const input of inputs) {
        ids.push(await insertLaborEntry(conn, projectId, input));
      }
      return ids;
    });

    res.status(201).json({ ok: true, projectId, imported: entryIds.length, entryIds });
  } catch (err) {
    if (err instanceof LaborEntryValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import labor entries';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.patch('/projects/:id/labor/:entryId', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const input = parseLaborEntryInput(req.body);
    const updated = await withTransaction(conn =>
      updateLaborEntry(conn, projectId, req.params.entryId, input),
    );
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Labor entry not found' });
      return;
    }
    res.json({ ok: true, projectId, entryId: req.params.entryId });
  } catch (err) {
    if (err instanceof LaborEntryValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to update labor entry';
    res.status(400).json({ ok: false, error: message });
  }
});

projectsRouter.delete('/projects/:id/labor/:entryId', async (req, res) => {
  try {
    const job = normalizeJobNumber(req.params.id);
    const projectId = await resolveProjectId(getPool(), req.params.id, job);
    if (!projectId) {
      res.status(404).json({ ok: false, error: 'Project not found' });
      return;
    }
    const deleted = await withTransaction(conn => deleteLaborEntry(conn, projectId, req.params.entryId));
    if (!deleted) {
      res.status(404).json({ ok: false, error: 'Labor entry not found' });
      return;
    }
    res.json({ ok: true, projectId, entryId: req.params.entryId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete labor entry';
    res.status(400).json({ ok: false, error: message });
  }
});

/**
 * Cross-project Timelogs import.
 * Accepts rows from the Timelogs sheet (job number + labor fields), resolves each
 * project by job number, and bulk-inserts all entries in a single transaction.
 * Rows whose job number cannot be matched are skipped and returned in unmatchedJobs.
 */
projectsRouter.post('/labor/timelogs-import', async (req, res) => {
  try {
    const rawRows = (req.body as { rows?: unknown[] })?.rows;
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      res.status(400).json({ ok: false, error: 'Request body must include a non-empty "rows" array.' });
      return;
    }

    interface TimelogRow {
      jobId: string;
      workDate: string;
      employeeName: string;
      classification?: string | null;
      regularHours: number;
      overtimeHours: number;
      doubleTimeHours: number;
      laborCost?: number | null;
      notes?: string | null;
    }

    // Parse and validate each row
    const parsed: TimelogRow[] = rawRows.map((r, i) => {
      if (!r || typeof r !== 'object') throw new LaborEntryValidationError(`Row ${i + 1}: must be an object.`);
      const row = r as Record<string, unknown>;
      const jobId = typeof row.jobId === 'string' ? row.jobId.trim() : '';
      if (!jobId) throw new LaborEntryValidationError(`Row ${i + 1}: "jobId" is required.`);
      // Reuse existing labor validation for the labor fields
      const entry = parseLaborEntryInput(row);
      return { jobId, ...entry };
    });

    // Resolve project IDs (cache per jobId to avoid repeated queries)
    const pool = getPool();
    const projectIdCache = new Map<string, string | null>();
    for (const row of parsed) {
      if (!projectIdCache.has(row.jobId)) {
        const job = normalizeJobNumber(row.jobId);
        const pid = await resolveProjectId(pool, row.jobId, job);
        projectIdCache.set(row.jobId, pid);
      }
    }

    const unmatchedJobs = [...new Set(
      [...projectIdCache.entries()].filter(([, pid]) => pid === null).map(([jid]) => jid),
    )];

    const matchedRows = parsed.filter(row => projectIdCache.get(row.jobId) !== null);
    if (matchedRows.length === 0) {
      res.status(207).json({ ok: false, imported: 0, skipped: parsed.length, unmatchedJobs,
        error: `No rows matched a known project. Unmatched job IDs: ${unmatchedJobs.join(', ')}` });
      return;
    }

    const imported = await withTransaction(async conn => {
      let count = 0;
      for (const row of matchedRows) {
        const projectId = projectIdCache.get(row.jobId)!;
        const { jobId: _jobId, ...entry } = row;
        await insertLaborEntry(conn, projectId, entry);
        count++;
      }
      return count;
    });

    res.status(201).json({
      ok: true,
      imported,
      skipped: parsed.length - imported,
      unmatchedJobs,
    });
  } catch (err) {
    if (err instanceof LaborEntryValidationError) {
      res.status(err.statusCode).json({ ok: false, error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to import timelogs';
    res.status(400).json({ ok: false, error: message });
  }
});
