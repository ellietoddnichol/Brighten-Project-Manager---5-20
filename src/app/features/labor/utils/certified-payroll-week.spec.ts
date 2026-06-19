import { describe, expect, it } from 'vitest';
import {
  shouldShowCertifiedPayroll,
  weekEndingSaturday,
  weekEndingSunday,
} from '@features/labor/utils/certified-payroll-week';

describe('certified-payroll-week visibility', () => {
  it('shows CPR when prevailing wage, CPR required, records exist, or show all tools', () => {
    expect(shouldShowCertifiedPayroll({ prevailingWage: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ certifiedPayrollRequired: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ hasCPRRecords: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ showAllTools: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({})).toBe(false);
  });
});

describe('weekEndingSaturday', () => {
  // Week of 2025-06-08 (Sun) – 2025-06-14 (Sat)
  it('returns the same Saturday for every day in the same week', () => {
    const expected = '2025-06-14';
    expect(weekEndingSaturday('2025-06-08')).toBe(expected); // Sunday
    expect(weekEndingSaturday('2025-06-09')).toBe(expected); // Monday
    expect(weekEndingSaturday('2025-06-10')).toBe(expected); // Tuesday
    expect(weekEndingSaturday('2025-06-11')).toBe(expected); // Wednesday
    expect(weekEndingSaturday('2025-06-12')).toBe(expected); // Thursday
    expect(weekEndingSaturday('2025-06-13')).toBe(expected); // Friday
    expect(weekEndingSaturday('2025-06-14')).toBe(expected); // Saturday — stays same day
  });

  it('rolls to the next Saturday for a Sunday', () => {
    // 2025-06-15 is a Sunday → week ends 2025-06-21
    expect(weekEndingSaturday('2025-06-15')).toBe('2025-06-21');
  });

  it('handles month and year boundaries', () => {
    // 2024-12-31 is a Tuesday → week ends 2025-01-04 (Sat)
    expect(weekEndingSaturday('2024-12-31')).toBe('2025-01-04');
    // 2025-01-01 is a Wednesday → same week ending
    expect(weekEndingSaturday('2025-01-01')).toBe('2025-01-04');
  });

  it('accepts a Date object', () => {
    const d = new Date('2025-06-11T00:00:00Z');
    expect(weekEndingSaturday(d)).toBe('2025-06-14');
  });

  it('is different from weekEndingSunday for a mid-week date', () => {
    // Wednesday 2025-06-11:
    //   weekEndingSaturday → 2025-06-14 (same week)
    //   weekEndingSunday   → 2025-06-15 (next Sunday — one day later)
    expect(weekEndingSaturday('2025-06-11')).toBe('2025-06-14');
    expect(weekEndingSunday('2025-06-11')).toBe('2025-06-15');
  });

  it('pay date 2025-06-14 (Sat) maps to ADP period ending 2025-06-14', () => {
    // Confirms ADP payPeriodEnding matches week-ending key used in Firestore
    expect(weekEndingSaturday('2025-06-14')).toBe('2025-06-14');
  });

  it('timelog Monday buckets into the correct Saturday week', () => {
    // Monday 2025-06-09 → week end 2025-06-14; NOT 2025-06-08 (Sunday)
    const weekEnd = weekEndingSaturday('2025-06-09');
    expect(weekEnd).toBe('2025-06-14');
    expect(weekEnd).not.toBe('2025-06-08');
  });
});
