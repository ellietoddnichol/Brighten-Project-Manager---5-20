import { describe, expect, it } from 'vitest';
import { setupGapActionItems, setupGapsToMissingRequired } from './setup-gap-items';
import { Project } from '../models/types';

describe('setup-gap-items', () => {
  const project = {
    id: 'p1',
    projectNumber: '204',
    projectName: 'LightEdge',
    customer: 'XEC',
    status: 'Active',
  } as Project;

  it('maps lifecycle gaps to action items', () => {
    const items = setupGapActionItems(project, [
      { field: 'address', label: 'Address', category: 'identity', blocksWorkflow: false },
      { field: 'originalContractAmount', label: 'Original contract amount', category: 'financials', blocksWorkflow: true },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1].severity).toBe('error');
    expect(items[0].id).toContain('setup-gap-p1-address');
  });

  it('maps lifecycle gaps to required-tab missing rows', () => {
    const rows = setupGapsToMissingRequired([
      { field: 'driveFolderId', label: 'Drive folder link', category: 'drive', blocksWorkflow: true },
    ]);
    expect(rows[0].actionLabel).toBe('Link Drive folder');
  });
});
