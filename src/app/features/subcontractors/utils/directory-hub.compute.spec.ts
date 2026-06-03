import { describe, expect, it } from 'vitest';
import {
  buildDirectoryCustomerRows,
  buildDirectoryOverviewRows,
  buildDirectorySubRows,
  directorySourceLabel,
  matchesSubHubFilter,
  normalizeDirectorySegment,
  summarizeDirectoryHub,
} from '@features/subcontractors/utils/directory-hub.compute';
import { Subcontractor } from '@app/models/subcontractor.types';
import { Project } from '@app/models/types';
import { ProjectFinancial } from '@app/models/financial.types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';

function sub(overrides: Partial<Subcontractor> = {}): Subcontractor {
  return {
    id: 's1',
    companyName: 'Tech Electric, LLC',
    w9Status: 'Missing',
    insuranceStatus: 'Missing',
    status: 'PendingSetup',
    source: 'QuickBooksSync',
    vendorClassification: 'NeedsReview',
    ...overrides,
  };
}

describe('directory-hub.compute', () => {
  it('normalizes segment param', () => {
    expect(normalizeDirectorySegment('vendors')).toBe('vendors');
    expect(normalizeDirectorySegment(null)).toBe('overview');
  });

  it('labels QuickBooks discovery source', () => {
    expect(directorySourceLabel('QuickBooksSync')).toBe('QuickBooks');
    expect(directorySourceLabel('DriveDiscovery')).toBe('Drive');
  });

  it('summarizes directory counts', () => {
    const summary = summarizeDirectoryHub({
      subs: [
        sub(),
        sub({ id: 's2', companyName: 'L&W Supply', vendorClassification: 'Supplier' }),
      ],
      projectSubs: [{
        id: 'ps1',
        projectId: 'p1',
        subcontractorId: 's1',
        subcontractorName: 'Tech Electric, LLC',
        status: 'Active',
        complianceStatus: 'MissingItems',
        performanceStatus: 'Good',
      }],
    });
    expect(summary.companies).toBe(2);
    expect(summary.missingW9).toBe(2);
    expect(summary.activeProjectSubs).toBe(1);
  });

  it('filters active subcontractors', () => {
    const row = sub({ status: 'Approved' });
    expect(matchesSubHubFilter(row, 2, 'active')).toBe(true);
    expect(matchesSubHubFilter(sub({ status: 'Inactive' }), 0, 'active')).toBe(false);
  });

  it('builds subcontractor rows for classified subs', () => {
    const rows = buildDirectorySubRows({
      subs: [sub({ vendorClassification: 'Subcontractor' })],
      projectSubs: [],
      vendorBalances: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceLabel).toBe('QuickBooks');
  });

  it('builds overview rows for classification needs', () => {
    const rows = buildDirectoryOverviewRows({
      subs: [sub()],
      projectSubs: [],
      importExceptions: [],
    });
    expect(rows.some(r => r.section === 'classification')).toBe(true);
  });

  it('groups customers from projects', () => {
    const lifecycle: ProjectLifecycleSnapshot = {
      includeInDefaultScope: true,
    } as ProjectLifecycleSnapshot;
    const rows = buildDirectoryCustomerRows({
      projects: [{
        id: 'p1',
        projectNumber: '204',
        projectName: 'Test',
        customer: 'Acme Corp',
        status: 'Active',
      } as Project],
      lifecycleByProjectId: new Map([['p1', lifecycle]]),
      financialByProjectId: new Map([['p1', { currentContractAmount: 50000 } as ProjectFinancial]]),
      arRecords: [],
    });
    expect(rows[0]?.customerName).toBe('Acme Corp');
    expect(rows[0]?.contractValue).toBe(50000);
  });
});
