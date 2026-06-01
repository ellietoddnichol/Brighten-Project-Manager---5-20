import { describe, expect, it } from 'vitest';
import {
  buildSettingsOverviewRows,
  settingsSegmentFromFragment,
  settingsFragmentForSegment,
  summarizeSettingsHub,
  setupStatusLabel,
} from './settings-hub.compute';
import { SyncHealthRow } from '../services/sync-health.service';

function row(overrides: Partial<SyncHealthRow> = {}): SyncHealthRow {
  return {
    id: 'master-time',
    label: 'Master Time Sheet',
    status: 'connected',
    ...overrides,
  };
}

describe('settings-hub.compute', () => {
  it('maps legacy fragments to segments', () => {
    expect(settingsSegmentFromFragment('import-review')).toBe('sourceReview');
    expect(settingsSegmentFromFragment('seed-completeness')).toBe('setup');
    expect(settingsFragmentForSegment('sourceReview')).toBe('source-review');
  });

  it('summarizes connected sources', () => {
    const summary = summarizeSettingsHub({
      syncRows: [
        row({ id: 'master-time', status: 'connected' }),
        row({ id: 'qb-workbook', status: 'connected' }),
        row({ id: 'drive-folders', status: 'not_connected' }),
        row({ id: 'sub-discovery', status: 'connected' }),
        row({ id: 'labor-codes', status: 'connected' }),
        row({ id: 'firestore', status: 'connected' }),
        row({ id: 'budget-import', status: 'not_connected' }),
      ],
      sourceReviewCount: 2,
      setupMissing: 3,
    });
    expect(summary.sourcesConnected).toBe(5);
    expect(summary.sourceReviewItems).toBe(2);
  });

  it('labels setup status for display', () => {
    expect(setupStatusLabel('MissingFinancials')).toContain('contract');
  });

  it('builds overview rows including source review', () => {
    const rows = buildSettingsOverviewRows({
      syncRows: [row({ id: 'qb-workbook', status: 'warning', warnings: ['Missing AR Aging'] })],
      sourceReviewCount: 4,
      setupMissing: 1,
      driveIssuesActive: 2,
      unmappedLaborCodes: 3,
    });
    expect(rows.some(r => r.category === 'Source Review')).toBe(true);
    expect(rows.some(r => r.category === 'Labor Code Discovery')).toBe(true);
  });
});
