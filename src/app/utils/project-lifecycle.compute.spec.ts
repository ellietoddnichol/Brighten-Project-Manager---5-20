import {
  computeProjectLifecycle,
  matchesProjectsListView,
  normalizeProjectStatus,
  shouldCreateDriveLinkTask,
} from './project-lifecycle.compute';
import { assignWipGroup, buildWipRecord } from './wip.compute';
import { buildProjectFinancial } from './project-financial.compute';
import { Project } from '../models/types';
import { Billing } from '../models/types';

describe('project-lifecycle.compute', () => {
  const baseProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'p1',
    projectNumber: '218',
    projectName: 'Test Job',
    customer: 'Customer',
    status: 'Active',
    ...overrides,
  });

  const openAr = (projectId: string) => ([{
    id: 'ar1',
    projectId,
    status: 'Open' as const,
    openBalance: 500,
    originalAmount: 500,
    agingBucket: 'Current' as const,
    source: 'App' as const,
  }]);

  it('normalizes legacy status values', () => {
    expect(normalizeProjectStatus(baseProject({ status: 'Lead / Precon' }))).toBe('Precon');
    expect(normalizeProjectStatus(baseProject({ status: 'Closed', wipStatus: 'Complete' }))).toBe('Complete');
  });

  it('archives legacy job numbers 140-180 except 158', () => {
    const archived = computeProjectLifecycle({ project: baseProject({ projectNumber: '165', status: 'Closed', wipStatus: 'Complete' }) });
    expect(archived.projectLifecycleGroup).toBe('Archive');
    expect(archived.includeInArchive).toBe(true);
    expect(archived.includeInProjectsList).toBe(false);
    expect(archived.includeInDefaultScope).toBe(false);
    expect(archived.includeInActiveWip).toBe(false);

    const active158 = computeProjectLifecycle({ project: baseProject({ projectNumber: '158', status: 'Active' }) });
    expect(active158.projectLifecycleGroup).toBe('Active');
    expect(active158.isActive2026ControlJob).toBe(true);
    expect(active158.includeInDefaultScope).toBe(true);
    expect(active158.includeInActiveWip).toBe(true);
  });

  it('hides non-control-list jobs from default scope', () => {
    const offList = computeProjectLifecycle({ project: baseProject({ projectNumber: '155', status: 'Active' }) });
    expect(offList.isActive2026ControlJob).toBe(false);
    expect(offList.includeInDefaultScope).toBe(false);
    expect(offList.projectLifecycleGroup).toBe('Archive');
  });

  it('closed project with seed gaps does not show in Active', () => {
    const closed = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '165',
        status: 'Closed',
        wipStatus: 'Complete',
        seedActionRequired: 'Review contract',
      }),
    });
    expect(closed.projectLifecycleGroup).not.toBe('Active');
    expect(matchesProjectsListView(closed, 'active')).toBe(false);
    expect(closed.includeInActiveWip).toBe(false);
  });

  it('excludes archive jobs with includeOnActiveDashboard from Active 2026 Jobs', () => {
    const pinnedArchive = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '153',
        status: 'Active',
        includeOnActiveDashboard: true,
      }),
    });
    expect(pinnedArchive.includeInDefaultScope).toBe(false);
    expect(pinnedArchive.includeInActiveWip).toBe(false);
    expect(pinnedArchive.projectLifecycleGroup).toBe('Archive');
    expect(matchesProjectsListView(pinnedArchive, 'default')).toBe(false);
    expect(matchesProjectsListView(pinnedArchive, 'active')).toBe(false);
  });

  it('closed control-list job does not show in Active 2026 scope', () => {
    const closedControl = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '204',
        status: 'Closed',
        wipStatus: 'Complete',
        closedDate: '2026-03-01',
      }),
      billings: [{
        id: 'b1',
        projectId: 'p1',
        payAppNumber: '1',
        billingPeriod: '2026-03',
        billingPeriodEnd: '2026-03-31',
        status: 'Invoiced',
        currentApplication: 1000,
      }],
    });
    expect(closedControl.includeInDefaultScope).toBe(false);
    expect(closedControl.includeInActiveWip).toBe(false);
    expect(matchesProjectsListView(closedControl, 'default')).toBe(false);
  });

  it('closed job with Drive link does not show in Active', () => {
    const closed = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '170',
        status: 'Closed',
        wipStatus: 'Complete',
        driveFolderId: 'drive-123',
        driveFolderUrl: 'https://drive.google.com/folder/123',
      }),
    });
    expect(matchesProjectsListView(closed, 'active')).toBe(false);
    expect(closed.includeInDefaultScope).toBe(false);
  });

  it('closed project with old billing/cost does not show in Active', () => {
    const closed = computeProjectLifecycle({
      project: baseProject({ projectNumber: '172', status: 'Closed', wipStatus: 'Complete', id: 'p-old' }),
      billings: [{
        id: 'b1',
        projectId: 'p-old',
        payAppNumber: '1',
        billingPeriod: '2026-03',
        billingPeriodEnd: '2026-03-31',
        status: 'Invoiced',
        currentApplication: 1000,
      }],
      laborActuals: [{
        id: 'la1',
        projectId: 'p-old',
        workDate: '2026-02-01',
        weekStart: '2026-02-01',
        weekEnd: '2026-02-07',
        approvalStatus: 'Approved',
        totalLaborCost: 500,
        regularHours: 8,
        overtimeHours: 0,
        doubleTimeHours: 0,
        totalHours: 8,
        source: 'Imported',
      }],
    });
    expect(closed.projectLifecycleGroup).toBe('Closed2026');
    expect(matchesProjectsListView(closed, 'active')).toBe(false);
    expect(closed.includeInActiveWip).toBe(false);
  });

  it('closed project with open AR goes to Closeout AR, not Active WIP', () => {
    const closedAr = computeProjectLifecycle({
      project: baseProject({ projectNumber: '175', status: 'Closed', wipStatus: 'Complete', id: 'p-ar' }),
      arRecords: openAr('p-ar'),
    });
    expect(closedAr.projectLifecycleGroup).toBe('Closeout');
    expect(closedAr.includeInCloseoutAr).toBe(true);
    expect(closedAr.includeInActiveWip).toBe(false);
    expect(matchesProjectsListView(closedAr, 'active')).toBe(false);

    const financial = buildProjectFinancial(
      baseProject({ projectNumber: '175', status: 'Closed', wipStatus: 'Complete', id: 'p-ar' }),
      [],
      [],
      [],
    );
    const wip = buildWipRecord({
      project: baseProject({ projectNumber: '175', status: 'Closed', wipStatus: 'Complete', id: 'p-ar' }),
      financial: { ...financial, arBalance: 500 },
      changeOrders: [],
      billings: [],
      arRecords: openAr('p-ar'),
      lifecycle: closedAr,
    });
    expect(wip.wipGroup).toBe('CloseoutAR');
  });

  it('active 2026 job with NeedsReview still shows in Active and WIP', () => {
    const needsReview = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '186',
        status: 'Active',
        seedActionRequired: 'Review budget',
      }),
    });
    expect(needsReview.projectLifecycleGroup).toBe('NeedsReview');
    expect(needsReview.includeInDefaultScope).toBe(true);
    expect(needsReview.includeInActiveWip).toBe(true);
    expect(matchesProjectsListView(needsReview, 'default')).toBe(true);

    const financial = buildProjectFinancial(baseProject({ projectNumber: '186', status: 'Active' }), [], [], []);
    const wip = buildWipRecord({
      project: baseProject({ projectNumber: '186', status: 'Active', seedActionRequired: 'Review budget' }),
      financial,
      changeOrders: [],
      billings: [],
      arRecords: [],
      lifecycle: needsReview,
    });
    expect(wip.wipGroup).toBe('ActiveWIP');
    expect(wip.needsReview).toBe(true);
  });

  it('keeps closed 2026 jobs available for reporting', () => {
    const closed2026 = computeProjectLifecycle({
      project: baseProject({ projectNumber: '204', status: 'Closed', closedDate: '2026-03-01', wipStatus: 'Complete' }),
      billings: [{
        id: 'b1',
        projectId: 'p1',
        payAppNumber: '1',
        billingPeriod: '2026-03',
        billingPeriodEnd: '2026-03-31',
        status: 'Invoiced',
        currentApplication: 1000,
      }],
    });
    expect(closed2026.projectLifecycleGroup).toBe('Closed2026');
    expect(closed2026.includeInClosed2026).toBe(true);
    expect(closed2026.includeInActiveWip).toBe(false);
    expect(matchesProjectsListView(closed2026, 'active')).toBe(false);
  });

  it('closed project with open AR appears in Closeout view', () => {
    const closedAr = computeProjectLifecycle({
      project: baseProject({ projectNumber: '175', status: 'Closed', wipStatus: 'Complete', id: 'p-ar' }),
      arRecords: openAr('p-ar'),
    });
    expect(matchesProjectsListView(closedAr, 'closeout')).toBe(true);
    expect(matchesProjectsListView(closedAr, 'default')).toBe(false);
  });

  it('active filter contains only current active control-list jobs', () => {
    const active218 = computeProjectLifecycle({ project: baseProject({ projectNumber: '218', status: 'Active' }) });
    const closed165 = computeProjectLifecycle({ project: baseProject({ projectNumber: '165', status: 'Closed', wipStatus: 'Complete' }) });
    expect(matchesProjectsListView(active218, 'active')).toBe(true);
    expect(matchesProjectsListView(closed165, 'active')).toBe(false);
  });

  it('excludes PTO-style overhead from project lists', () => {
    const overhead = computeProjectLifecycle({ project: baseProject({ projectNumber: 'PTO', projectName: 'PTO' }) });
    expect(overhead.includeInProjectsList).toBe(false);
  });

  it('allows manually reopened closed job into active scope', () => {
    const reopened = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '165',
        status: 'Closed',
        wipStatus: 'Complete',
        projectStatus: 'Active',
      }),
    });
    expect(reopened.includeInDefaultScope).toBe(true);
    expect(reopened.includeInActiveWip).toBe(true);
  });

  it('does not create Drive link task for archive jobs missing Drive', () => {
    const lifecycle = computeProjectLifecycle({
      project: baseProject({
        projectNumber: '165',
        status: 'Closed',
        wipStatus: 'Complete',
      }),
    });
    expect(lifecycle.includeInArchive).toBe(true);
    expect(shouldCreateDriveLinkTask(lifecycle, baseProject({ projectNumber: '165', status: 'Closed' }))).toBe(false);
  });

  it('creates Drive link task for active jobs missing Drive', () => {
    const lifecycle = computeProjectLifecycle({
      project: baseProject({ projectNumber: '204', status: 'Active' }),
    });
    expect(shouldCreateDriveLinkTask(lifecycle, baseProject({ projectNumber: '204', status: 'Active' }))).toBe(true);
  });
});

describe('assignWipGroup closed precedence', () => {
  it('never assigns closed archive job to Active WIP', () => {
    const project = {
      id: 'p1',
      projectNumber: '165',
      projectName: 'Old Job',
      customer: 'Customer',
      status: 'Closed' as const,
      wipStatus: 'Complete' as const,
      billedToDate: 50000,
      originalContractAmount: 50000,
      driveFolderId: 'abc',
    };
    const lifecycle = computeProjectLifecycle({ project });
    const financial = buildProjectFinancial(project, [], [], []);
    const group = assignWipGroup({
      project,
      financial,
      changeOrders: [],
      billings: [] as Billing[],
      arRecords: [],
      lifecycle,
    }, []);
    expect(group).not.toBe('ActiveWIP');
  });
});
