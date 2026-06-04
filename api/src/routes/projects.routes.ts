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
    const params = projectFilterParams(req.params.id);
    const item = await queryOne<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_financial_detail
       WHERE project_id = ? OR id = ? OR job_number = ? OR job_number = ?
       LIMIT 1`,
      params,
    );
    if (!item) {
      res.status(404).json({ ok: false, error: 'Financial detail not found for project' });
      return;
    }
    res.json({ ok: true, item });
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
