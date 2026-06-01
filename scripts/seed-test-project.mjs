import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';

const ownerId = process.argv[2];
const credentialsPath = process.argv[3] || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!ownerId) {
  console.error('Usage: node scripts/seed-test-project.mjs <firebase-user-id> [service-account.json]');
  process.exit(1);
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
const id = randomUUID();

await db.collection('projects').doc(id).set({
  projectNumber: '2025-001',
  projectName: 'Demo Job — Main Street Renovation',
  customer: 'Brighten Builders LLC',
  status: 'Active',
  originalContractAmount: 250000,
  ownerId,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

console.log(`Created project ${id} for user ${ownerId}`);
