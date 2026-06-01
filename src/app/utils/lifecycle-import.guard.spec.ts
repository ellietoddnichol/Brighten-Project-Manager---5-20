import {
  inferImportedProjectCreateFields,
  mergeImportProjectPatch,
  sanitizeImportProjectPatch,
  shouldApplyImportFinancialPatch,
  shouldCreateProjectFromImport,
} from './lifecycle-import.guard';
import { computeProjectLifecycle } from './project-lifecycle.compute';
import { Project } from '../models/types';

describe('lifecycle-import.guard', () => {
  const base = (overrides: Partial<Project> = {}): Project => ({
    id: 'p1',
    projectNumber: '218',
    projectName: 'Test',
    customer: 'C',
    status: 'Active',
    ...overrides,
  });

  it('strips lifecycle fields from import patches', () => {
    const safe = sanitizeImportProjectPatch({
      estCostBudget: 1000,
      status: 'Active',
      projectStatus: 'Active',
      includeOnActiveDashboard: true,
    });
    expect(safe.estCostBudget).toBe(1000);
    expect(safe.status).toBeUndefined();
    expect(safe.projectStatus).toBeUndefined();
  });

  it('creates control-list jobs as Active and archive jobs as Closed', () => {
    expect(inferImportedProjectCreateFields('218').status).toBe('Active');
    expect(inferImportedProjectCreateFields('165').status).toBe('Closed');
    expect(shouldCreateProjectFromImport('218')).toBe(true);
    expect(shouldCreateProjectFromImport('165')).toBe(false);
  });

  it('does not promote closed jobs to active scope after import', () => {
    const closed = computeProjectLifecycle({
      project: base({ projectNumber: '165', status: 'Closed', wipStatus: 'Complete', estCostBudget: 50000 }),
    });
    expect(closed.includeInDefaultScope).toBe(false);
    expect(closed.includeInActiveWip).toBe(false);
    expect(shouldApplyImportFinancialPatch(base({ projectNumber: '165', status: 'Closed', wipStatus: 'Complete' }), closed)).toBe(true);
  });

  it('keeps active 2026 jobs in scope after import', () => {
    const active = computeProjectLifecycle({ project: base({ projectNumber: '218', status: 'Active' }) });
    expect(active.includeInDefaultScope).toBe(true);
    expect(shouldApplyImportFinancialPatch(base({ projectNumber: '218' }), active)).toBe(true);
  });

  it('does not overwrite manual PM or Drive link on import', () => {
    const project = base({
      projectManager: 'Ellie',
      driveFolderId: 'drive-abc',
      originalContractAmount: 500000,
    });
    const { patch, conflicts } = mergeImportProjectPatch(project, {
      projectManager: 'Imported PM',
      driveFolderId: 'drive-new',
      originalContractAmount: 100000,
      customer: 'Updated Customer',
    });
    expect(patch.customer).toBe('Updated Customer');
    expect(patch.projectManager).toBeUndefined();
    expect(patch.driveFolderId).toBeUndefined();
    expect(patch.originalContractAmount).toBeUndefined();
    expect(conflicts.map(c => c.field)).toContain('projectManager');
    expect(conflicts.map(c => c.field)).toContain('driveFolderId');
  });
});
