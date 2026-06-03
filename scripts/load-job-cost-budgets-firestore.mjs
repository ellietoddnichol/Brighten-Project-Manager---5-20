#!/usr/bin/env node
/**
 * Load job cost budget seed (with cost-code breakdowns) into Firestore via Admin SDK.
 *
 * Usage:
 *   node scripts/load-job-cost-budgets-firestore.mjs <firebase-user-id> [service-account.json]
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const ownerId = process.argv[2];
const credentialsPath = process.argv[3] || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(__dirname, '../mock-data/job-cost-budget-seed.json');

if (!ownerId) {
  console.error('Usage: node scripts/load-job-cost-budgets-firestore.mjs <firebase-user-id> [service-account.json]');
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
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

function normalizeJobNumber(value) {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? String(Math.trunc(n)) : String(value).trim();
}

function projectNumberKeys(project) {
  const keys = new Set();
  for (const raw of [project.projectNumber, project.masterSheetJobId, project.seedProjectId]) {
    if (raw == null || raw === '') continue;
    keys.add(normalizeJobNumber(raw));
    const text = String(raw);
    if (text.includes(' - ')) {
      keys.add(normalizeJobNumber(text.split(' - ')[0]));
    }
  }
  return keys;
}

function findProject(projects, jobNumber) {
  const target = normalizeJobNumber(jobNumber);
  return projects.find(p => projectNumberKeys(p).has(target));
}

function projectPatch(budget) {
  const patch = {
    estCostBudget: budget.estCostBudget ?? null,
    actualCostToDate: budget.actualCostToDate ?? null,
    estLaborCost: budget.estLaborCost ?? null,
    estMaterialCost: budget.estMaterialCost ?? null,
    estSubCost: budget.estSubCost ?? null,
    estOtherCost: budget.estOtherCost ?? null,
    forecastGP: budget.estimatedProfit ?? null,
    forecastMargin: budget.estimatedMargin ?? null,
    wipPercentComplete: budget.percentComplete ?? null,
    originalContractAmount: budget.updatedContract ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (budget.estCostBudget != null && budget.actualCostToDate != null) {
    patch.wipCostToComplete = Math.max(0, budget.estCostBudget - budget.actualCostToDate);
  } else if (budget.estCostBudget != null) {
    patch.wipCostToComplete = budget.estCostBudget;
  }

  return patch;
}

const projectsSnap = await db.collection('projects').where('ownerId', '==', ownerId).get();
const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

const budgetLinesSnap = await db.collection('budget-lines').where('ownerId', '==', ownerId).get();
const existingLines = budgetLinesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

let projectsUpdated = 0;
let projectsCreated = 0;
let linesWritten = 0;
let linesRemoved = 0;
const unmatched = [];

for (const budget of seed.projects) {
  let match = findProject(projects, budget.jobNumber);

  if (!match) {
    const id = randomUUID();
    await db.collection('projects').doc(id).set({
      projectNumber: budget.jobNumber,
      projectName: budget.projectName,
      customer: 'Brighten Builders LLC',
      status: 'Active',
      ownerId,
      ...projectPatch(budget),
      createdAt: FieldValue.serverTimestamp(),
    });
    match = { id, projectNumber: budget.jobNumber, projectName: budget.projectName };
    projects.push(match);
    projectsCreated++;
  } else {
    await db.collection('projects').doc(match.id).update({
      projectName: budget.projectName,
      ...projectPatch(budget),
    });
    projectsUpdated++;
  }

  const toRemove = existingLines.filter(
    l => l.projectId === match.id && l.importSource === 'job-cost-budget',
  );
  for (const line of toRemove) {
    await db.collection('budget-lines').doc(line.id).delete();
    linesRemoved++;
  }

  for (const line of budget.lines) {
    const id = randomUUID();
    await db.collection('budget-lines').doc(id).set({
      id,
      projectId: match.id,
      ownerId,
      costCode: line.costCode,
      category: line.category,
      originalBudget: line.originalBudget ?? 0,
      approvedCOBudget: line.approvedCOBudget ?? 0,
      revisedBudget: line.revisedBudget ?? line.originalBudget ?? 0,
      actualCost: line.actualCost ?? 0,
      costToComplete: line.costToComplete ?? 0,
      projectedFinalCost: line.projectedFinalCost ?? 0,
      variance: line.variance ?? 0,
      importSource: 'job-cost-budget',
      importFile: budget.sourceFile,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    linesWritten++;
  }

  console.log(`J${budget.jobNumber} ${budget.projectName}: ${budget.lines.length} breakdown lines`);
}

console.log('\nDone.');
console.log(`${projectsUpdated + projectsCreated} projects (${projectsCreated} created)`);
console.log(`${linesWritten} breakdown lines written, ${linesRemoved} replaced`);
if (unmatched.length) console.log('Unmatched:', unmatched.join('; '));
