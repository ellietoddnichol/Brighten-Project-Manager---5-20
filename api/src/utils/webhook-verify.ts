import crypto from 'crypto';

/**
 * Verify a QuickBooks Online webhook notification.
 *
 * QB signs the raw POST body with HMAC-SHA256 using the webhook verifier token
 * as the key, then base64-encodes the result. The signature arrives in the
 * `intuit-signature` request header.
 *
 * Set QB_WEBHOOK_VERIFIER_TOKEN in .env.local (get it from developer.intuit.com
 * under your app → Webhooks → Verifier Token).
 */
export function verifyQuickBooksSignature(
  rawBody: Buffer,
  signature: string,
): boolean {
  const token = process.env.QB_WEBHOOK_VERIFIER_TOKEN;
  if (!token) {
    console.warn('[webhook] QB_WEBHOOK_VERIFIER_TOKEN not set — rejecting request');
    return false;
  }
  const expected = crypto
    .createHmac('sha256', token)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Verify a Google Drive push notification channel token.
 *
 * When registering a watch channel from Angular (DriveWebhooksService), the
 * DRIVE_WEBHOOK_CHANNEL_TOKEN value is set as the channel `token`. Google echoes
 * it back in every notification as the `X-Goog-Channel-Token` header.
 *
 * Set DRIVE_WEBHOOK_CHANNEL_TOKEN in .env.local (any random secret string).
 */
export function verifyDriveChannelToken(channelToken: string): boolean {
  const expected = process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN;
  if (!expected) {
    console.warn('[webhook] DRIVE_WEBHOOK_CHANNEL_TOKEN not set — rejecting request');
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(channelToken, 'utf8'),
    );
  } catch {
    return false;
  }
}
