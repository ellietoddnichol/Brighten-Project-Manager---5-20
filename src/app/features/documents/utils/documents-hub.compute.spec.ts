import { describe, expect, it } from 'vitest';
import {
  buildDocumentsDriveLinkRows,
  buildDocumentsHubFileRows,
  buildDocumentsOverviewRows,
  isActiveDocumentsProject,
  normalizeDocumentsSegment,
  summarizeDocumentsHub,
} from '@features/documents/utils/documents-hub.compute';
import { ProjectFile, Project } from '@app/models/types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import { ProjectRequirementsContext } from '@features/projects/utils/project-requirements.compute';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    projectNumber: '204',
    projectName: 'Test Job',
    customer: 'Acme',
    status: 'Active',
    ...overrides,
  };
}

function lifecycle(active = true): ProjectLifecycleSnapshot {
  return {
    includeInDefaultScope: active,
    includeInArchive: false,
    includeInClosed2026: false,
  } as ProjectLifecycleSnapshot;
}

function ctx(overrides: Partial<ProjectRequirementsContext> = {}): ProjectRequirementsContext {
  return {
    project: project(),
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
    ...overrides,
  };
}

describe('documents-hub.compute', () => {
  it('normalizes segment param', () => {
    expect(normalizeDocumentsSegment('generated')).toBe('generated');
    expect(normalizeDocumentsSegment(null)).toBe('overview');
  });

  it('detects active hub projects', () => {
    expect(isActiveDocumentsProject(lifecycle(true))).toBe(true);
    expect(isActiveDocumentsProject({ includeInDefaultScope: false, includeInArchive: true } as ProjectLifecycleSnapshot)).toBe(false);
  });

  it('summarizes missing required and drive issues', () => {
    const contexts = [{
      project: project({ driveFolderId: undefined }),
      lifecycle: lifecycle(),
      reqCtx: ctx(),
      requiredDocs: [{ id: 'r1', projectId: 'p1', documentType: 'Contract', required: true, status: 'Missing' }],
    }];
    const summary = summarizeDocumentsHub({ files: [], contexts });
    expect(summary.driveIssues).toBe(1);
    expect(summary.missingRequired).toBeGreaterThan(0);
  });

  it('builds overview rows for drive setup', () => {
    const rows = buildDocumentsOverviewRows({
      files: [],
      contexts: [{
        project: project({ driveFolderId: undefined }),
        lifecycle: lifecycle(),
        reqCtx: ctx(),
        requiredDocs: [],
      }],
      importExceptions: [],
    });
    expect(rows.some(r => r.section === 'driveSetup')).toBe(true);
  });

  it('filters generated hub file rows', () => {
    const files: ProjectFile[] = [{
      id: 'f1',
      projectId: 'p1',
      fileName: 'Pay App.pdf',
      documentType: 'PayApp',
      documentStatus: 'Generated',
      billingId: 'b1',
    }];
    const rows = buildDocumentsHubFileRows({
      files,
      contexts: [{ project: project(), lifecycle: lifecycle(), reqCtx: ctx(), requiredDocs: [] }],
      segment: 'generated',
      search: '',
    });
    expect(rows).toHaveLength(1);
  });

  it('builds drive link rows for active jobs', () => {
    const rows = buildDocumentsDriveLinkRows([{
      project: project({ driveFolderId: 'drive-1' }),
      lifecycle: lifecycle(),
      reqCtx: ctx(),
      requiredDocs: [],
    }]);
    expect(rows[0]?.rootLinked).toBe(true);
  });
});
