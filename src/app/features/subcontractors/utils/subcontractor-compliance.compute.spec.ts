import { describe, expect, it } from 'vitest';
import {
  computeProjectSubComplianceStatus,
  complianceTasksForProjectSub,
  isCoiExpiringSoon,
  isDocumentExpired,
  validateApprovedToStartStatus,
} from '@features/subcontractors/utils/subcontractor-compliance.compute';
import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorDocument,
} from '@app/models/subcontractor.types';

const master: Subcontractor = {
  id: 'sub-1',
  companyName: 'ABC Electric',
  trade: 'Electrical',
  w9Status: 'Missing',
  insuranceStatus: 'Missing',
  status: 'PendingSetup',
};

const projectSub: ProjectSubcontractor = {
  id: 'ps-1',
  projectId: 'proj-1',
  subcontractorId: 'sub-1',
  subcontractorName: 'ABC Electric',
  status: 'PendingCompliance',
  complianceStatus: 'MissingItems',
  performanceStatus: 'Good',
};

function doc(partial: Partial<SubcontractorDocument>): SubcontractorDocument {
  return {
    id: partial.id ?? 'doc-1',
    subcontractorId: 'sub-1',
    documentType: 'W9',
    status: 'Valid',
    ...partial,
  };
}

describe('subcontractor compliance compute', () => {
  it('computes missing compliance when required docs absent', () => {
    expect(computeProjectSubComplianceStatus(master, [], 'ps-1')).toBe('MissingItems');
  });

  it('computes complete when required docs are valid', () => {
    const docs: SubcontractorDocument[] = [
      doc({ id: 'w9', documentType: 'W9' }),
      doc({ id: 'coi', documentType: 'CertificateOfInsurance', expirationDate: '2027-01-01' }),
      doc({ id: 'wc', documentType: 'WorkersComp', expirationDate: '2027-01-01' }),
      doc({ id: 'sa', documentType: 'SubcontractAgreement', projectSubcontractorId: 'ps-1' }),
    ];
    expect(computeProjectSubComplianceStatus(
      { ...master, w9Status: 'OnFile', insuranceStatus: 'Valid' },
      docs,
      'ps-1',
      new Date('2026-05-21'),
    )).toBe('Complete');
  });

  it('flags COI expiring within 30 days', () => {
    const exp = new Date('2026-06-15');
    expect(isCoiExpiringSoon('2026-06-15', new Date('2026-05-21'))).toBe(true);
    expect(isDocumentExpired('2026-06-15', exp)).toBe(false);
  });

  it('creates expired COI task', () => {
    const tasks = complianceTasksForProjectSub(
      { ...master, insuranceStatus: 'Expired', coiExpirationDate: '2026-01-01' },
      projectSub,
      [],
      true,
      new Date('2026-05-21'),
    );
    expect(tasks.some(t => t.triggerKey.includes('coi-expired'))).toBe(true);
  });

  it('creates missing W-9 task', () => {
    const tasks = complianceTasksForProjectSub(master, projectSub, [], true);
    expect(tasks.some(t => t.triggerKey.includes('sub-w9'))).toBe(true);
  });

  it('creates missing signed subcontract task', () => {
    const tasks = complianceTasksForProjectSub(master, projectSub, [], true);
    expect(tasks.some(t => t.triggerKey.includes('sub-agreement'))).toBe(true);
  });

  it('blocks ApprovedToStart without compliance unless override note exists', () => {
    const blocked = validateApprovedToStartStatus(
      { status: 'PendingCompliance', complianceStatus: 'MissingItems' },
      'ApprovedToStart',
    );
    expect(blocked.allowed).toBe(false);

    const allowed = validateApprovedToStartStatus(
      {
        status: 'PendingCompliance',
        complianceStatus: 'MissingItems',
        complianceOverrideNote: 'GC approved start with pending COI update',
      },
      'ApprovedToStart',
    );
    expect(allowed.allowed).toBe(true);
  });

  it('creates Do Not Use assignment task on active project', () => {
    const tasks = complianceTasksForProjectSub(
      { ...master, status: 'DoNotUse' },
      projectSub,
      [],
      true,
    );
    expect(tasks.some(t => t.triggerKey.includes('sub-dnu'))).toBe(true);
  });
});
