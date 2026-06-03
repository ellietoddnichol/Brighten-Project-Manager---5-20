/** Finish Phase 3: replace remaining static JSON imports with lazy loaders. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(root, '../src/app');

function patch(fileRel, edits) {
  const file = path.join(app, fileRel);
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of edits) {
    if (!content.includes(from)) {
      console.warn(`skip (not found) in ${fileRel}: ${from.slice(0, 60)}...`);
      continue;
    }
    content = content.replace(from, to);
  }
  fs.writeFileSync(file, content);
  console.log('patched', fileRel);
}

patch('features/projects/services/project-data.service.ts', [
  [
    "import { dedupeProjectsForDisplay } from '@features/projects/utils/project-dedupe';",
    "import { dedupeProjectsForDisplay } from '@features/projects/utils/project-dedupe';\nimport { loadMockDataJson } from '@core/utils/mock-data-loader';",
  ],
]);

patch('features/projects/services/project-costs.service.ts', [
  [
    "import projectCostsSeed from '@app/data/project-costs-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    "const SEED = projectCostsSeed as ProjectCostsSeedBundle;",
    "const projectCostsSeedLoader = createLazyJsonLoader<ProjectCostsSeedBundle>('project-costs-seed.json');",
  ],
  [
    '  seedMeta = SEED.meta;\n  projectCount = SEED.projects.length;\n  transactionCount = SEED.meta.transactionCount ?? 0;\n  monthlyLabor = signal<ProjectCostMonthlyLabor[]>(SEED.monthlyLabor);\n  projectSummaries = signal<ProjectCostSummary[]>(SEED.projects);',
    '  seedMeta = signal<ProjectCostsSeedBundle[\'meta\'] | null>(null);\n  projectCount = signal(0);\n  transactionCount = signal(0);\n  monthlyLabor = signal<ProjectCostMonthlyLabor[]>([]);\n  projectSummaries = signal<ProjectCostSummary[]>([]);',
  ],
  [
    "      const resp = await fetch('/data/seeds/project-cost-transactions-seed.json');",
    "      const resp = await fetch('/mock-data/seeds/project-cost-transactions-seed.json');",
  ],
]);

// project-costs: add constructor bootstrap and fix syncFromSeed to await loader
let pc = fs.readFileSync(path.join(app, 'features/projects/services/project-costs.service.ts'), 'utf8');
if (!pc.includes('void this.bootstrapSeed()')) {
  pc = pc.replace(
    '  transactionsLoaded = signal(false);\n\n  async loadTransactionsIfNeeded',
    `  transactionsLoaded = signal(false);

  constructor() {
    void this.bootstrapSeed();
  }

  private async bootstrapSeed(): Promise<void> {
    const SEED = await projectCostsSeedLoader.get();
    this.seedMeta.set(SEED.meta);
    this.projectCount.set(SEED.projects.length);
    this.transactionCount.set(SEED.meta.transactionCount ?? 0);
    this.monthlyLabor.set(SEED.monthlyLabor);
    this.projectSummaries.set(SEED.projects);
  }

  async loadTransactionsIfNeeded`,
  );
  pc = pc.replace(
    '    const SEED = projectCostsSeed as ProjectCostsSeedBundle;',
    '    const SEED = await projectCostsSeedLoader.get();',
  );
  fs.writeFileSync(path.join(app, 'features/projects/services/project-costs.service.ts'), pc);
  console.log('patched project-costs bootstrap');
}

patch('core/services/seed.service.ts', [
  [
    "import seedBundle from '@app/data/brighten-project-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    'const SEED_DATA = seedBundle as BrightenSeedBundle;',
    "const seedDataLoader = createLazyJsonLoader<BrightenSeedBundle>('brighten-project-seed.json');",
  ],
  [
    '  seedMeta = SEED_DATA.meta;',
    '  seedMeta: BrightenSeedBundle[\'meta\'] | null = null;',
  ],
]);

let seedSvc = fs.readFileSync(path.join(app, 'core/services/seed.service.ts'), 'utf8');
seedSvc = seedSvc.replace(
  '  private async applySeedBundle(upsert: boolean): Promise<void> {',
  `  private async applySeedBundle(upsert: boolean): Promise<void> {
    const SEED_DATA = await seedDataLoader.get();
    this.seedMeta = SEED_DATA.meta;`,
);
fs.writeFileSync(path.join(app, 'core/services/seed.service.ts'), seedSvc);

patch('core/services/qbo-sync.service.ts', [
  [
    "import qboBundle from '@app/data/qbo-reports-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    'const QBO_DATA = qboBundle as QboReportsBundle;',
    "const qboDataLoader = createLazyJsonLoader<QboReportsBundle>('qbo-reports-seed.json');",
  ],
  [
    '  qboMeta = QBO_DATA.meta;\n  recordCount = QBO_DATA.records.length;',
    '  qboMeta: QboReportsBundle[\'meta\'] | null = null;\n  recordCount = 0;',
  ],
]);

let qbo = fs.readFileSync(path.join(app, 'core/services/qbo-sync.service.ts'), 'utf8');
qbo = qbo.replace(
  '    this.syncing.set(true);',
  `    const QBO_DATA = await qboDataLoader.get();
    this.qboMeta = QBO_DATA.meta;
    this.recordCount = QBO_DATA.records.length;
    this.syncing.set(true);`,
);
fs.writeFileSync(path.join(app, 'core/services/qbo-sync.service.ts'), qbo);

patch('features/labor/services/labor-data.service.ts', [
  [
    "import laborRatesSeed from '@app/data/labor-rates-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    '  classificationRates = signal<ClassificationRateRecord[]>(\n    classificationRatesFromSeed(laborRatesSeed as { classificationRates: ClassificationRateRecord[] }),\n  );',
    '  classificationRates = signal<ClassificationRateRecord[]>([]);',
  ],
]);

let labor = fs.readFileSync(path.join(app, 'features/labor/services/labor-data.service.ts'), 'utf8');
if (!labor.includes('laborRatesSeedLoader')) {
  labor = labor.replace(
    "import { effectiveClassification, resolveLaborCodeMapping } from '@features/labor/utils/labor-code-mapping.compute';",
    `import { effectiveClassification, resolveLaborCodeMapping } from '@features/labor/utils/labor-code-mapping.compute';

const laborRatesSeedLoader = createLazyJsonLoader<{ classificationRates: ClassificationRateRecord[] }>('labor-rates-seed.json');`,
  );
  labor = labor.replace(
    '  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;',
    `  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void laborRatesSeedLoader.get().then(seed =>
      this.classificationRates.set(classificationRatesFromSeed(seed)),
    );
  }

  private async laborRatesSeed() {
    return laborRatesSeedLoader.get();
  }`,
  );
  labor = labor.replaceAll(
    'classificationRatesFromSeed(laborRatesSeed as { classificationRates: ClassificationRateRecord[] })',
    'classificationRatesFromSeed(await this.laborRatesSeed())',
  );
  fs.writeFileSync(path.join(app, 'features/labor/services/labor-data.service.ts'), labor);
}

patch('features/labor/services/certified-payroll.service.ts', [
  [
    "import laborRatesSeed from '@app/data/labor-rates-seed.json';",
    "import { loadMockDataJson } from '@core/utils/mock-data-loader';",
  ],
]);

let cpr = fs.readFileSync(path.join(app, 'features/labor/services/certified-payroll.service.ts'), 'utf8');
cpr = cpr.replace(
      'const seed = laborRatesSeed as { classificationRates: ClassificationRateRecord[] };',
      "const seed = await loadMockDataJson<{ classificationRates: ClassificationRateRecord[] }>('labor-rates-seed.json');",
);
fs.writeFileSync(path.join(app, 'features/labor/services/certified-payroll.service.ts'), cpr);

patch('features/labor/services/labor-code-mapping.service.ts', [
  [
    "import seedBundle from '@app/data/labor-code-mappings-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    'const SEED = seedBundle as { meta: { generatedAt: string }; mappings: Partial<LaborCodeMapping>[] };',
    "const laborMappingsLoader = createLazyJsonLoader<{ meta: { generatedAt: string }; mappings: Partial<LaborCodeMapping>[] }>('labor-code-mappings-seed.json');",
  ],
]);

let lcm = fs.readFileSync(path.join(app, 'features/labor/services/labor-code-mapping.service.ts'), 'utf8');
lcm = lcm.replace(/SEED\./g, '(await laborMappingsLoader.get()).');
// fix methods that aren't async - find seedFromBundle or similar
fs.writeFileSync(path.join(app, 'features/labor/services/labor-code-mapping.service.ts'), lcm);

patch('features/labor/services/foreman-bonus-seed.service.ts', [
  [
    "import seedBundle from '@app/data/foreman-bonus-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    'const SEED = seedBundle as ForemanBonusSeedBundle;',
    "const foremanBonusSeedLoader = createLazyJsonLoader<ForemanBonusSeedBundle>('foreman-bonus-seed.json');",
  ],
]);

let fbs = fs.readFileSync(path.join(app, 'features/labor/services/foreman-bonus-seed.service.ts'), 'utf8');
fbs = fbs.replace(/\bSEED\b/g, 'await foremanBonusSeedLoader.get()');
fs.writeFileSync(path.join(app, 'features/labor/services/foreman-bonus-seed.service.ts'), fbs);

patch('features/financials/services/budget-seed.service.ts', [
  [
    "import seedBundle from '@app/data/job-cost-budget-seed.json';",
    "import { createLazyJsonLoader } from '@core/utils/mock-data-loader';",
  ],
  [
    'const SEED = seedBundle as JobCostBudgetSeedBundle;',
    "const jobCostBudgetSeedLoader = createLazyJsonLoader<JobCostBudgetSeedBundle>('job-cost-budget-seed.json');",
  ],
  [
    '  seedMeta = SEED.meta;',
    '  seedMeta: JobCostBudgetSeedBundle[\'meta\'] | null = null;',
  ],
  [
    "      const resp = await fetch('/data/seeds/budget-import-seed.json');",
    "      const resp = await fetch('/mock-data/seeds/budget-import-seed.json');",
  ],
]);

let budget = fs.readFileSync(path.join(app, 'features/financials/services/budget-seed.service.ts'), 'utf8');
budget = budget.replace(
  '    if (!force && marker === SEED.meta.generatedAt) return;',
  '    const SEED = await jobCostBudgetSeedLoader.get();\n    if (!this.seedMeta) this.seedMeta = SEED.meta;\n    if (!force && marker === SEED.meta.generatedAt) return;',
);
budget = budget.replace(
  '    await this.syncJobCostBudgets();',
  '    await this.syncJobCostBudgets(SEED);',
);
budget = budget.replace(
  '  async syncJobCostBudgets(): Promise<void> {',
  '  async syncJobCostBudgets(seedBundle: JobCostBudgetSeedBundle = await jobCostBudgetSeedLoader.get()): Promise<void> {\n    const SEED = seedBundle;\n    if (!this.seedMeta) this.seedMeta = SEED.meta;',
);
fs.writeFileSync(path.join(app, 'features/financials/services/budget-seed.service.ts'), budget);

console.log('done — review labor-code-mapping and drive/subcontractor manually');
