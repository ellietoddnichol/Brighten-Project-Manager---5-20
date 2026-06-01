import {
  bonusEligibleLaborCost,
  countsTowardBonus,
  countsTowardWip,
  detectLaborCodeHealthFlags,
  displayLaborCode,
  isUnassignedLaborCode,
  isUnmappedLaborCode,
  resolveLaborCodeMapping,
} from './labor-code-mapping.compute';
import { LaborCodeMapping } from '../models/labor-code-mapping.types';
import { ProjectLaborActual } from '../models/labor-actual.types';

describe('labor-code-mapping.compute', () => {
  const mappings: LaborCodeMapping[] = [
    {
      id: '1',
      laborCode: '510',
      category: 'Journeyman',
      bonusEligible: true,
      certifiedPayrollEligible: true,
      wipEligible: true,
      excludeFromForemanBonus: false,
      excludeFromAudit: false,
      active: true,
    },
    {
      id: '2',
      laborCode: 'PTO',
      category: 'PTO',
      bonusEligible: false,
      certifiedPayrollEligible: false,
      wipEligible: false,
      excludeFromForemanBonus: true,
      excludeFromAudit: true,
      active: true,
    },
    {
      id: '3',
      laborCode: '998',
      category: 'Admin',
      bonusEligible: false,
      certifiedPayrollEligible: false,
      wipEligible: false,
      excludeFromForemanBonus: true,
      excludeFromAudit: true,
      active: true,
    },
  ];

  it('flags unassigned labor codes', () => {
    expect(isUnassignedLaborCode('')).toBe(true);
    expect(displayLaborCode('')).toBe('— Unassigned');
    expect(isUnmappedLaborCode('', mappings)).toBe(true);
  });

  it('excludes PTO and admin from WIP and bonus', () => {
    const pto = resolveLaborCodeMapping('PTO', mappings);
    const admin = resolveLaborCodeMapping('998', mappings);
    const journeyman = resolveLaborCodeMapping('510', mappings);
    expect(countsTowardWip(pto)).toBe(false);
    expect(countsTowardBonus(pto)).toBe(false);
    expect(countsTowardWip(admin)).toBe(false);
    expect(countsTowardBonus(admin)).toBe(false);
    expect(countsTowardWip(journeyman)).toBe(true);
    expect(countsTowardBonus(journeyman)).toBe(true);
  });

  it('calculates bonus-eligible labor cost from wages + fringe only', () => {
    const actuals: ProjectLaborActual[] = [
      {
        id: 'a1',
        projectId: 'p1',
        workDate: '2025-01-01',
        weekStart: '2025-01-01',
        weekEnd: '2025-01-07',
        laborCode: '510',
        regularHours: 8,
        overtimeHours: 0,
        doubleTimeHours: 0,
        totalHours: 8,
        baseRate: 50,
        fringeRate: 10,
        totalLaborCost: 480,
        approvalStatus: 'Approved',
        source: 'TimeLog',
      },
      {
        id: 'a2',
        projectId: 'p1',
        workDate: '2025-01-01',
        weekStart: '2025-01-01',
        weekEnd: '2025-01-07',
        laborCode: 'PTO',
        regularHours: 8,
        overtimeHours: 0,
        doubleTimeHours: 0,
        totalHours: 8,
        baseRate: 50,
        fringeRate: 10,
        totalLaborCost: 480,
        approvalStatus: 'Approved',
        source: 'TimeLog',
      },
    ];
    const result = bonusEligibleLaborCost('p1', actuals, mappings);
    expect(result.wages).toBe(400);
    expect(result.fringe).toBe(80);
    expect(result.total).toBe(480);
  });

  it('does not flag office/admin labor for union or CPR exceptions', () => {
    const flags = detectLaborCodeHealthFlags({
      entries: [{
        id: 'e1',
        projectId: 'p1',
        laborCode: 'Office',
        employeeName: 'Admin User',
        jobIdLabel: '204',
      } as never],
      mappings: [],
      projects: [{
        id: 'p1',
        projectNumber: '204',
        projectName: 'Test',
        customer: 'Cust',
        status: 'Active',
        prevailingWage: true,
        certifiedPayrollRequired: true,
      }],
    });
    expect(flags).toHaveLength(0);
  });

  it('excludes office/admin from bonus totals', () => {
    expect(countsTowardBonus(undefined, 'Office')).toBe(false);
    expect(countsTowardBonus(mappings[2], '998')).toBe(false);
  });
});
