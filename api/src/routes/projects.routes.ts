import { Router } from 'express';
import { queryOne, queryRows } from '../db.js';
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

projectsRouter.get('/projects/:id/budget', async (req, res, next) => {
  try {
    const params = projectFilterParams(req.params.id);
    const summary = await queryOne<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_budget_summary
       WHERE project_id = ? OR id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    const lines = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.budget_lines
       WHERE project_id = ? OR job_number = ? OR job_number = ?
       ORDER BY cost_code`,
      [req.params.id, normalizeJobNumber(req.params.id), `J${normalizeJobNumber(req.params.id)}`],
    );
    res.json({ ok: true, summary, lines, lineCount: lines.length });
  } catch (err) {
    next(err);
  }
});
