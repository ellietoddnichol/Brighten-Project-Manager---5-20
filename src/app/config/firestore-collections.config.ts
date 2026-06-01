/**
 * Phase Zero — Firestore collection registry.
 * Logical (camelCase) names map to physical Firestore collection IDs (kebab-case).
 * Firestore is the normalized working database; Drive/Sheets/QB remain source feeds.
 */

export interface FirestoreCollectionEntry {
  /** Logical name used in docs and app code references */
  logicalName: string;
  /** Physical Firestore collection path */
  collection: string;
  /** Where normalized records live vs embedded / cache */
  storage: 'firestore' | 'embedded' | 'localCache' | 'derived';
  notes?: string;
}

export const FIRESTORE_COLLECTIONS: FirestoreCollectionEntry[] = [
  { logicalName: 'projects', collection: 'projects', storage: 'firestore' },
  {
    logicalName: 'projectFinancialSnapshots',
    collection: 'projects',
    storage: 'embedded',
    notes: 'Financial summary fields on project doc + billings/ar-records',
  },
  { logicalName: 'budgetLines', collection: 'budget-lines', storage: 'firestore' },
  {
    logicalName: 'budgetSnapshots',
    collection: 'import-data-store',
    storage: 'localCache',
    notes: 'ProjectBudgetSnapshot[] in ImportDataService until migrated to Firestore',
  },
  { logicalName: 'billingRecords', collection: 'billings', storage: 'firestore' },
  { logicalName: 'arRecords', collection: 'ar-records', storage: 'firestore' },
  {
    logicalName: 'quickBooksSyncRuns',
    collection: 'qb-sync-store',
    storage: 'localCache',
    notes: 'QuickBooksSyncDataService lastRun in localStorage brighten.qbProjectMgmtSync',
  },
  {
    logicalName: 'quickBooksInvoiceLines',
    collection: 'qb-sync-store',
    storage: 'localCache',
    notes: 'invoiceLines[] in QB sync store',
  },
  {
    logicalName: 'quickBooksCostTransactions',
    collection: 'qb-sync-store',
    storage: 'localCache',
    notes: 'detailCostTransactions[]; project cost summaries patch projects collection',
  },
  { logicalName: 'projectLaborActuals', collection: 'project-labor-actuals', storage: 'firestore' },
  { logicalName: 'laborCodeMappings', collection: 'labor-code-mappings', storage: 'firestore' },
  {
    logicalName: 'laborExceptions',
    collection: '(derived)',
    storage: 'derived',
    notes: 'Computed by LaborCalculationsService — not persisted as a collection',
  },
  { logicalName: 'subcontractors', collection: 'subcontractors', storage: 'firestore' },
  { logicalName: 'projectSubcontractors', collection: 'project-subcontractors', storage: 'firestore' },
  { logicalName: 'subcontractorDocuments', collection: 'subcontractor-documents', storage: 'firestore' },
  { logicalName: 'projectFiles', collection: 'project-files', storage: 'firestore' },
  { logicalName: 'projectFolderMappings', collection: 'project-folders', storage: 'firestore' },
  { logicalName: 'tasks', collection: 'project-tasks', storage: 'firestore', notes: 'Also legacy tasks collection' },
  { logicalName: 'changeRequests', collection: 'change-requests', storage: 'firestore' },
  { logicalName: 'changeOrders', collection: 'change-orders', storage: 'firestore' },
  {
    logicalName: 'importReviewExceptions',
    collection: 'import-exceptions',
    storage: 'localCache',
    notes: 'ImportReviewService localStorage brighten.importExceptions — Phase Zero cache',
  },
  {
    logicalName: 'seedCompletenessRecords',
    collection: '(derived)',
    storage: 'derived',
    notes: 'Computed per project via project-lifecycle.compute seed gaps',
  },
  {
    logicalName: 'syncHealthRuns',
    collection: 'import-runs',
    storage: 'localCache',
    notes: 'ImportReviewService logRun + per-sync lastRunStats on services',
  },
  {
    logicalName: 'featureSetupStatuses',
    collection: '(config)',
    storage: 'derived',
    notes: 'FEATURE_SETUP_MATRIX in feature-setup.config.ts',
  },
];

export function collectionByLogicalName(name: string): FirestoreCollectionEntry | undefined {
  return FIRESTORE_COLLECTIONS.find(c => c.logicalName === name);
}
