import { SyncHealthRow, SyncHealthStatus } from '../services/sync-health.service';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { Project } from '../models/types';

export type SettingsSegmentId =
  | 'overview'
  | 'syncHealth'
  | 'setup'
  | 'sourceReview'
  | 'laborCodes'
  | 'driveLinks'
  | 'quickbooks'
  | 'features'
  | 'advanced';

export interface SettingsHubSummary {
  sourcesConnected: number;
  sourcesTotal: number;
  sourceReviewItems: number;
  setupMissing: number;
  syncWarnings: number;
}

export interface SettingsOverviewRow {
  id: string;
  category: string;
  status: string;
  explanation: string;
  nextAction: string;
  severity: 'error' | 'warning' | 'neutral';
  segment: SettingsSegmentId;
}

export const SETTINGS_SEGMENT_OPTIONS: { id: SettingsSegmentId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'syncHealth', label: 'Sync Health' },
  { id: 'setup', label: 'Setup Completeness' },
  { id: 'sourceReview', label: 'Source Review' },
  { id: 'laborCodes', label: 'Labor Codes' },
  { id: 'driveLinks', label: 'Drive Links' },
  { id: 'quickbooks', label: 'QuickBooks' },
  { id: 'features', label: 'Features' },
  { id: 'advanced', label: 'Advanced' },
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
  overview: 'overview',
  'sync-health': 'syncHealth',
  'setup-completeness': 'setup',
  'seed-completeness': 'setup',
  'import-review': 'sourceReview',
  'source-review': 'sourceReview',
  'labor-codes': 'laborCodes',
  'drive-folders': 'driveLinks',
  'drive-links': 'driveLinks',
  'quickbooks-sync': 'quickbooks',
  quickbooks: 'quickbooks',
  'feature-setup': 'features',
  advanced: 'advanced',
};

const SEGMENT_TO_FRAGMENT: Record<SettingsSegmentId, string> = {
  overview: 'overview',
  syncHealth: 'sync-health',
  setup: 'setup-completeness',
  sourceReview: 'source-review',
  laborCodes: 'labor-codes',
  driveLinks: 'drive-links',
  quickbooks: 'quickbooks-sync',
  features: 'feature-setup',
  advanced: 'advanced',
};

export function normalizeSettingsSegment(value: string | null | undefined): SettingsSegmentId {
  if (!value) return 'overview';
  const allowed = new Set(SETTINGS_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as SettingsSegmentId) ? (value as SettingsSegmentId) : 'overview';
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
    case 'warning': return 'Warning';
    case 'error': return 'Error';
    case 'not_connected': return 'Not connected';
    default: return status;
  }
}

export function countSetupMissing(projects: Project[], lifecycleFor: (p: Project) => ProjectLifecycleSnapshot): number {
  return projects.filter(p => {
    const snap = lifecycleFor(p);
    if (!isActiveSetupProject(snap)) return false;
    return snap.seedCompletenessStatus !== 'Complete' || snap.seedGaps.length > 0;
  }).length;
}

export function summarizeSettingsHub(input: {
  syncRows: SyncHealthRow[];
  sourceReviewCount: number;
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
    sourceReviewItems: input.sourceReviewCount,
    setupMissing: input.setupMissing,
    syncWarnings,
  };
}

export function buildSettingsOverviewRows(input: {
  syncRows: SyncHealthRow[];
  sourceReviewCount: number;
  setupMissing: number;
  driveIssuesActive: number;
  unmappedLaborCodes: number;
}): SettingsOverviewRow[] {
  const rows: SettingsOverviewRow[] = [];

  const masterTime = input.syncRows.find(r => r.id === 'master-time');
  if (masterTime && masterTime.status !== 'connected') {
    rows.push({
      id: 'action-master-time',
      category: 'Master Time Sheet',
      status: syncStatusLabel(masterTime.status),
      explanation: masterTime.detail ?? 'Labor and time entries sync from the Master Time Sheet.',
      nextAction: masterTime.nextAction ?? 'Re-sync Master Time Sheet',
      severity: masterTime.status === 'error' ? 'error' : 'warning',
      segment: 'syncHealth',
    });
  }

  const qb = input.syncRows.find(r => r.id === 'qb-workbook');
  rows.push({
    id: 'action-qb',
    category: 'QuickBooks workbook',
    status: qb ? syncStatusLabel(qb.status) : 'Not connected',
    explanation: qb?.detail ?? 'Accounting sync from the QuickBooks Project Mgmt Sync Workbook.',
    nextAction: qb?.nextAction ?? 'Re-sync QuickBooks workbook',
    severity: qb?.status === 'error' ? 'error' : (qb?.status === 'warning' ? 'warning' : 'neutral'),
    segment: 'quickbooks',
  });

  if (input.unmappedLaborCodes > 0) {
    rows.push({
      id: 'action-labor',
      category: 'Labor Code Discovery',
      status: `${input.unmappedLaborCodes} unmapped`,
      explanation: 'Labor codes are discovered from the Master Time Sheet, not bundled files.',
      nextAction: 'Discover labor codes',
      severity: 'warning',
      segment: 'laborCodes',
    });
  } else {
    rows.push({
      id: 'action-labor-discover',
      category: 'Labor Code Discovery',
      status: 'Review mappings',
      explanation: 'Discover and classify labor codes from the Master Time Sheet.',
      nextAction: 'Discover labor codes',
      severity: 'neutral',
      segment: 'laborCodes',
    });
  }

  rows.push({
    id: 'action-subs',
    category: 'Subcontractor Discovery',
    status: 'QuickBooks / Drive',
    explanation: 'Discover vendors from QuickBooks sync and Drive Subs folders.',
    nextAction: 'Discover subcontractors',
    severity: 'neutral',
    segment: 'syncHealth',
  });

  if (input.sourceReviewCount > 0) {
    rows.push({
      id: 'action-review',
      category: 'Source Review',
      status: `${input.sourceReviewCount} unresolved`,
      explanation: 'Unmatched projects, vendors, labor codes, and manual conflicts need review.',
      nextAction: 'Review unmatched source rows',
      severity: 'warning',
      segment: 'sourceReview',
    });
  }

  if (input.driveIssuesActive > 0) {
    rows.push({
      id: 'action-drive',
      category: 'Drive Links',
      status: `${input.driveIssuesActive} active job(s)`,
      explanation: 'Google Drive stores files; Firestore stores folder links and file metadata.',
      nextAction: 'Fix missing Drive links',
      severity: 'warning',
      segment: 'driveLinks',
    });
  }

  if (input.setupMissing > 0) {
    rows.push({
      id: 'action-setup',
      category: 'Setup Completeness',
      status: `${input.setupMissing} active job(s)`,
      explanation: 'Missing contract, profile, PM/foreman, Drive, or CPR decisions on active jobs.',
      nextAction: 'Review setup completeness',
      severity: 'warning',
      segment: 'setup',
    });
  }

  rows.push({
    id: 'action-features',
    category: 'Feature Setup',
    status: 'Rollout matrix',
    explanation: 'See which modules are active, hidden, or need verification.',
    nextAction: 'Open Feature Setup',
    severity: 'neutral',
    segment: 'features',
  });

  return rows;
}

export function settingsHubCsvRows(summary: SettingsHubSummary, overview: SettingsOverviewRow[]): string[][] {
  return [
    ['Sources connected', `${summary.sourcesConnected}/${summary.sourcesTotal}`],
    ['Source review items', String(summary.sourceReviewItems)],
    ['Setup missing (active)', String(summary.setupMissing)],
    ['Sync warnings', String(summary.syncWarnings)],
    ...overview.map(r => [r.category, r.status, r.explanation, r.nextAction]),
  ];
}
