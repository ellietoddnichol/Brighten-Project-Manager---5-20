import { Router } from 'express';
import { queryRows } from '../db.js';
import type { GenericViewRow } from '../types.js';
import { projectFilterParams } from '../utils/projectFilter.js';

export const subcontractorsRouter = Router();

subcontractorsRouter.get('/subcontractors', async (_req, res, next) => {
  try {
    const items = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.subcontractors
       ORDER BY company_name`,
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

subcontractorsRouter.get('/subcontractors/invoices', async (_req, res, next) => {
  try {
    const items = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.subcontractor_invoices
       ORDER BY invoice_date DESC, subcontractor_name`,
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

subcontractorsRouter.get('/projects/:id/subcontractors', async (req, res, next) => {
  try {
    const [key, keyAlt, job, jobAlt] = projectFilterParams(req.params.id);
    const items = await queryRows<GenericViewRow>(
      `SELECT *
       FROM brighten_pm.v_project_subcontractors
       WHERE project_id = ? OR project_id = ?
         OR project_job_number = ? OR project_job_number = ?
         OR job_number = ? OR job_number = ?
       ORDER BY subcontractor_name`,
      [key, keyAlt, job, jobAlt, job, jobAlt],
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});
