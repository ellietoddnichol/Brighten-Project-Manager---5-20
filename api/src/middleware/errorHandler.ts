import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[api]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ ok: false, error: message });
};
