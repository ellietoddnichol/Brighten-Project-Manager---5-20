/**
 * Re-run import alias rewrite (fixes walkTs bug — must recurse into subdirs).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../src/app');

const SERVICE_MOVES = {
  'services/auth.service.ts': 'core/services/auth.service.ts',
  'services/google-sheets.service.ts': 'core/services/google-sheets.service.ts',
  'services/data.service.ts': 'core/services/data.service.ts',
  'services/drive.service.ts': 'core/services/drive.service.ts',
  'services/sheets.service.ts': 'core/services/sheets.service.ts',
  'services/global-needs.service.ts': 'core/services/global-needs.service.ts',
  'services/sync-health.service.ts': 'core/services/sync-health.service.ts',
  'services/import-review.service.ts': 'core/services/import-review.service.ts',
  'services/seed.service.ts': 'core/services/seed.service.ts',
  'services/import-data.service.ts': 'core/services/import-data.service.ts',
  'services/import-seed.service.ts': 'core/services/import-seed.service.ts',
  'services/activity-events.service.ts': 'core/services/activity-events.service.ts',
  'services/source-review.repository.ts': 'core/services/source-review.repository.ts',
  'services/sync-runs.repository.ts': 'core/services/sync-runs.repository.ts',
  'services/project-files.repository.ts': 'core/services/project-files.repository.ts',
  'services/workbook-cache.service.ts': 'core/services/workbook-cache.service.ts',
  'services/master-sheet-sync.service.ts': 'core/services/master-sheet-sync.service.ts',
  'services/po-sheet-sync.service.ts': 'core/services/po-sheet-sync.service.ts',
  'services/time-data-sheet-sync.service.ts': 'core/services/time-data-sheet-sync.service.ts',
  'services/quickbooks-sync-sheets.service.ts': 'core/services/quickbooks-sync-sheets.service.ts',
  'services/quickbooks-sync-data.service.ts': 'core/services/quickbooks-sync-data.service.ts',
  'services/project-dedupe.service.ts': 'core/services/project-dedupe.service.ts',
  'services/qbo-sync.service.ts': 'core/services/qbo-sync.service.ts',
  'services/project-data.service.ts': 'features/projects/services/project-data.service.ts',
  'services/project-lifecycle.service.ts': 'features/projects/services/project-lifecycle.service.ts',
  'services/project-financial.service.ts': 'features/projects/services/project-financial.service.ts',
  'services/project-costs.service.ts': 'features/projects/services/project-costs.service.ts',
  'services/project-calculations.service.ts': 'features/projects/services/project-calculations.service.ts',
  'services/project-controls.service.ts': 'features/projects/services/project-controls.service.ts',
  'services/project-needs.service.ts': 'features/projects/services/project-needs.service.ts',
  'services/project-record.service.ts': 'features/projects/services/project-record.service.ts',
  'services/project-requirements.service.ts': 'features/projects/services/project-requirements.service.ts',
  'services/project-workflow-save.service.ts': 'features/projects/services/project-workflow-save.service.ts',
  'services/project-document-save.service.ts': 'features/projects/services/project-document-save.service.ts',
  'services/budget-line.service.ts': 'features/projects/services/budget-line.service.ts',
  'services/construction-operations.service.ts': 'features/projects/services/construction-operations.service.ts',
  'services/change-order-document.service.ts': 'features/projects/services/change-order-document.service.ts',
  'services/wip.service.ts': 'features/financials/services/wip.service.ts',
  'services/ar.service.ts': 'features/financials/services/ar.service.ts',
  'services/ar-compute.service.ts': 'features/financials/services/ar-compute.service.ts',
  'services/ar-aging-import.service.ts': 'features/financials/services/ar-aging-import.service.ts',
  'services/billing-sov-import.service.ts': 'features/financials/services/billing-sov-import.service.ts',
  'services/wip-setup-import.service.ts': 'features/financials/services/wip-setup-import.service.ts',
  'services/wip-forecast-import.service.ts': 'features/financials/services/wip-forecast-import.service.ts',
  'services/pay-app.service.ts': 'features/financials/services/pay-app.service.ts',
  'services/purchase-order.service.ts': 'features/financials/services/purchase-order.service.ts',
  'services/qb-invoice-packet-import.service.ts': 'features/financials/services/qb-invoice-packet-import.service.ts',
  'services/budget-seed.service.ts': 'features/financials/services/budget-seed.service.ts',
  'services/labor-code-mapping.service.ts': 'features/labor/services/labor-code-mapping.service.ts',
  'services/labor-calculations.service.ts': 'features/labor/services/labor-calculations.service.ts',
  'services/labor-data.service.ts': 'features/labor/services/labor-data.service.ts',
  'services/labor-rate.service.ts': 'features/labor/services/labor-rate.service.ts',
  'services/certified-payroll-generator.service.ts': 'features/labor/services/certified-payroll-generator.service.ts',
  'services/certified-payroll-tasks.service.ts': 'features/labor/services/certified-payroll-tasks.service.ts',
  'services/certified-payroll-export.service.ts': 'features/labor/services/certified-payroll-export.service.ts',
  'services/certified-payroll-data.service.ts': 'features/labor/services/certified-payroll-data.service.ts',
  'services/certified-payroll.service.ts': 'features/labor/services/certified-payroll.service.ts',
  'services/foreman-bonus.service.ts': 'features/labor/services/foreman-bonus.service.ts',
  'services/foreman-bonus-seed.service.ts': 'features/labor/services/foreman-bonus-seed.service.ts',
  'services/project-labor-actual.service.ts': 'features/labor/services/project-labor-actual.service.ts',
  'services/subcontractor.service.ts': 'features/subcontractors/services/subcontractor.service.ts',
  'services/subcontractor-tasks.service.ts': 'features/subcontractors/services/subcontractor-tasks.service.ts',
  'services/subcontractor-invoice.service.ts': 'features/subcontractors/services/subcontractor-invoice.service.ts',
  'services/subcontractor-seed.service.ts': 'features/subcontractors/services/subcontractor-seed.service.ts',
  'services/project-subcontractor.service.ts': 'features/subcontractors/services/project-subcontractor.service.ts',
  'services/drive-folder-seed.service.ts': 'features/subcontractors/services/drive-folder-seed.service.ts',
  'services/drive-folder-discovery.service.ts': 'features/subcontractors/services/drive-folder-discovery.service.ts',
};

function utilDestination(basename) {
  const projects =
    /^(project-|projects-hub|active-2026|setup-gap|change-management|budget-line\.compute|project-setup|project-dedupe|project-needs\.compute|project-lifecycle\.compute|project-work\.compute|project-requirements\.compute|project-documents\.compute)/;
  const financials =
    /^(ar\.compute|wip\.compute|wip-hub|financials-hub|project-money|project-financial\.compute|pay-app-billing|qb-invoice-packet|wip-forecast|job-cost-budget)/;
  const labor = /^(labor-|certified-payroll-week|foreman-bonus|office-admin-labor)/;
  const subcontractors = /^(subcontractor|directory-hub)/;
  const documents = /^(documents-hub|drive-folder-matcher)/;
  if (projects.test(basename)) return 'features/projects/utils';
  if (financials.test(basename)) return 'features/financials/utils';
  if (labor.test(basename)) return 'features/labor/utils';
  if (subcontractors.test(basename)) return 'features/subcontractors/utils';
  if (documents.test(basename)) return 'features/documents/utils';
  return 'shared/utils';
}

function toAlias(destPath) {
  const noExt = destPath.replace(/\.ts$/, '');
  if (noExt.startsWith('core/')) return `@core/${noExt.slice('core/'.length)}`;
  if (noExt.startsWith('shared/')) return `@shared/${noExt.slice('shared/'.length)}`;
  if (noExt.startsWith('features/')) return `@${noExt}`;
  return `@app/${noExt}`;
}

function buildAliasMaps() {
  const serviceAlias = {};
  const utilAlias = {};

  for (const [, to] of Object.entries(SERVICE_MOVES)) {
    const base = path.basename(to);
    serviceAlias[`services/${base}`] = toAlias(to);
    serviceAlias[`services/${base.replace(/\.ts$/, '')}`] = toAlias(to);
  }

  function scanUtils(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) scanUtils(p, `${prefix}${ent.name}/`);
      else if (ent.name.endsWith('.ts')) {
        const key = `utils/${ent.name}`;
        utilAlias[key] = toAlias(`${prefix}${ent.name}`);
        utilAlias[`utils/${ent.name.replace(/\.ts$/, '')}`] = utilAlias[key];
      }
    }
  }
  scanUtils(path.join(APP, 'shared/utils'), 'shared/utils/');
  for (const feat of ['projects', 'financials', 'labor', 'subcontractors', 'documents']) {
    scanUtils(path.join(APP, 'features', feat, 'utils'), `features/${feat}/utils/`);
  }

  return { serviceAlias, utilAlias };
}

function rewriteImports(content, maps) {
  const { serviceAlias, utilAlias } = maps;

  const replacePrefix = (content, folder, aliasMap) =>
    content.replace(new RegExp(`from ['"](?:\\.\\.\\/|\\.\\/)+${folder}/([^'"]+)['"]`, 'g'), (_, file) => {
      const key = `${folder}/${file}`;
      const alias = aliasMap[key] ?? aliasMap[`${folder}/${file.replace(/\\.ts$/, '')}`];
      return alias ? `from '${alias}'` : `from '${folder}/${file}'`;
    });

  let out = content;
  out = replacePrefix(out, 'services', serviceAlias);
  out = replacePrefix(out, 'utils', utilAlias);
  out = out.replace(/from ['"](?:\.\.\/|\.\/)+config\/([^'"]+)['"]/g, (_, f) => `from '@app/config/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/|\.\/)+models\/([^'"]+)['"]/g, (_, f) => `from '@app/models/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/|\.\/)+components\/([^'"]+)['"]/g, (_, f) => `from '@app/components/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/|\.\/)+data\/([^'"]+)['"]/g, (_, f) => `from '@app/data/${f}'`);
  out = out.replace(/from ['"]\.\.\/firebase['"]/g, `from '@app/firebase'`);
  out = out.replace(/from ['"]\.\.\/\.\.\/firebase['"]/g, `from '@app/firebase'`);
  return out;
}

function walkTs(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, fn);
    else if (ent.name.endsWith('.ts')) fn(p);
  }
}

const maps = buildAliasMaps();
let n = 0;
walkTs(APP, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const next = rewriteImports(content, maps);
  if (next !== content) {
    fs.writeFileSync(filePath, next);
    n++;
  }
});
console.log(`Updated ${n} files`);
