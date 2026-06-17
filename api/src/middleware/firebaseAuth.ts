import type { RequestHandler } from 'express';
import { initializeApp, applicationDefault, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'node:fs';

function isAuthRequired(): boolean {
  const flag = process.env.API_AUTH_REQUIRED?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  if (flag === 'true' || flag === '1' || flag === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

function ensureFirebaseAdmin(): void {
  if (getApps().length > 0) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'brighten-project-manager';
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath && existsSync(credentialsPath)) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(credentialsPath, 'utf8'))),
      projectId,
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

/** Require Firebase ID token on /api/* routes (mount after health router). */
export const requireFirebaseAuth: RequestHandler = async (req, res, next) => {
  if (!isAuthRequired()) {
    next();
    return;
  }

  const header = req.headers.authorization ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ ok: false, error: 'Missing Authorization Bearer token' });
    return;
  }

  try {
    ensureFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(match[1]);
    (req as typeof req & { firebaseUid?: string }).firebaseUid = decoded.uid;
    next();
  } catch (err) {
    console.warn('[auth] Token verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
};
