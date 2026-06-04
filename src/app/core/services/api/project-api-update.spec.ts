import { describe, expect, it } from 'vitest';
import { buildProjectApiUpdatePayload, hasApiUpdateFields } from './project-api-update';
import { Project } from '@app/models/types';

const base: Project = {
  id: 'p1',
  projectNumber: '208',
  projectName: 'Test Job',
  customer: 'ACME',
  status: 'Active',
  address: '123 Main',
  superintendent: 'Smith',
  prevailingWage: false,
  certifiedPayrollRequired: false,
};

describe('buildProjectApiUpdatePayload', () => {
  it('includes changed allowed fields only', () => {
    const patch = buildProjectApiUpdatePayload(base, {
      projectName: 'Updated Name',
      billingStatus: 'Progress billing',
    });
    expect(patch['projectName']).toBe('Updated Name');
    expect(patch['billingStatus']).toBe('Progress billing');
    expect(patch).not.toHaveProperty('projectManager');
    expect(patch).not.toHaveProperty('retainagePercent');
  });

  it('maps prevailing wage and CPR as one concept', () => {
    const patch = buildProjectApiUpdatePayload(base, { prevailingWage: true });
    expect(patch['prevailingWage']).toBe(true);
    expect(patch).not.toHaveProperty('certifiedPayrollRequired');
  });

  it('returns empty when nothing changed', () => {
    const patch = buildProjectApiUpdatePayload(base, { ...base });
    expect(hasApiUpdateFields(patch)).toBe(false);
  });
});
