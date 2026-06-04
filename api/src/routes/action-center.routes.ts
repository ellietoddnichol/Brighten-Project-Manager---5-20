import { Router } from 'express';
import { queryRows } from '../db.js';
import type { GenericViewRow } from '../types.js';

export const actionCenterRouter = Router();

actionCenterRouter.get('/action-center', async (_req, res, next) => {
  try {
    const items = await queryRows<GenericViewRow>(
      'SELECT * FROM brighten_pm.v_action_center',
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

actionCenterRouter.get('/backend-readiness', async (_req, res, next) => {
  try {
    const items = await queryRows<GenericViewRow>(
      'SELECT * FROM brighten_pm.v_backend_readiness_summary',
    );
    res.json({ ok: true, count: items.length, items });
  } catch (err) {
    next(err);
  }
});
