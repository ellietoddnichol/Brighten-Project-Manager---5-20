import './loadEnv.js';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { healthRouter } from './routes/health.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { actionCenterRouter } from './routes/action-center.routes.js';
import { subcontractorsRouter } from './routes/subcontractors.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { webhookEventsRouter } from './routes/webhook-events.routes.js';
import { ensureWebhookEventsTable } from './utils/webhookEvents.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireFirebaseAuth } from './middleware/firebaseAuth.js';

const app = express();
const port = Number(process.env.API_PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
const corsOrigins = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);
const staticDir = process.env.APP_STATIC_DIR;

app.use(cors({
  origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0] ?? corsOrigin,
  credentials: true,
}));

app.use('/webhooks', webhooksRouter);
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', requireFirebaseAuth);
app.use('/api', projectsRouter);
app.use('/api', actionCenterRouter);
app.use('/api', subcontractorsRouter);
app.use('/api', webhookEventsRouter);

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
  void ensureWebhookEventsTable().catch(err => {
    console.error('[webhook] Failed to ensure webhook_events table:', err);
  });
});
