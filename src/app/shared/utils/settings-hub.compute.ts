import { SyncHealthRow, SyncHealthStatus } from '@core/services/sync-health.service';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import { Project } from '@app/models/types';
import { setupBlockingGaps } from '@features/projects/utils/project-lifecycle.compute';

export type SettingsSegmentId =
  | 'sourceHealth'
  | 'setupDefaults'
  | 'reviewCenter'
  | 'importCenter'
  | 'advanced';

export interface SettingsHubSummary {
  sourcesConnected: number;
  sourcesTotal: number;
  reviewItems: number;
  setupMissing: number;
  syncWarnings: number;
}

export const SETTINGS_SEGMENT_OPTIONS: { id: SettingsSegmentId; label: string; description: string }[] = [
  { id: 'sourceHealth', label: 'Source Health', description: 'Drive, QuickBooks, Timekeeper, billing, and app database status' },
  { id: 'setupDefaults', label: 'Setup Defaults', description: 'Foreman rules, required fields, and prevailing wage logic' },
  { id: 'reviewCenter', label: 'Review Center', description: 'Exceptions grouped by what needs attention' },
  { id: 'importCenter', label: 'Import Center', description: 'Active imports — pay apps, invoices, budgets, labor' },
  { id: 'advanced', label: 'Advanced', description: 'One-time baseline tools and developer options' },
];

const PRIMARY_SOURCE_IDS = new Set([
  'master-time',
  'qb-workbook',
  'drive-folders',
  'sub-discovery',
  'labor-codes',
  'firestore',
]);

const FRAGMENT_TO_SEGMENT: Record<string, SettingsSegmentId> = {
  'source-health': 'sourceHealth',
  'sync-health': 'sourceHealth',
  'setup-defaults': 'setupDefaults',
  'review-center': 'reviewCenter',
  'setup-completeness': 'reviewCenter',
  'seed-completeness': 'reviewCenter',
  'import-review': 'reviewCenter',
  'source-review': 'reviewCenter',
  'import-center': 'importCenter',
  'labor-codes': 'importCenter',
  'drive-folders': 'sourceHealth',
  'drive-links': 'sourceHealth',
  'quickbooks-sync': 'sourceHealth',
  quickbooks: 'sourceHealth',
  'feature-setup': 'advanced',
  features: 'advanced',
  advanced: 'advanced',
  overview: 'sourceHealth',
};

const SEGMENT_TO_FRAGMENT: Record<SettingsSegmentId, string> = {
  sourceHealth: 'source-health',
  setupDefaults: 'setup-defaults',
  reviewCenter: 'review-center',
  importCenter: 'import-center',
  advanced: 'advanced',
};

export function normalizeSettingsSegment(value: string | null | undefined): SettingsSegmentId {
  if (!value) return 'sourceHealth';
  const allowed = new Set(SETTINGS_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as SettingsSegmentId) ? (value as SettingsSegmentId) : 'sourceHealth';
}

export function settingsSegmentFromFragment(fragment: string | null | undefined): SettingsSegmentId | null {
  if (!fragment) return null;
  return FRAGMENT_TO_SEGMENT[fragment] ?? null;
}

export function settingsFragmentForSegment(segment: SettingsSegmentId): string {
  return SEGMENT_TO_FRAGMENT[segment];
}

export function isActiveSetupProject(snapshot: ProjectLifecycleSnapshot): boolean {
  return snapshot.includeInDefaultScope
    && !snapshot.includeInArchive
    && !snapshot.includeInClosed2026;
}

export function setupStatusLabel(status: string): string {
  switch (status) {
    case 'Complete': return 'Complete';
    case 'MissingFinancials': return 'Missing contract / financials';
    case 'MissingDrive': return 'Missing Drive link';
    case 'MissingStatus': return 'Missing status';
    case 'MissingCustomer': return 'Missing customer';
    case 'NeedsReview': return 'Needs Review';
    default: return status.replace(/([A-Z])/g, ' $1').trim();
  }
}

export function syncStatusLabel(status: SyncHealthStatus): string {
  switch (status) {
    case 'connected': return 'Connected';
    case 'warning': return 'Needs attention';
    case 'error': return 'Error';
    case 'not_connected': return 'Not configured';
    default: return status;
  }
}

export function countSetupMissing(projects: Project[], lifecycleFor: (p: Project) => ProjectLifecycleSnapshot): number {
  return projects.filter(p => {
    const snap = lifecycleFor(p);
    if (!isActiveSetupProject(snap)) return false;
    return setupBlockingGaps(snap.seedGaps).length > 0;
  }).length;
}

export function summarizeSettingsHub(input: {
  syncRows: SyncHealthRow[];
  reviewItemCount: number;
  setupMissing: number;
}): SettingsHubSummary {
  const primary = input.syncRows.filter(r => PRIMARY_SOURCE_IDS.has(r.id));
  const connected = primary.filter(r => r.status === 'connected').length;
  const syncWarnings = input.syncRows.filter(r =>
    r.id !== 'budget-import'
    && (r.status === 'error' || (r.status === 'warning' && ((r.warnings?.length ?? 0) > 0 || (r.errors?.length ?? 0) > 0))),
  ).length;

  return {
    sourcesConnected: connected,
    sourcesTotal: primary.length,
    reviewItems: input.reviewItemCount,
    setupMissing: input.setupMissing,
    syncWarnings,
  };
}

export function settingsHubCsvRows(summary: SettingsHubSummary): string[][] {
  return [
    ['Sources connected', `${summary.sourcesConnected}/${summary.sourcesTotal}`],
    ['Review items', String(summary.reviewItems)],
    ['Setup missing (active)', String(summary.setupMissing)],
    ['Sync warnings', String(summary.syncWarnings)],
  ];
}

/** @deprecated Use reviewCenter segment */
export type LegacySettingsSegmentId = SettingsSegmentId;
