/**
 * Fix sibling `./foo.service` imports after services split across core/features.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../src/app');

const SERVICE_MOVES = {
  'auth.service.ts': 'core/services/auth.service.ts',
  'google-sheets.service.ts': 'core/services/google-sheets.service.ts',
  'data.service.ts': 'core/services/data.service.ts',
  'drive.service.ts': 'core/services/drive.service.ts',
  'sheets.service.ts': 'core/services/sheets.service.ts',
  'global-needs.service.ts': 'core/services/global-needs.service.ts',
  'sync-health.service.ts': 'core/services/sync-health.service.ts',
  'import-review.service.ts': 'core/services/import-review.service.ts',
  'seed.service.ts': 'core/services/seed.service.ts',
  'import-data.service.ts': 'core/services/import-data.service.ts',
  'import-seed.service.ts': 'core/services/import-seed.service.ts',
  'activity-events.service.ts': 'core/services/activity-events.service.ts',
  'source-review.repository.ts': 'core/services/source-review.repository.ts',
  'sync-runs.repository.ts': 'core/services/sync-runs.repository.ts',
  'project-files.repository.ts': 'core/services/project-files.repository.ts',
  'workbook-cache.service.ts': 'core/services/workbook-cache.service.ts',
  'master-sheet-sync.service.ts': 'core/services/master-sheet-sync.service.ts',
  'po-sheet-sync.service.ts': 'core/services/po-sheet-sync.service.ts',
  'time-data-sheet-sync.service.ts': 'core/services/time-data-sheet-sync.service.ts',
  'quickbooks-sync-sheets.service.ts': 'core/services/quickbooks-sync-sheets.service.ts',
  'quickbooks-sync-data.service.ts': 'core/services/quickbooks-sync-data.service.ts',
  'project-dedupe.service.ts': 'core/services/project-dedupe.service.ts',
  'qbo-sync.service.ts': 'core/services/qbo-sync.service.ts',
  'project-data.service.ts': 'features/projects/services/project-data.service.ts',
  'project-lifecycle.service.ts': 'features/projects/services/project-lifecycle.service.ts',
  'project-financial.service.ts': 'features/projects/services/project-financial.service.ts',
  'project-costs.service.ts': 'features/projects/services/project-costs.service.ts',
  'project-calculations.service.ts': 'features/projects/services/project-calculations.service.ts',
  'project-controls.service.ts': 'features/projects/services/project-controls.service.ts',
  'project-needs.service.ts': 'features/projects/services/project-needs.service.ts',
  'project-record.service.ts': 'features/projects/services/project-record.service.ts',
  'project-requirements.service.ts': 'features/projects/services/project-requirements.service.ts',
  'project-workflow-save.service.ts': 'features/projects/services/project-workflow-save.service.ts',
  'project-document-save.service.ts': 'features/projects/services/project-document-save.service.ts',
  'budget-line.service.ts': 'features/projects/services/budget-line.service.ts',
  'construction-operations.service.ts': 'features/projects/services/construction-operations.service.ts',
  'change-order-document.service.ts': 'features/projects/services/change-order-document.service.ts',
  'wip.service.ts': 'features/financials/services/wip.service.ts',
  'ar.service.ts': 'features/financials/services/ar.service.ts',
  'ar-compute.service.ts': 'features/financials/services/ar-compute.service.ts',
  'ar-aging-import.service.ts': 'features/financials/services/ar-aging-import.service.ts',
  'billing-sov-import.service.ts': 'features/financials/services/billing-sov-import.service.ts',
  'wip-setup-import.service.ts': 'features/financials/services/wip-setup-import.service.ts',
  'wip-forecast-import.service.ts': 'features/financials/services/wip-forecast-import.service.ts',
  'pay-app.service.ts': 'features/financials/services/pay-app.service.ts',
  'purchase-order.service.ts': 'features/financials/services/purchase-order.service.ts',
  'qb-invoice-packet-import.service.ts': 'features/financials/services/qb-invoice-packet-import.service.ts',
  'budget-seed.service.ts': 'features/financials/services/budget-seed.service.ts',
  'labor-code-mapping.service.ts': 'features/labor/services/labor-code-mapping.service.ts',
  'labor-calculations.service.ts': 'features/labor/services/labor-calculations.service.ts',
  'labor-data.service.ts': 'features/labor/services/labor-data.service.ts',
  'labor-rate.service.ts': 'features/labor/services/labor-rate.service.ts',
  'certified-payroll-generator.service.ts': 'features/labor/services/certified-payroll-generator.service.ts',
  'certified-payroll-tasks.service.ts': 'features/labor/services/certified-payroll-tasks.service.ts',
  'certified-payroll-export.service.ts': 'features/labor/services/certified-payroll-export.service.ts',
  'certified-payroll-data.service.ts': 'features/labor/services/certified-payroll-data.service.ts',
  'certified-payroll.service.ts': 'features/labor/services/certified-payroll.service.ts',
  'foreman-bonus.service.ts': 'features/labor/services/foreman-bonus.service.ts',
  'foreman-bonus-seed.service.ts': 'features/labor/services/foreman-bonus-seed.service.ts',
  'project-labor-actual.service.ts': 'features/labor/services/project-labor-actual.service.ts',
  'subcontractor.service.ts': 'features/subcontractors/services/subcontractor.service.ts',
  'subcontractor-tasks.service.ts': 'features/subcontractors/services/subcontractor-tasks.service.ts',
  'subcontractor-invoice.service.ts': 'features/subcontractors/services/subcontractor-invoice.service.ts',
  'subcontractor-seed.service.ts': 'features/subcontractors/services/subcontractor-seed.service.ts',
  'project-subcontractor.service.ts': 'features/subcontractors/services/project-subcontractor.service.ts',
  'drive-folder-seed.service.ts': 'features/subcontractors/services/drive-folder-seed.service.ts',
  'drive-folder-discovery.service.ts': 'features/subcontractors/services/drive-folder-discovery.service.ts',
};

function toAlias(destPath) {
  const noExt = destPath.replace(/\.ts$/, '');
  if (noExt.startsWith('core/')) return `@core/${noExt.slice('core/'.length)}`;
  if (noExt.startsWith('shared/')) return `@shared/${noExt.slice('shared/'.length)}`;
  if (noExt.startsWith('features/')) return `@${noExt}`;
  return `@app/${noExt}`;
}

const serviceAlias = {};
for (const [base, dest] of Object.entries(SERVICE_MOVES)) {
  const key = base.replace(/\.ts$/, '');
  serviceAlias[key] = toAlias(dest);
}

const utilAlias = {};
function scanUtils(dir, prefix) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) scanUtils(p, `${prefix}${ent.name}/`);
    else if (ent.name.endsWith('.ts')) {
      const key = ent.name.replace(/\.ts$/, '');
      utilAlias[key] = toAlias(`${prefix}${ent.name}`);
    }
  }
}
scanUtils(path.join(APP, 'shared/utils'), 'shared/utils/');
for (const feat of ['projects', 'financials', 'labor', 'subcontractors', 'documents']) {
  scanUtils(path.join(APP, 'features', feat, 'utils'), `features/${feat}/utils/`);
}

function walkTs(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, fn);
    else if (ent.name.endsWith('.ts')) fn(p);
  }
}

function rewrite(content) {
  let out = content;
  out = out.replace(/from ['"]\.\/([^'"]+)['"]/g, (match, file) => {
    const base = file.replace(/\.ts$/, '');
    if (serviceAlias[base]) return `from '${serviceAlias[base]}'`;
    if (utilAlias[base]) return `from '${utilAlias[base]}'`;
    return match;
  });
  out = out.replace(/from ['"]\.\.\/models\/([^'"]+)['"]/g, (_, f) => `from '@app/models/${f}'`);
  return out;
}

let n = 0;
walkTs(APP, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const next = rewrite(content);
  if (next !== content) {
    fs.writeFileSync(filePath, next);
    n++;
  }
});
console.log(`Sibling import fixes: ${n} files`);
