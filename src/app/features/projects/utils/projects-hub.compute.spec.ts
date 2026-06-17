import { describe, expect, it } from 'vitest';
import {
  buildProjectListRow,
  buildProjectWarnings,
  normalizeProjectsViewParam,
  projectDisplayStatus,
  projectsEmptyMessage,
} from '@features/projects/utils/projects-hub.compute';
import { Project } from '@app/models/types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import { buildProjectFinancial } from '@features/projects/utils/project-financial.compute';

function baseLifecycle(overrides: Partial<ProjectLifecycleSnapshot> = {}): ProjectLifecycleSnapshot {
  return {
    projectId: 'p1',
    jobNumber: '204',
    projectName: 'Test',
    normalizedStatus: 'Active',
    projectLifecycleGroup: 'Active',
    isActive2026ControlJob: true,
    includeInDefaultScope: true,
    includeInProjectsList: true,
    includeInActiveWip: true,
    includeInCloseoutAr: false,
    hasRetainage: false,
    includeInClosed2026: false,
    includeInArchive: false,
    has2026Activity: false,
    hasOpenWipWork: true,
    hasOpenAr: false,
    hasOpenTasks: false,
    hasOpenCompliance: false,
    seedCompletenessStatus: 'Complete',
    seedGaps: [],
    reviewReasons: [],
    ...overrides,
  };
}

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    projectNumber: '204',
    projectName: 'LightEdge',
    customer: 'Customer',
    status: 'Active',
    ...overrides,
  };
}

describe('projects-hub.compute', () => {
  it('normalizes active view param to default', () => {
    expect(normalizeProjectsViewParam('active')).toBe('default');
    expect(normalizeProjectsViewParam('closeout')).toBe('closeout');
  });

  it('uses plain construction status labels', () => {
    expect(projectDisplayStatus(baseLifecycle({ projectLifecycleGroup: 'NeedsReview' }))).toBe('Needs Review');
    expect(projectDisplayStatus(baseLifecycle({ projectLifecycleGroup: 'Archive' }))).toBe('Archived');
  });

  it('suppresses project warnings in manual-first mode', () => {
    const project = baseProject({ driveFolderId: undefined, projectManager: undefined });
    const lifecycle = baseLifecycle();
    const financial = buildProjectFinancial(project, [], [], []);
    const warnings = buildProjectWarnings({
      project,
      lifecycle,
      financial: { ...financial, currentContractAmount: 0, budgetBasis: 'MissingContract' },
    });
    expect(warnings).toHaveLength(0);
  });

  it('suppresses setup warnings on archived rows', () => {
    const project = baseProject({ driveFolderId: undefined });
    const lifecycle = baseLifecycle({ projectLifecycleGroup: 'Archive', includeInArchive: true, includeInDefaultScope: false });
    const financial = buildProjectFinancial(project, [], [], []);
    const row = buildProjectListRow({ project, lifecycle, financial, arRecords: [] });
    expect(row.quietRow).toBe(true);
    expect(row.warnings).toHaveLength(0);
  });

  it('returns helpful empty state for Active view', () => {
    const msg = projectsEmptyMessage('default', false);
    expect(msg.title).toContain('No jobs');
    expect(msg.hint).toContain('Closed and archived');
  });
});
