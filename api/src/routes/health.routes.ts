import { Router } from 'express';
import { pingDatabase } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res, next) => {
  try {
    await pingDatabase();
    res.json({
      ok: true,
      database: process.env.DB_NAME ?? 'brighten_pm',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
