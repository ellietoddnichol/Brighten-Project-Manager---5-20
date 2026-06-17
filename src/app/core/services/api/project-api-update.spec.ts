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

  it('includes Phase 1B Overview completion fields when changed', () => {
    const patch = buildProjectApiUpdatePayload(base, {
      projectProfile: 'FullContractGC',
      retainagePercent: 5,
      awardDate: '2026-01-15T00:00:00.000Z',
      currentPhase: 'Construction',
    });
    expect(patch['projectProfile']).toBe('FullContractGC');
    expect(patch['retainagePercent']).toBe(5);
    expect(patch['awardDate']).toBe('2026-01-15');
    expect(patch['currentPhase']).toBe('Construction');
  });

  it('includes project_scope fields when changed', () => {
    const patch = buildProjectApiUpdatePayload(base, {
      scopeSummary: 'Demo and rebuild',
      includedWork: 'Framing',
      exclusions: 'Electrical by others',
      scheduleAccessNotes: 'Weekends only',
      closeoutRequirements: 'O&M manuals',
    });
    expect(patch['scopeSummary']).toBe('Demo and rebuild');
    expect(patch['includedWork']).toBe('Framing');
    expect(patch['exclusions']).toBe('Electrical by others');
    expect(patch['scheduleAccessNotes']).toBe('Weekends only');
    expect(patch['closeoutRequirements']).toBe('O&M manuals');
  });

  it('omits Phase 1B fields that did not change', () => {
    const current: Project = { ...base, projectProfile: 'FullContractGC', retainagePercent: 5 };
    const patch = buildProjectApiUpdatePayload(current, { projectName: 'X' });
    expect(patch).not.toHaveProperty('projectProfile');
    expect(patch).not.toHaveProperty('retainagePercent');
    expect(patch).not.toHaveProperty('scopeSummary');
  });
});
