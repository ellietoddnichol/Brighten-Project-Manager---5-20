import type mysql from 'mysql2/promise';
import { getPool, queryRows, withTransaction } from '../db.js';

export interface WebhookEventRow extends mysql.RowDataPacket {
  id: number;
  source: string;
  event_type: string | null;
  payload: string | null;
  status: string;
  received_at: Date;
  processed_at: Date | null;
  external_id: string | null;
}

export async function ensureWebhookEventsTable(): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS brighten_pm.webhook_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        event_type VARCHAR(128) NULL,
        payload JSON NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        external_id VARCHAR(255) NULL,
        INDEX idx_webhook_status (status),
        INDEX idx_webhook_source (source)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }
}

export async function insertWebhookEvent(input: {
  source: string;
  eventType?: string;
  payload: unknown;
  externalId?: string;
}): Promise<number> {
  const result = await withTransaction(async conn => {
    const [insertResult] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO brighten_pm.webhook_events
        (source, event_type, payload, status, external_id)
       VALUES (?, ?, ?, 'pending', ?)`,
      [
        input.source,
        input.eventType ?? null,
        JSON.stringify(input.payload ?? {}),
        input.externalId ?? null,
      ],
    );
    return insertResult.insertId;
  });
  return result;
}

export async function listPendingWebhookEvents(limit = 50): Promise<WebhookEventRow[]> {
  return queryRows<WebhookEventRow>(
    `SELECT id, source, event_type, payload, status, received_at, processed_at, external_id
     FROM brighten_pm.webhook_events
     WHERE status = 'pending'
     ORDER BY received_at ASC
     LIMIT ?`,
    [limit],
  );
}

export async function markWebhookEventProcessed(id: number): Promise<boolean> {
  return withTransaction(async conn => {
    const [result] = await conn.query<mysql.ResultSetHeader>(
      `UPDATE brighten_pm.webhook_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending'`,
      [id],
    );
    return result.affectedRows > 0;
  });
}

export function parseWebhookPayload(row: WebhookEventRow): unknown {
  if (!row.payload) return {};
  if (typeof row.payload === 'object') return row.payload;
  try {
    return JSON.parse(row.payload);
  } catch {
    return { raw: row.payload };
  }
}
