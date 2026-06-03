import { describe, expect, it } from 'vitest';
import { Project, ProjectFolder } from '@app/models/types';
import {
  buildFolderRequirementRows,
  driveFolderTaskDescriptors,
  effectiveProfile,
  folderNeedStatus,
  folderRequirementLevel,
  needsProfileDecision,
  summarizeDriveMapping,
} from '@features/projects/utils/project-requirements.compute';
import { ProjectRequirementsContext } from '@features/projects/utils/project-requirements.compute';

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    projectNumber: 'J210',
    projectName: 'Test Job',
    customer: 'Customer',
    status: 'Active',
    driveFolderId: 'drive-1',
    originalContractAmount: 500000,
    ...overrides,
  };
}

function ctx(overrides: Partial<ProjectRequirementsContext> = {}): ProjectRequirementsContext {
  return {
    project: baseProject(),
    folders: [],
    changeOrders: [],
    changeRequests: [],
    billings: [],
    arRecords: [],
    projectSubcontractors: [],
    subcontractorInvoices: [],
    pos: [],
    submittals: [],
    dailyLogs: [],
    projectFiles: [],
    laborActuals: [],
    ...overrides,
  };
}

function folder(folderKey: string, linked = true): ProjectFolder {
  return {
    id: `f-${folderKey}`,
    projectId: 'p1',
    folderKey,
    folderName: folderKey,
    folderId: linked ? 'drive-sub' : undefined,
    sortOrder: 0,
    isRequired: false,
    linkStatus: linked ? 'Linked' : 'Missing',
  };
}

describe('project-requirements.compute', () => {
  it('small install with sparse folders suggests profile decision', () => {
    const c = ctx({
      project: baseProject({ projectProfile: undefined }),
      folders: [folder('BILLING'), folder('PO_IMAGES')],
    });
    expect(needsProfileDecision(c)).toBe(true);
    expect(driveFolderTaskDescriptors(c).some(t => t.triggerKey.includes('drive-profile'))).toBe(true);
  });

  it('explicit SmallInstall profile does not require submittals', () => {
    const c = ctx({ project: baseProject({ projectProfile: 'SmallInstall' }) });
    expect(folderRequirementLevel('SUBMITTALS', c)).toBe('not_needed');
    expect(folderRequirementLevel('CERTIFIED_PAYROLL', c)).toBe('not_needed');
  });

  it('prevailing wage project requires certified payroll folder', () => {
    const c = ctx({ project: baseProject({ prevailingWage: true, projectProfile: 'PrevailingWage' }) });
    expect(folderRequirementLevel('CERTIFIED_PAYROLL', c)).toBe('required');
  });

  it('subcontractor invoices require lien waivers folder', () => {
    const c = ctx({
      subcontractorInvoices: [{
        id: 'inv1',
        projectId: 'p1',
        subcontractorId: 's1',
        subcontractorName: 'Sub Co',
        projectSubcontractorId: 'ps1',
        invoiceNumber: 'INV-1',
        amount: 1000,
        approvedAmount: 1000,
        paidAmount: 1000,
        openBalance: 0,
        retainagePercent: 0,
        retainageAmount: 0,
        netDue: 0,
        status: 'Paid',
        lienWaiverStatus: 'Needed',
        documentIds: [],
      }],
    });
    expect(folderRequirementLevel('LIEN_WAIVERS', c)).toBe('required');
  });

  it('missing required folder only when data requires it', () => {
    const c = ctx({
      changeOrders: [{ id: 'co1', projectId: 'p1', coNumber: 'CO-1', title: 'CO', status: 'Approved' } as any],
      folders: [folder('CHANGE_ORDERS', false)],
    });
    expect(folderNeedStatus('CHANGE_ORDERS', c.folders[0], c)).toBe('missing_required');
    expect(folderNeedStatus('SUBMITTALS', undefined, c)).toBe('not_needed');
  });

  it('closeout AR profile focuses on billing not daily logs', () => {
    const c = ctx({
      project: baseProject({ projectProfile: 'CloseoutAR', status: 'Closeout' }),
      arRecords: [{ id: 'ar1', projectId: 'p1', openBalance: 5000, originalAmount: 5000, agingBucket: '1-30', status: 'Open', source: 'Manual' }],
    });
    expect(folderRequirementLevel('DAILY_LOGS', c)).toBe('not_needed');
    expect(folderRequirementLevel('BILLING', c)).toBe('required');
  });

  it('summarize counts missing required separately from optional', () => {
    const c = ctx({
      project: baseProject({ projectProfile: 'FullProject', prevailingWage: true }),
      folders: [
        folder('CONTRACT'),
        folder('CERTIFIED_PAYROLL', false),
        folder('PLANS_SPECS', false),
      ],
    });
    const summary = summarizeDriveMapping(c);
    expect(summary.missingRequired).toBeGreaterThan(0);
    expect(summary.found).toBe(1);
  });

  it('choosing profile clears needs-profile-only tasks path', () => {
    const c = ctx({
      project: baseProject({ projectProfile: 'SmallInstall' }),
      folders: [folder('BILLING'), folder('PO_IMAGES')],
    });
    expect(needsProfileDecision(c)).toBe(false);
    expect(effectiveProfile(c)).toBe('SmallInstall');
    expect(buildFolderRequirementRows(c).filter(r => r.needStatus === 'missing_required').length).toBe(0);
  });
});
