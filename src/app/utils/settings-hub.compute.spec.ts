import { describe, expect, it } from 'vitest';
import {
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
  it('maps legacy fragments to new segments', () => {
    expect(settingsSegmentFromFragment('import-review')).toBe('reviewCenter');
    expect(settingsSegmentFromFragment('seed-completeness')).toBe('reviewCenter');
    expect(settingsSegmentFromFragment('sync-health')).toBe('sourceHealth');
    expect(settingsSegmentFromFragment('quickbooks-sync')).toBe('sourceHealth');
    expect(settingsSegmentFromFragment('labor-codes')).toBe('importCenter');
    expect(settingsFragmentForSegment('reviewCenter')).toBe('review-center');
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
      reviewItemCount: 2,
      setupMissing: 3,
    });
    expect(summary.sourcesConnected).toBe(5);
    expect(summary.reviewItems).toBe(2);
  });

  it('labels setup status for display', () => {
    expect(setupStatusLabel('MissingFinancials')).toContain('contract');
  });
});
