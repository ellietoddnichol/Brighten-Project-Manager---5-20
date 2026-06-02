import { describe, expect, it } from 'vitest';
import {
  billingReleasePercent,
  computeForemanBonusAmounts,
  detectForemanBonusFlags,
  preserveHistoricalRecord,
  roundCurrency,
  wagesAndFringeFromActuals,
} from './foreman-bonus.compute';
import {
  DEFAULT_FOREMAN_BONUS_POLICY,
  dustinJob163,
  kyleJob155,
} from './foreman-bonus.fixtures';
import { ProjectLaborActual } from '../models/labor-actual.types';

describe('foreman-bonus.compute', () => {
  it('uses wages + fringe for actual labor cost', () => {
    const actuals: ProjectLaborActual[] = [{
      id: '1',
      projectId: 'p1',
      workDate: '2025-01-01',
      weekStart: '2025-01-01',
      weekEnd: '2025-01-07',
      regularHours: 40,
      overtimeHours: 0,
      doubleTimeHours: 0,
      totalHours: 40,
      baseRate: 50,
      fringeRate: 10,
      totalLaborCost: 2400,
      approvalStatus: 'Approved',
      source: 'TimeLog',
    }];
    const { wages, fringe } = wagesAndFringeFromActuals(actuals);
    expect(wages).toBe(2000);
    expect(fringe).toBe(400);
  });

  it('applies default 10% bonus rate with work progress cap', () => {
    const result = computeForemanBonusAmounts({
      laborBudget: 100000,
      percentComplete: 0.8,
      actualLaborCost: 70000,
      bonusRate: 0.10,
      foremanSharePercent: 1,
      billingReleasePercent: 1,
      previouslyPaid: 0,
    });
    expect(result.currentLaborBudget).toBe(80000);
    expect(result.laborSavings).toBe(10000);
    expect(result.grossBonusEarned).toBe(1000);
    expect(result.foremanShareBonus).toBe(1000);
    expect(result.bonusAvailableToReceive).toBe(1000);
    expect(result.payThisTerm).toBe(1000);
    expect(result.remainingPotential).toBe(0);
  });

  it('caps payable bonus by billing release percent', () => {
    const result = computeForemanBonusAmounts({
      laborBudget: 100000,
      percentComplete: 1,
      actualLaborCost: 80000,
      bonusRate: 0.10,
      foremanSharePercent: 1,
      billingReleasePercent: 0.8,
      previouslyPaid: 0,
    });
    expect(result.foremanShareBonus).toBe(2000);
    expect(result.bonusAvailableToReceive).toBe(1600);
    expect(result.remainingPotential).toBe(400);
  });

  it('supports special bonus rates like 15% and 20%', () => {
    const fifteen = computeForemanBonusAmounts({
      laborBudget: 100000,
      percentComplete: 1,
      actualLaborCost: 90000,
      bonusRate: 0.15,
      foremanSharePercent: 1,
      billingReleasePercent: 1,
    });
    expect(fifteen.grossBonusEarned).toBe(1500);

    const twenty = computeForemanBonusAmounts({
      laborBudget: 100000,
      percentComplete: 1,
      actualLaborCost: 90000,
      bonusRate: 0.20,
      foremanSharePercent: 1,
      billingReleasePercent: 1,
    });
    expect(twenty.grossBonusEarned).toBe(2000);
  });

  it('supports split foreman share', () => {
    const result = computeForemanBonusAmounts({
      laborBudget: 116431,
      percentComplete: 1,
      actualLaborCost: 96846.44,
      bonusRate: 0.10,
      foremanSharePercent: 0.5,
      billingReleasePercent: 1,
      previouslyPaid: 979.23,
    });
    expect(result.foremanShareBonus).toBe(979.23);
    expect(result.payThisTerm).toBe(0);
  });

  it('does not pay bonus when labor savings is negative', () => {
    const result = computeForemanBonusAmounts({
      laborBudget: 50000,
      percentComplete: 1,
      actualLaborCost: 60000,
      bonusRate: 0.10,
      foremanSharePercent: 1,
      billingReleasePercent: 1,
    });
    expect(result.laborSavings).toBe(-10000);
    expect(result.grossBonusEarned).toBe(0);
    expect(result.foremanShareBonus).toBe(0);
  });

  it('computes pay this term and remaining potential with retention', () => {
    const result = computeForemanBonusAmounts({
      laborBudget: 85291,
      percentComplete: 1,
      actualLaborCost: 75900.12,
      bonusRate: 0.10,
      foremanSharePercent: 1,
      billingReleasePercent: 0.95,
      previouslyPaid: 684.96,
    });
    expect(result.payThisTerm).toBeCloseTo(207.17, 1);
    expect(result.remainingPotential).toBeCloseTo(46.95, 1);
  });

  it('flags negative pay this term on historical imports', () => {
    const assignments = [{
      id: 'a1',
      projectId: 'seed-job-155',
      foremanName: 'Kyle Patterson',
      role: 'Primary' as const,
      sharePercent: 1,
      bonusEligible: true,
    }];
    const record = preserveHistoricalRecord(kyleJob155, DEFAULT_FOREMAN_BONUS_POLICY, assignments);
    const flags = detectForemanBonusFlags(record, assignments, DEFAULT_FOREMAN_BONUS_POLICY);
    expect(record.payThisTerm).toBe(-82.20);
    expect(flags).toContain('negativePayThisTerm');
    expect(record.status).toBe('NeedsReview');
  });

  it('preserves historical LPS Heritage 15% record values', () => {
    const record = preserveHistoricalRecord(dustinJob163, DEFAULT_FOREMAN_BONUS_POLICY, []);
    expect(record.bonusRate).toBe(0.15);
    expect(record.payThisTerm).toBe(2920.92);
    expect(record.remainingPotential).toBe(2737.59);
  });

  it('derives billing release percent from billed to date', () => {
    expect(billingReleasePercent(80000, 100000)).toBe(0.8);
    expect(billingReleasePercent(120000, 100000)).toBe(1);
  });
});
