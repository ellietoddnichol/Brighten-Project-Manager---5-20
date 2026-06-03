/**
 * Phase 1: Domain-driven file moves + import alias rewrite.
 * Run: node scripts/phase1-ddd-restructure.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(__dirname, '../src/app');

const PAGE_MOVES = {
  'pages/dashboard.ts': 'features/dashboard/pages/dashboard.ts',
  'pages/active-2026-control-page.ts': 'features/dashboard/pages/active-2026-control-page.ts',
  'pages/projects.ts': 'features/projects/pages/projects.ts',
  'pages/project-details.ts': 'features/projects/pages/project-details.ts',
  'pages/budget-tab.ts': 'features/projects/pages/budget-tab.ts',
  'pages/co-tab.ts': 'features/projects/pages/co-tab.ts',
  'pages/wip-tab.ts': 'features/projects/pages/wip-tab.ts',
  'pages/ar-tab.ts': 'features/projects/pages/ar-tab.ts',
  'pages/billing-tab.ts': 'features/projects/pages/billing-tab.ts',
  'pages/pos-tab.ts': 'features/projects/pages/pos-tab.ts',
  'pages/changes-tab.ts': 'features/projects/pages/changes-tab.ts',
  'pages/schedule-tab.ts': 'features/projects/pages/schedule-tab.ts',
  'pages/issues-tasks-tab.ts': 'features/projects/pages/issues-tasks-tab.ts',
  'pages/drive-mapping-tab.ts': 'features/documents/pages/drive-mapping-tab.ts',
  'pages/project-subcontractors-tab.ts': 'features/projects/pages/project-subcontractors-tab.ts',
  'pages/project-foreman-bonus-tab.ts': 'features/projects/pages/project-foreman-bonus-tab.ts',
  'pages/certified-payroll-tab.ts': 'features/projects/pages/certified-payroll-tab.ts',
  'pages/tasks-tab.ts': 'features/projects/pages/tasks-tab.ts',
  'pages/rfis-tab.ts': 'features/projects/pages/rfis-tab.ts',
  'pages/submittals-tab.ts': 'features/projects/pages/submittals-tab.ts',
  'pages/daily-logs-tab.ts': 'features/projects/pages/daily-logs-tab.ts',
  'pages/field-issues-tab.ts': 'features/projects/pages/field-issues-tab.ts',
  'pages/documents-tab.ts': 'features/documents/pages/documents-tab.ts',
  'pages/financials-hub-page.ts': 'features/financials/pages/financials-hub-page.ts',
  'pages/billing.ts': 'features/financials/pages/billing.ts',
  'pages/ar-page.ts': 'features/financials/pages/ar-page.ts',
  'pages/wip-page.ts': 'features/financials/pages/wip-page.ts',
  'pages/pos-page.ts': 'features/financials/pages/pos-page.ts',
  'pages/changes.ts': 'features/financials/pages/changes.ts',
  'pages/reports.ts': 'features/financials/pages/reports.ts',
  'pages/tasks-hub-page.ts': 'features/workflows/pages/tasks-hub-page.ts',
  'pages/tasks.ts': 'features/workflows/pages/tasks.ts',
  'pages/rfis.ts': 'features/workflows/pages/rfis.ts',
  'pages/submittals-page.ts': 'features/workflows/pages/submittals-page.ts',
  'pages/daily-logs.ts': 'features/workflows/pages/daily-logs.ts',
  'pages/field-issues-page.ts': 'features/workflows/pages/field-issues-page.ts',
  'pages/labor.ts': 'features/labor/pages/labor.ts',
  'pages/labor-actuals-page.ts': 'features/labor/pages/labor-actuals-page.ts',
  'pages/certified-payroll.ts': 'features/labor/pages/certified-payroll.ts',
  'pages/foreman-bonuses-page.ts': 'features/labor/pages/foreman-bonuses-page.ts',
  'pages/subcontractors-page.ts': 'features/subcontractors/pages/subcontractors-page.ts',
  'pages/directory-hub-page.ts': 'features/subcontractors/pages/directory-hub-page.ts',
  'pages/documents-page.ts': 'features/documents/pages/documents-page.ts',
  'pages/settings.ts': 'features/settings/pages/settings.ts',
  'pages/settings-source-health.ts': 'features/settings/pages/settings-source-health.ts',
  'pages/settings-setup-defaults.ts': 'features/settings/pages/settings-setup-defaults.ts',
  'pages/settings-review-center.ts': 'features/settings/pages/settings-review-center.ts',
  'pages/settings-import-center.ts': 'features/settings/pages/settings-import-center.ts',
  'pages/settings-advanced-tools.ts': 'features/settings/pages/settings-advanced-tools.ts',
  'pages/settings-pinned-tools.ts': 'features/settings/pages/settings-pinned-tools.ts',
  'pages/settings-import-review.ts': 'features/settings/pages/settings-import-review.ts',
  'pages/settings-seed-completeness.ts': 'features/settings/pages/settings-seed-completeness.ts',
  'pages/settings-drive-folders.ts': 'features/settings/pages/settings-drive-folders.ts',
  'pages/settings-labor-codes.ts': 'features/settings/pages/settings-labor-codes.ts',
  'pages/settings-feature-setup.ts': 'features/settings/pages/settings-feature-setup.ts',
  'pages/settings-sync-health.ts': 'features/settings/pages/settings-sync-health.ts',
};

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
  'services/project-files.repository.spec.ts': 'core/services/project-files.repository.spec.ts',
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
  const labor =
    /^(labor-|certified-payroll-week|foreman-bonus|office-admin-labor)/;
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
  const pageAlias = {};

  for (const [from, to] of Object.entries(SERVICE_MOVES)) {
    const base = path.basename(from);
    serviceAlias[`services/${base}`] = toAlias(to);
    serviceAlias[`services/${base.replace(/\.ts$/, '')}`] = toAlias(to);
  }

  const utilsDir = path.join(APP, 'utils');
  if (fs.existsSync(utilsDir)) {
    for (const name of fs.readdirSync(utilsDir)) {
      if (!name.endsWith('.ts')) continue;
      const dest = `${utilDestination(name)}/${name}`;
      utilAlias[`utils/${name}`] = toAlias(dest);
      utilAlias[`utils/${name.replace(/\.ts$/, '')}`] = toAlias(dest);
    }
  }

  for (const [from, to] of Object.entries(PAGE_MOVES)) {
    const base = path.basename(from);
    pageAlias[`pages/${base}`] = toAlias(to);
    pageAlias[`pages/${base.replace(/\.ts$/, '')}`] = toAlias(to);
  }

  return { serviceAlias, utilAlias, pageAlias };
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function moveFile(fromRel, toRel) {
  const from = path.join(APP, fromRel);
  const to = path.join(APP, toRel);
  if (!fs.existsSync(from)) {
    console.warn(`skip missing: ${fromRel}`);
    return;
  }
  ensureDir(to);
  fs.renameSync(from, to);
  console.log(`moved ${fromRel} -> ${toRel}`);
}

function rewriteImports(content, maps) {
  const { serviceAlias, utilAlias, pageAlias } = maps;

  const replacePrefix = (content, folder, aliasMap) => {
    return content.replace(
      new RegExp(`from ['"](?:\\.\\./)+${folder}/([^'"]+)['"]`, 'g'),
      (_, file) => {
        const key = `${folder}/${file}`;
        const alias = aliasMap[key] ?? aliasMap[`${folder}/${file.replace(/\\.ts$/, '')}`];
        if (!alias) {
          console.warn(`  no alias for ${folder}/${file}`);
          return `from '${folder}/${file}'`;
        }
        return `from '${alias}'`;
      },
    );
  };

  let out = content;
  out = replacePrefix(out, 'services', serviceAlias);
  out = replacePrefix(out, 'utils', utilAlias);
  out = replacePrefix(out, 'pages', pageAlias);

  out = out.replace(/from ['"](?:\.\.\/)+config\/([^'"]+)['"]/g, (_, f) => `from '@app/config/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/)+models\/([^'"]+)['"]/g, (_, f) => `from '@app/models/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/)+components\/([^'"]+)['"]/g, (_, f) => `from '@app/components/${f}'`);
  out = out.replace(/from ['"](?:\.\.\/)+data\/([^'"]+)['"]/g, (_, f) => `from '@app/data/${f}'`);
  out = out.replace(/from ['"]\.\/config\/([^'"]+)['"]/g, (_, f) => `from '@app/config/${f}'`);
  out = out.replace(/from ['"]\.\.\/firebase['"]/g, `from '@app/firebase'`);
  out = out.replace(/from ['"]\.\.\/\.\.\/firebase['"]/g, `from '@app/firebase'`);
  out = out.replace(/from ['"]\.\.\/environment['"]/g, `from '@app/config/environment'`);
  out = out.replace(/from ['"](?:\.\.\/)+config\/environment['"]/g, `from '@app/config/environment'`);

  return out;
}

function walkTs(dir, fn) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, fn);
    else if (ent.name.endsWith('.ts')) fn(p);
  }
}

function main() {
  console.log('=== Phase 1 DDD restructure ===\n');

  for (const [from, to] of Object.entries(PAGE_MOVES)) moveFile(from, to);
  for (const [from, to] of Object.entries(SERVICE_MOVES)) moveFile(from, to);

  const utilsDir = path.join(APP, 'utils');
  if (fs.existsSync(utilsDir)) {
    for (const name of fs.readdirSync(utilsDir)) {
      if (!name.endsWith('.ts')) continue;
      const dest = `${utilDestination(name)}/${name}`;
      moveFile(`utils/${name}`, dest);
    }
  }

  const maps = buildAliasMaps();

  walkTs(APP, (filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const next = rewriteImports(content, maps);
    if (next !== content) fs.writeFileSync(filePath, next);
  });

  const routesPath = path.join(APP, 'app.routes.ts');
  let routes = fs.readFileSync(routesPath, 'utf8');
  routes = routes.replace(
    /import\('\.\/pages\/([^']+)'\)/g,
    (_, page) => {
      const key = `pages/${page}.ts`;
      const dest = PAGE_MOVES[key];
      if (!dest) return `import('./pages/${page}')`;
      return `import('${toAlias(dest)}')`;
    },
  );
  fs.writeFileSync(routesPath, routes);

  for (const empty of ['pages', 'services', 'utils']) {
    const d = path.join(APP, empty);
    if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
  }

  console.log('\nDone. Run: npm run build');
}

main();
