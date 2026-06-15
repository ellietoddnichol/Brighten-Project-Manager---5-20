import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { insertWebhookEvent } from '../utils/webhookEvents.js';

export const webhooksRouter = Router();

function qbVerifierToken(): string {
  return process.env.QB_WEBHOOK_VERIFIER_TOKEN?.trim() ?? '';
}

function driveChannelToken(): string {
  return process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN?.trim() ?? '';
}

function verifyQuickBooksSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const token = qbVerifierToken();
  if (!token) {
    console.warn('[webhook/qb] QB_WEBHOOK_VERIFIER_TOKEN is not configured');
    return false;
  }
  if (!signatureHeader) return false;
  const hash = crypto.createHmac('sha256', token).update(rawBody).digest('base64');
  return hash === signatureHeader;
}

webhooksRouter.post(
  '/quickbooks',
  express.raw({ type: '*/*' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
      const signature = req.header('intuit-signature') ?? undefined;

      if (!verifyQuickBooksSignature(rawBody, signature)) {
        console.warn('[webhook/qb] Invalid signature');
        res.status(401).json({ ok: false, error: 'Invalid signature' });
        return;
      }

      let payload: unknown = {};
      try {
        payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
      } catch {
        payload = { raw: rawBody.toString('utf8') };
      }

      const events = Array.isArray((payload as { eventNotifications?: unknown[] }).eventNotifications)
        ? (payload as { eventNotifications: unknown[] }).eventNotifications
        : [payload];

      const insertedIds: number[] = [];
      for (const event of events) {
        const notification = event as {
          realmId?: string;
          dataChangeEvent?: { entities?: Array<{ name?: string; id?: string; operation?: string }> };
        };
        const entities = notification.dataChangeEvent?.entities ?? [];
        for (const entity of entities) {
          const eventType = `${entity.name ?? 'Unknown'}.${entity.operation ?? 'Change'}`;
          const id = await insertWebhookEvent({
            source: 'quickbooks',
            eventType,
            payload: { realmId: notification.realmId, entity, notification: event },
            externalId: entity.id ? String(entity.id) : undefined,
          });
          insertedIds.push(id);
          console.log(`[webhook/qb] Received ${eventType} (id=${entity.id ?? 'n/a'}, realm=${notification.realmId ?? 'n/a'})`);
        }

        if (!entities.length) {
          const id = await insertWebhookEvent({
            source: 'quickbooks',
            eventType: 'Notification',
            payload: event,
          });
          insertedIds.push(id);
          console.log('[webhook/qb] Received notification without entity payload');
        }
      }

      res.status(200).json({ ok: true, inserted: insertedIds.length, ids: insertedIds });
    } catch (err) {
      next(err);
    }
  },
);

webhooksRouter.post(
  '/drive',
  express.json({ type: '*/*' }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expectedToken = driveChannelToken();
      const channelToken = req.header('X-Goog-Channel-Token') ?? '';
      const channelId = req.header('X-Goog-Channel-Id') ?? '';
      const resourceId = req.header('X-Goog-Resource-Id') ?? '';
      const resourceState = req.header('X-Goog-Resource-State') ?? 'unknown';

      if (expectedToken && channelToken !== expectedToken) {
        console.warn('[webhook/drive] Invalid channel token');
        res.status(401).json({ ok: false, error: 'Invalid channel token' });
        return;
      }

      const id = await insertWebhookEvent({
        source: 'drive',
        eventType: `Drive.${resourceState}`,
        payload: {
          channelId,
          resourceId,
          resourceState,
          messageNumber: req.header('X-Goog-Message-Number'),
          changed: req.header('X-Goog-Changed'),
          body: req.body ?? {},
        },
        externalId: channelId || resourceId || undefined,
      });

      console.log(`[webhook/drive] Change notification: channel=${channelId}, state=${resourceState}`);

      res.status(200).json({ ok: true, id });
    } catch (err) {
      next(err);
    }
  },
);
