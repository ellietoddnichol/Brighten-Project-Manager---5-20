import './loadEnv.js';
import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { healthRouter } from './routes/health.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { actionCenterRouter } from './routes/action-center.routes.js';
<<<<<<< HEAD
import { webhooksRouter } from './routes/webhooks.routes.js';
import { webhookEventsRouter } from './routes/webhook-events.routes.js';
import { ensureWebhookEventsTable } from './utils/webhookEvents.js';
=======
import { webhooksRouter, ensureWebhookEventsTable } from './routes/webhooks.routes.js';
>>>>>>> origin/claude/bold-hawking-ZZo7f
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const port = Number(process.env.API_PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const corsOrigins = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);
const staticDir = process.env.APP_STATIC_DIR;

<<<<<<< HEAD
app.use(cors({
  origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0] ?? corsOrigin,
  credentials: true,
}));

app.use('/webhooks', webhooksRouter);
=======
app.use(cors({ origin: corsOrigin, credentials: true }));

// Webhook routes need the raw request body for signature verification.
// Mount them BEFORE express.json() so the body isn't already parsed.
// We attach rawBody to the request for use in the route handler.
app.use('/webhooks', (req: Request, res: Response, next: NextFunction) => {
  express.raw({ type: '*/*', limit: '1mb' })(req, res, (err) => {
    if (err) { next(err); return; }
    (req as Request & { rawBody: Buffer }).rawBody = req.body as Buffer;
    // Re-parse as JSON so route handlers can use req.body normally
    if (req.body instanceof Buffer && req.body.length > 0) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'));
      } catch {
        req.body = {};
      }
    }
    next();
  });
});

>>>>>>> origin/claude/bold-hawking-ZZo7f
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', projectsRouter);
app.use('/api', actionCenterRouter);
<<<<<<< HEAD
app.use('/api', webhookEventsRouter);
=======
app.use('/api', webhooksRouter);
// Webhook endpoints live at /webhooks/* (no /api prefix) so Drive/QB can POST directly
app.use('/', webhooksRouter);
>>>>>>> origin/claude/bold-hawking-ZZo7f

if (staticDir) {
  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Brighten PM API listening on http://localhost:${port}`);
  console.log(`CORS origin: ${corsOrigin}`);
<<<<<<< HEAD
  void ensureWebhookEventsTable().catch(err => {
    console.error('[webhook] Failed to ensure webhook_events table:', err);
=======
  // Ensure webhook_events table exists (no-op if already present)
  ensureWebhookEventsTable().catch((err: unknown) => {
    console.warn('[startup] Could not ensure webhook_events table:', err);
>>>>>>> origin/claude/bold-hawking-ZZo7f
  });
});
