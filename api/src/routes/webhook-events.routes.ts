import { Router } from 'express';
import {
  listPendingWebhookEvents,
  markWebhookEventProcessed,
  parseWebhookPayload,
} from '../utils/webhookEvents.js';

export const webhookEventsRouter = Router();

webhookEventsRouter.get('/webhook-events/pending', async (_req, res, next) => {
  try {
    const rows = await listPendingWebhookEvents();
    res.json({
      ok: true,
      count: rows.length,
      events: rows.map(row => ({
        id: row.id,
        source: row.source,
        eventType: row.event_type,
        payload: parseWebhookPayload(row),
        status: row.status,
        receivedAt: row.received_at,
        externalId: row.external_id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

webhookEventsRouter.post('/webhook-events/:id/processed', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, error: 'Invalid event id' });
      return;
    }
    const updated = await markWebhookEventProcessed(id);
    if (!updated) {
      res.status(404).json({ ok: false, error: 'Event not found or already processed' });
      return;
    }
    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});
