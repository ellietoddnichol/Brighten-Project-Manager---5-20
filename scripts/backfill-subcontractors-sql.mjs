/**
 * Backfill subcontractors collections from Firestore into Cloud SQL MySQL.
 *
 * Usage:
 *   node scripts/backfill-subcontractors-sql.mjs <owner-id> [--dry-run] [service-account.json]
 *
 * Prerequisites:
 *   - api/npm install (mysql2)
 *   - api/.env.local with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   - Run db/manual/2026-06-08_subcontractors_schema.sql and legacy_align.sql in Cloud SQL first
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const mysql = require('../api/node_modules/mysql2/promise');

const ownerId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const credentialsPath = process.argv.find(arg => arg.endsWith('.json'))
  ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!ownerId) {
  console.error('Usage: node scripts/backfill-subcontractors-sql.mjs <owner-id> [--dry-run] [service-account.json]');
  process.exit(1);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('api/.env.local');
loadEnvFile('api/.env');

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

async function loadCollection(name) {
  const snap = await db.collection(name).where('ownerId', '==', ownerId).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function str(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'brighten_pm',
  connectionLimit: 4,
});

const subcontractors = await loadCollection('subcontractors');
const projectSubcontractors = await loadCollection('project-subcontractors');
const documents = await loadCollection('subcontractor-documents');
const invoices = await loadCollection('subcontractor-invoices');

console.log(`Owner ${ownerId}: ${subcontractors.length} subs, ${projectSubcontractors.length} project subs, ${documents.length} docs, ${invoices.length} invoices`);
if (dryRun) console.log('DRY RUN — no SQL writes');

const upsertSub = `
  INSERT INTO brighten_pm.subcontractors (
    id, owner_id, company_name, normalized_name, trade, contact_name, phone, email, address,
    w9_status, insurance_status, coi_expiration_date, status, vendor_classification, source,
    seeded_total_cost, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    company_name = VALUES(company_name),
    trade = VALUES(trade),
    contact_name = VALUES(contact_name),
    phone = VALUES(phone),
    email = VALUES(email),
    address = VALUES(address),
    w9_status = VALUES(w9_status),
    insurance_status = VALUES(insurance_status),
    coi_expiration_date = VALUES(coi_expiration_date),
    status = VALUES(status),
    vendor_classification = VALUES(vendor_classification),
    source = VALUES(source),
    seeded_total_cost = VALUES(seeded_total_cost),
    notes = VALUES(notes)
`;

for (const row of subcontractors) {
  const params = [
    row.id,
    ownerId,
    str(row.companyName) ?? 'Unknown',
    str(row.companyName)?.toLowerCase() ?? null,
    str(row.trade),
    str(row.contactName),
    str(row.phone),
    str(row.email),
    str(row.address),
    str(row.w9Status) ?? 'Missing',
    str(row.insuranceStatus) ?? 'Missing',
    str(row.coiExpirationDate),
    str(row.status) ?? 'PendingSetup',
    str(row.vendorClassification),
    str(row.source),
    num(row.seededTotalCost) || null,
    str(row.notes),
  ];
  if (!dryRun) await pool.execute(upsertSub, params);
}

const upsertPs = `
  INSERT INTO brighten_pm.project_subcontractors (
    id, owner_id, project_id, subcontractor_id, job_number, project_name, subcontractor_name,
    trade, scope_of_work, cost_code, budget_line_id, linked_purchase_order_id,
    original_commitment_amount, approved_change_order_amount, current_commitment_amount,
    invoiced_to_date, paid_to_date, open_balance, remaining_commitment, retainage_held,
    start_date, finish_date, status, compliance_status, performance_status,
    compliance_override_note, import_source, imported_cost_to_date, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    subcontractor_name = VALUES(subcontractor_name),
    trade = VALUES(trade),
    scope_of_work = VALUES(scope_of_work),
    current_commitment_amount = VALUES(current_commitment_amount),
    invoiced_to_date = VALUES(invoiced_to_date),
    paid_to_date = VALUES(paid_to_date),
    open_balance = VALUES(open_balance),
    status = VALUES(status),
    compliance_status = VALUES(compliance_status),
    import_source = VALUES(import_source),
    imported_cost_to_date = VALUES(imported_cost_to_date),
    notes = VALUES(notes)
`;

for (const row of projectSubcontractors) {
  const params = [
    row.id,
    ownerId,
    str(row.projectId),
    str(row.subcontractorId),
    str(row.jobNumber),
    str(row.projectName),
    str(row.subcontractorName) ?? 'Unknown',
    str(row.trade),
    str(row.scopeOfWork),
    str(row.costCode),
    str(row.budgetLineId),
    str(row.linkedPurchaseOrderId),
    num(row.originalCommitmentAmount),
    num(row.approvedChangeOrderAmount),
    num(row.currentCommitmentAmount),
    num(row.invoicedToDate),
    num(row.paidToDate),
    num(row.openBalance),
    num(row.remainingCommitment),
    num(row.retainageHeld),
    str(row.startDate),
    str(row.finishDate),
    str(row.status) ?? 'Planned',
    str(row.complianceStatus) ?? 'MissingItems',
    str(row.performanceStatus) ?? 'Good',
    str(row.complianceOverrideNote),
    str(row.importSource),
    num(row.importedCostToDate) || null,
    str(row.notes),
  ];
  if (!dryRun) await pool.execute(upsertPs, params);
}

console.log(dryRun ? 'Dry run complete.' : 'Backfill complete.');
await pool.end();
