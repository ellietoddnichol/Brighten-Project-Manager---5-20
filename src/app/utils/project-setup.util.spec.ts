import { describe, expect, it } from 'vitest';
import {
  deriveCertifiedPayrollRequired,
  deriveProjectStartDate,
  effectiveForeman,
  isForemanSetupMissing,
  mapSetupProfileLabel,
  resolveDefaultForeman,
} from './project-setup.util';
import { Project } from '../models/types';

describe('project-setup.util', () => {
  const base = (overrides: Partial<Project> = {}): Project => ({
    id: 'p1',
    projectNumber: '186',
    projectName: 'LVV 3 & 5',
    customer: 'Lakeview Village',
    status: 'Active',
    ...overrides,
  });

  it('derives CPR from prevailing wage only', () => {
    expect(deriveCertifiedPayrollRequired(true)).toBe(true);
    expect(deriveCertifiedPayrollRequired(false)).toBe(false);
    expect(deriveCertifiedPayrollRequired(undefined)).toBe(false);
  });

  it('applies foreman default rules', () => {
    expect(resolveDefaultForeman(base({ customer: 'Lakeview Village', projectName: 'Admin Hallway' }))).toBe('Kyle');
    expect(resolveDefaultForeman(base({ customer: 'CWA Specialties, INC.', projectName: 'Fab Shop' }))).toBe('AJ');
    expect(resolveDefaultForeman(base({ projectNumber: '204', projectName: 'LightEdge Data Center', customer: 'XEC' }))).toBe('Dustin');
    expect(resolveDefaultForeman(base({ customer: 'Newkirk Novak', projectName: 'Fairmount' }))).toBeUndefined();
  });

  it('treats default foreman as satisfying setup', () => {
    expect(isForemanSetupMissing(base({ customer: 'Lakeview Village', projectName: 'Heritage' }), false)).toBe(false);
    expect(isForemanSetupMissing(base({ customer: 'Newkirk Novak', projectName: 'Fairmount' }), false)).toBe(true);
    expect(isForemanSetupMissing(base({ superintendent: 'Sam', projectName: 'Fairmount' }), false)).toBe(false);
  });

  it('derives start date from earliest labor/billing signal', () => {
    const start = deriveProjectStartDate({
      project: base({ id: 'p1' }),
      laborActuals: [{
        id: 'l1',
        projectId: 'p1',
        workDate: '2026-03-15',
        weekStart: '2026-03-10',
        weekEnd: '2026-03-16',
        approvalStatus: 'Approved',
        regularHours: 8,
        overtimeHours: 0,
        doubleTimeHours: 0,
        totalHours: 8,
        totalLaborCost: 320,
        source: 'Imported',
      }],
      billings: [{
        id: 'b1',
        projectId: 'p1',
        payAppNumber: '1',
        billingPeriod: '2026-02',
        billingPeriodStart: '2026-02-01',
        status: 'Invoiced',
      }],
    });
    expect(start).toBe('2026-02-01');
  });

  it('prefers manual start date override', () => {
    expect(deriveProjectStartDate({
      project: base({ id: 'p1', startDate: '2026-01-01' }),
      laborActuals: [],
    })).toBe('2026-01-01');
  });

  it('maps profile labels', () => {
    expect(mapSetupProfileLabel('L&W / Prevailing Wage', true)).toBe('PrevailingWage');
    expect(mapSetupProfileLabel('T&M / Other', false)).toBe('TMWorkOrder');
    expect(mapSetupProfileLabel('Other', false)).toBe('FullProject');
  });
});
