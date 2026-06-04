import './loadEnv.js';
import cors from 'cors';
import express from 'express';
import { healthRouter } from './routes/health.routes.js';
import { projectsRouter } from './routes/projects.routes.js';
import { actionCenterRouter } from './routes/action-center.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const port = Number(process.env.API_PORT ?? 8080);
const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', projectsRouter);
app.use('/api', actionCenterRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Brighten PM API listening on http://localhost:${port}`);
  console.log(`CORS origin: ${corsOrigin}`);
});
