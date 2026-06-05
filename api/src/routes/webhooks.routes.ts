import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { queryRows, queryOne, withTransaction } from '../db.js';
import { verifyQuickBooksSignature, verifyDriveChannelToken } from '../utils/webhook-verify.js';

export const webhooksRouter = Router();

// ---------------------------------------------------------------------------
// Ensure the webhook_events table exists (idempotent, runs at startup)
// ---------------------------------------------------------------------------

export async function ensureWebhookEventsTable(): Promise<void> {
  await withTransaction(async (conn) => {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS brighten_pm.webhook_events (
        id            VARCHAR(36)   NOT NULL PRIMARY KEY,
        source        VARCHAR(50)   NOT NULL COMMENT 'quickbooks | drive',
        event_type    VARCHAR(100)  DEFAULT NULL COMMENT 'QB entity name or Drive resource state',
        resource_id   VARCHAR(255)  DEFAULT NULL COMMENT 'QB entity ID or Drive file/folder ID',
        channel_id    VARCHAR(255)  DEFAULT NULL COMMENT 'Drive watch channel ID',
        realm_id      VARCHAR(100)  DEFAULT NULL COMMENT 'QB realm (company) ID',
        payload       JSON          DEFAULT NULL COMMENT 'Full webhook payload',
        status        VARCHAR(20)   NOT NULL DEFAULT 'pending' COMMENT 'pending | processed | error',
        processed_at  DATETIME      DEFAULT NULL,
        error_message TEXT          DEFAULT NULL,
        received_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_source (source),
        INDEX idx_received (received_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  });
}

// ---------------------------------------------------------------------------
// POST /webhooks/quickbooks
//
// Receives entity-change notifications from QuickBooks Online.
// QB expects a 200 response within 5 seconds — acknowledge first, process async.
//
// Setup in Intuit Developer Portal:
//   App → Webhooks → Add endpoint → https://your-api/webhooks/quickbooks
//   Copy the Verifier Token into QB_WEBHOOK_VERIFIER_TOKEN in your env.
//
// Payload shape:
//   { eventNotifications: [{ realmId, dataChangeEvent: { entities: [{ name, id, operation, lastUpdated }] } }] }
// ---------------------------------------------------------------------------

webhooksRouter.post('/webhooks/quickbooks', async (req: Request, res: Response) => {
  const signature = req.headers['intuit-signature'] as string | undefined;

  if (!signature) {
    console.warn('[webhook/qb] Missing intuit-signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  // rawBody is captured by the raw-body middleware mounted in server.ts
  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');

  if (!verifyQuickBooksSignature(rawBody, signature)) {
    console.warn('[webhook/qb] Signature verification failed');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Acknowledge immediately — QB requires 200 within 5 seconds
  res.status(200).send('OK');

  // Process asynchronously after responding
  void processQuickBooksNotification(req.body).catch((err: unknown) => {
    console.error('[webhook/qb] Processing error:', err);
  });
});

async function processQuickBooksNotification(body: unknown): Promise<void> {
  const payload = body as {
    eventNotifications?: Array<{
      realmId?: string;
      dataChangeEvent?: {
        entities?: Array<{
          name: string;
          id: string;
          operation: string;
          lastUpdated: string;
        }>;
      };
    }>;
  };

  const notifications = payload?.eventNotifications ?? [];

  for (const notification of notifications) {
    const realmId = notification.realmId ?? null;
    const entities = notification.dataChangeEvent?.entities ?? [];

    for (const entity of entities) {
      const id = randomUUID();
      console.log(`[webhook/qb] Received ${entity.name} ${entity.operation} (id=${entity.id}, realm=${realmId})`);

      await withTransaction(async (conn) => {
        await conn.execute(
          `INSERT INTO brighten_pm.webhook_events
             (id, source, event_type, resource_id, realm_id, payload, status, received_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            id,
            'quickbooks',
            `${entity.name}.${entity.operation}`,
            entity.id,
            realmId,
            JSON.stringify({ entity, realmId }),
          ],
        );
      });
    }
  }
}

// ---------------------------------------------------------------------------
// POST /webhooks/drive
//
// Receives push notifications from Google Drive when a watched file or folder
// changes. Drive sends only a notification header — no file content. Your app
// must then query Drive to learn what changed.
//
// Drive notification headers:
//   X-Goog-Channel-ID      — the channel ID you provided when registering
//   X-Goog-Channel-Token   — the secret token you provided (used to verify)
//   X-Goog-Resource-ID     — stable ID of the watched resource
//   X-Goog-Resource-State  — sync | update | add | remove | trash | untrash
//   X-Goog-Changed         — comma-separated list: content, properties, parents, children
//   X-Goog-Message-Number  — monotonically increasing per channel
//
// The first notification after channel registration has resource-state = "sync"
// and should be acknowledged and ignored.
//
// Setup (from Angular DriveWebhooksService):
//   POST https://www.googleapis.com/drive/v3/files/{fileId}/watch  (files.watch)
//   POST https://www.googleapis.com/drive/v3/changes/watch          (changes.watch)
//   body: { id: channelId, type: "web_hook", address: "https://your-api/webhooks/drive",
//           token: DRIVE_WEBHOOK_CHANNEL_TOKEN, expiration: <epoch-ms> }
// ---------------------------------------------------------------------------

webhooksRouter.post('/webhooks/drive', async (req: Request, res: Response) => {
  const channelId      = req.headers['x-goog-channel-id'] as string | undefined;
  const channelToken   = req.headers['x-goog-channel-token'] as string | undefined;
  const resourceId     = req.headers['x-goog-resource-id'] as string | undefined;
  const resourceState  = req.headers['x-goog-resource-state'] as string | undefined;
  const changed        = req.headers['x-goog-changed'] as string | undefined;
  const messageNumber  = req.headers['x-goog-message-number'] as string | undefined;

  if (!channelToken || !verifyDriveChannelToken(channelToken)) {
    console.warn('[webhook/drive] Invalid or missing channel token');
    res.status(401).json({ error: 'Invalid channel token' });
    return;
  }

  // Acknowledge immediately
  res.status(200).send('OK');

  // The first "sync" notification is just Drive confirming channel setup — skip
  if (resourceState === 'sync') {
    console.log(`[webhook/drive] Sync confirmation received for channel ${channelId}`);
    return;
  }

  console.log(
    `[webhook/drive] Change notification: channel=${channelId}, state=${resourceState}, ` +
    `resource=${resourceId}, changed=${changed}, msg#${messageNumber}`,
  );

  void recordDriveEvent({
    channelId: channelId ?? null,
    resourceId: resourceId ?? null,
    resourceState: resourceState ?? null,
    changed: changed ?? null,
  }).catch((err: unknown) => {
    console.error('[webhook/drive] Failed to record event:', err);
  });
});

async function recordDriveEvent(event: {
  channelId: string | null;
  resourceId: string | null;
  resourceState: string | null;
  changed: string | null;
}): Promise<void> {
  const id = randomUUID();
  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO brighten_pm.webhook_events
         (id, source, event_type, resource_id, channel_id, payload, status, received_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [
        id,
        'drive',
        event.resourceState,
        event.resourceId,
        event.channelId,
        JSON.stringify(event),
      ],
    );
  });
}

// ---------------------------------------------------------------------------
// GET /api/webhook-events/pending
//
// Returns unprocessed webhook events for the Angular app to handle.
// Angular polls this every ~30 seconds, processes events, then marks them done.
//
// Query params:
//   source  — filter by 'quickbooks' or 'drive' (optional)
//   limit   — max rows to return (default 50)
// ---------------------------------------------------------------------------

webhooksRouter.get('/webhook-events/pending', async (req: Request, res: Response) => {
  const source = req.query['source'] as string | undefined;
  const limit  = Math.min(Number(req.query['limit'] ?? 50), 100);

  const rows = await queryRows<{
    id: string;
    source: string;
    event_type: string | null;
    resource_id: string | null;
    channel_id: string | null;
    realm_id: string | null;
    payload: string | null;
    received_at: string;
  }>(
    `SELECT id, source, event_type, resource_id, channel_id, realm_id, payload, received_at
     FROM brighten_pm.webhook_events
     WHERE status = 'pending'
     ${source ? 'AND source = ?' : ''}
     ORDER BY received_at ASC
     LIMIT ?`,
    source ? [source, limit] : [limit],
  );

  res.json({
    events: rows.map(r => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : null,
    })),
    count: rows.length,
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhook-events/:id/processed
//
// Angular calls this after successfully handling an event.
// ---------------------------------------------------------------------------

webhooksRouter.post('/webhook-events/:id/processed', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = req.body as { error?: string };

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM brighten_pm.webhook_events WHERE id = ?`,
    [id],
  );

  if (!existing) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  await withTransaction(async (conn) => {
    await conn.execute(
      `UPDATE brighten_pm.webhook_events
       SET status = ?, processed_at = NOW(), error_message = ?
       WHERE id = ?`,
      [error ? 'error' : 'processed', error ?? null, id],
    );
  });

  res.json({ ok: true });
});
