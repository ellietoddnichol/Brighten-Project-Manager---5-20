#!/usr/bin/env node
/**
 * One-time backfill: set ownerId on every Firestore document that is missing
 * it or has a different ownerId, so Firestore security rules stop blocking edits.
 *
 * Usage:
 *   node scripts/backfill-owner-id.mjs <firebase-user-uid> [service-account.json]
 *
 * Get your UID from Firebase console → Authentication → Users, or from the
 * browser console after signing in: firebase.auth().currentUser.uid
 *
 * Dry-run (no writes) by default. Pass --write to apply changes.
 *
 * Example (dry-run):
 *   node scripts/backfill-owner-id.mjs abc123uid
 *
 * Example (apply):
 *   node scripts/backfill-owner-id.mjs abc123uid service-account.json --write
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';

const args = process.argv.slice(2);
const ownerId = args.find(a => !a.startsWith('--') && !a.endsWith('.json'));
const credentialsPath = args.find(a => a.endsWith('.json')) || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const dryRun = !args.includes('--write');

if (!ownerId) {
  console.error('Usage: node scripts/backfill-owner-id.mjs <firebase-user-uid> [service-account.json] [--write]');
  process.exit(1);
}

if (dryRun) {
  console.log('DRY RUN — no changes will be written. Pass --write to apply.\n');
}

if (credentialsPath && existsSync(credentialsPath)) {
  initializeApp({
    credential: cert(JSON.parse(readFileSync(credentialsPath, 'utf8'))),
    projectId: 'brighten-project-manager',
  });
} else {
  initializeApp({
    credential: applicationDefault(),
    projectId: 'brighten-project-manager',
  });
}

const db = getFirestore();

// All collections with ownerId in security rules
const COLLECTIONS = [
  'projects',
  'tasks',
  'pos',
  'change-orders',
  'billings',
  'milestones',
  'documents',
  'budget-lines',
  'project-folders',
  'project-files',
  'required-documents',
  'project-issues',
  'project-tasks',
  'change-requests',
  'rfis',
  'submittals',
  'daily-logs',
  'field-issues',
  'pay-app-lines',
  'ar-records',
  'project-labor-actuals',
  'subcontractors',
  'project-subcontractors',
  'subcontractor-documents',
  'subcontractor-invoices',
  'foreman-bonus-policies',
  'project-foreman-assignments',
  'foreman-bonus-records',
  'foreman-bonus-payments',
  'labor-code-mappings',
  'employees',
  'time-entries',
  'certified-payroll-entries',
  'certified-payroll-weeks',
];

const BATCH_SIZE = 400; // Firestore batch limit is 500

let totalScanned = 0;
let totalPatched = 0;
let totalAlready = 0;

for (const collection of COLLECTIONS) {
  const snap = await db.collection(collection).get();
  if (snap.empty) continue;

  const toUpdate = snap.docs.filter(d => d.data().ownerId !== ownerId);
  totalScanned += snap.size;
  totalAlready += snap.size - toUpdate.length;

  if (toUpdate.length === 0) {
    console.log(`${collection}: ${snap.size} docs — all already match ✓`);
    continue;
  }

  console.log(`${collection}: ${snap.size} docs — ${toUpdate.length} need patching`);

  if (!dryRun) {
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const docSnap of toUpdate.slice(i, i + BATCH_SIZE)) {
        batch.update(docSnap.ref, { ownerId, updatedAt: FieldValue.serverTimestamp() });
      }
      await batch.commit();
    }
  }

  totalPatched += toUpdate.length;
}

console.log('\n--- Summary ---');
console.log(`Scanned : ${totalScanned} docs across ${COLLECTIONS.length} collections`);
console.log(`Already correct : ${totalAlready}`);
console.log(`${dryRun ? 'Would patch' : 'Patched'} : ${totalPatched}`);

if (dryRun && totalPatched > 0) {
  console.log('\nRe-run with --write to apply these changes.');
}
