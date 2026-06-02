import { describe, expect, it } from 'vitest';
import {
  filterDocumentList,
  matchesFileView,
  normalizeFileCategory,
  normalizeSourceType,
  persistableFileMetadata,
  projectFileToListItem,
  requiredFileCategories,
} from './project-documents.compute';
import { ProjectFile } from '../models/types';
import { ProjectRequirementsContext } from './project-requirements.compute';

function sampleFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    id: 'f1',
    projectId: 'p1',
    fileName: 'Test.pdf',
    documentType: 'Contract',
    documentStatus: 'Received',
    ...overrides,
  };
}

function sampleCtx(overrides: Partial<ProjectRequirementsContext> = {}): ProjectRequirementsContext {
  return {
    project: {
      id: 'p1',
      projectNumber: '204',
      projectName: 'Test',
      customer: 'Cust',
      status: 'Active',
      originalContractAmount: 100000,
    },
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

describe('project-documents.compute', () => {
  it('normalizes contract from folder key', () => {
    expect(normalizeFileCategory(sampleFile({ folderKey: 'CONTRACT', documentType: '' }))).toBe('Contract');
  });

  it('normalizes generated source from billing link', () => {
    expect(normalizeSourceType(sampleFile({ billingId: 'b1', documentType: 'PayApp' }))).toBe('Generated');
  });

  it('normalizes uploaded source from uploadedBy', () => {
    expect(normalizeSourceType(sampleFile({ uploadedBy: 'ellie@brighten.com', documentType: 'Photo' }))).toBe('Uploaded');
  });

  it('filters generated view', () => {
    const files = [
      sampleFile({ id: '1', billingId: 'b1' }),
      sampleFile({ id: '2', uploadedBy: 'user', documentType: 'Photo' }),
    ];
    const items = filterDocumentList(files, 'generated', sampleCtx(), []);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('1');
  });

  it('filters uploads view', () => {
    const files = [
      sampleFile({ id: '1', billingId: 'b1' }),
      sampleFile({ id: '2', uploadedBy: 'user', documentType: 'Photo' }),
    ];
    const items = filterDocumentList(files, 'uploads', sampleCtx(), []);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('2');
  });

  it('includes setup gaps in required view', () => {
    const items = filterDocumentList([], 'required', sampleCtx(), [], '', [
      { field: 'address', label: 'Address', category: 'identity', blocksWorkflow: false },
    ]);
    expect(items.some(i => i.fileName === 'Address')).toBe(true);
  });

  it('includes missing required contract when folder required', () => {
    const ctx = sampleCtx({ billings: [{ id: 'b1', projectId: 'p1', payAppNumber: '1', billingPeriod: 'Jan', status: 'Approved' }] as never });
    const cats = requiredFileCategories(ctx);
    expect(cats.has('Billing')).toBe(true);
    const items = filterDocumentList([], 'required', ctx, []);
    expect(items.some(i => i.kind === 'missing')).toBe(true);
  });

  it('matches category filter for change orders', () => {
    const item = projectFileToListItem(sampleFile({ changeOrderId: 'co1' }));
    expect(matchesFileView(item, 'change-orders', new Set())).toBe(true);
  });

  it('persists change order metadata for CHANGE_ORDERS folder', () => {
    const meta = persistableFileMetadata({
      folderKey: 'CHANGE_ORDERS',
      workflowType: 'change_order',
      changeOrderId: 'co1',
      documentType: 'ChangeOrder',
      documentStatus: 'Generated',
    }, 'Saved to: Change Orders');
    expect(meta.fileCategory).toBe('ChangeOrder');
    expect(meta.sourceType).toBe('Generated');
    expect(meta.savedToLabel).toBe('Saved to: Change Orders');
  });

  it('persists billing metadata for BILLING folder', () => {
    const meta = persistableFileMetadata({
      folderKey: 'BILLING',
      workflowType: 'billing',
      billingId: 'b1',
      documentType: 'PayApp',
    });
    expect(meta.fileCategory).toBe('Billing');
    expect(meta.sourceType).toBe('Generated');
  });

  it('persists COI metadata under Subs/Insurance category', () => {
    const meta = persistableFileMetadata({
      folderKey: 'SUBS',
      documentType: 'CertificateOfInsurance',
      uploadedBy: 'ellie@brighten.com',
    });
    expect(meta.fileCategory).toBe('Insurance');
    expect(meta.sourceType).toBe('Uploaded');
  });
});
