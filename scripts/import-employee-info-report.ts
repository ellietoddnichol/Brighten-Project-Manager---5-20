#!/usr/bin/env node
/**
 * Import ADP Employee Info Report (.xlsx) into Firestore employees collection.
 *
 * Usage:
 *   npx tsx scripts/import-employee-info-report.ts <path-to-xlsx> [firebase-user-uid] [service-account.json]
 *
 * If firebase-user-uid is omitted, uses ownerId from the first existing employee document.
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import * as XLSX from 'xlsx';
import { parseEmployeeInfoReportRows } from '../src/app/shared/utils/employee-info-report.parser.ts';
import { employeeNameMatchKey } from '../src/app/shared/utils/employee-name-match.ts';

const xlsxPath = process.argv[2];
let ownerId = process.argv[3];
const credentialsPath = process.argv[4] || process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!xlsxPath) {
  console.error('Usage: npx tsx scripts/import-employee-info-report.ts <employee-info-report.xlsx> [firebase-user-uid] [service-account.json]');
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

if (!ownerId) {
  const snap = await db.collection('employees').limit(1).get();
  ownerId = snap.docs[0]?.data()?.ownerId;
  if (!ownerId) {
    console.error('No ownerId found. Pass your Firebase user UID as the second argument.');
    process.exit(1);
  }
  console.log(`Using ownerId from existing employee: ${ownerId}`);
}

const wb = XLSX.read(readFileSync(xlsxPath), { type: 'buffer' });
const sheetName = wb.SheetNames.find(n => /employee info/i.test(n)) ?? wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as string[][];
const parsed = parseEmployeeInfoReportRows(rows);

if (!parsed.length) {
  console.error('No hourly employees parsed from report.');
  process.exit(1);
}

const existingSnap = await db.collection('employees').where('ownerId', '==', ownerId).get();
const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

function findExisting(row: (typeof parsed)[number]) {
  const exact = existing.find(e =>
    String(e.name ?? '').trim().toLowerCase() === row.displayName.toLowerCase()
    || String(e.name ?? '').trim().toLowerCase() === row.reportName.toLowerCase(),
  );
  if (exact) return exact;
  return existing.find(e => employeeNameMatchKey(String(e.name ?? '')) === row.matchKey);
}

let created = 0;
let updated = 0;
const batchSize = 400;
let batch = db.batch();
let batchCount = 0;

async function commitBatch() {
  if (batchCount === 0) return;
  await batch.commit();
  batch = db.batch();
  batchCount = 0;
}

for (const row of parsed) {
  const match = findExisting(row);
  const payload = {
    name: match?.name || row.displayName,
    payPerHour: row.payPerHour,
    status: row.status,
    department: row.department,
    hoursType: row.payType,
    startDate: row.hireDate,
    source: 'sheet',
    ownerId,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (match) {
    batch.set(db.collection('employees').doc(match.id), payload, { merge: true });
    updated++;
  } else {
    const id = randomUUID();
    batch.set(db.collection('employees').doc(id), {
      ...payload,
      id,
      createdAt: FieldValue.serverTimestamp(),
    });
    existing.push({ id, ...payload });
    created++;
  }

  batchCount++;
  if (batchCount >= batchSize) await commitBatch();
}

await commitBatch();

console.log(`Done. Parsed ${parsed.length} employees · created ${created} · updated ${updated}`);
console.log('Sample rates:');
for (const row of parsed.filter(r => r.status === 'Active').slice(0, 8)) {
  console.log(`  ${row.displayName}: $${row.payPerHour}/hr`);
}
