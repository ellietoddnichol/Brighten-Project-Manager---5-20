import { describe, expect, it } from 'vitest';
import {
  adpPayPeriodMatchesWeek,
  deriveWorkWeekFromPayDate,
  normalizeWeekEndingToSaturday,
  shouldShowCertifiedPayroll,
  weekEndingSaturday,
  weekEndingSunday,
  weekStartSundayFromEnding,
  workWeekDatesSunThroughSat,
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
  it('returns the same Saturday for every day in the same Sun–Sat week', () => {
    const expected = '2025-06-14';
    expect(weekEndingSaturday('2025-06-08')).toBe(expected);
    expect(weekEndingSaturday('2025-06-09')).toBe(expected);
    expect(weekEndingSaturday('2025-06-10')).toBe(expected);
    expect(weekEndingSaturday('2025-06-11')).toBe(expected);
    expect(weekEndingSaturday('2025-06-12')).toBe(expected);
    expect(weekEndingSaturday('2025-06-13')).toBe(expected);
    expect(weekEndingSaturday('2025-06-14')).toBe(expected);
  });

  it('rolls to the next Saturday for a Sunday work date', () => {
    expect(weekEndingSaturday('2025-06-15')).toBe('2025-06-21');
  });

  it('handles month and year boundaries', () => {
    expect(weekEndingSaturday('2024-12-31')).toBe('2025-01-04');
    expect(weekEndingSaturday('2025-01-01')).toBe('2025-01-04');
  });

  it('accepts a Date object', () => {
    expect(weekEndingSaturday(new Date('2025-06-11T00:00:00Z'))).toBe('2025-06-14');
  });

  it('aliases weekEndingSunday to the same Saturday week key', () => {
    expect(weekEndingSunday('2025-06-11')).toBe('2025-06-14');
    expect(weekEndingSunday('2025-06-09')).toBe(weekEndingSaturday('2025-06-09'));
  });
});

describe('normalizeWeekEndingToSaturday', () => {
  it('maps legacy Sunday week keys to the prior Saturday', () => {
    expect(normalizeWeekEndingToSaturday('2025-06-15')).toBe('2025-06-14');
    expect(normalizeWeekEndingToSaturday('2025-06-14')).toBe('2025-06-14');
  });
});

describe('workWeekDatesSunThroughSat', () => {
  it('returns seven dates Sunday through Saturday', () => {
    const dates = workWeekDatesSunThroughSat('2025-06-14');
    expect(dates).toEqual([
      '2025-06-08',
      '2025-06-09',
      '2025-06-10',
      '2025-06-11',
      '2025-06-12',
      '2025-06-13',
      '2025-06-14',
    ]);
    expect(new Date(`${dates[0]}T12:00:00`).getDay()).toBe(0);
    expect(new Date(`${dates[6]}T12:00:00`).getDay()).toBe(6);
  });

  it('normalizes legacy Sunday endings before building dates', () => {
    expect(workWeekDatesSunThroughSat('2025-06-15')).toEqual(workWeekDatesSunThroughSat('2025-06-14'));
  });
});

describe('weekStartSundayFromEnding', () => {
  it('returns the Sunday six days before Saturday week end', () => {
    expect(weekStartSundayFromEnding('2025-06-14')).toBe('2025-06-08');
  });
});

describe('deriveWorkWeekFromPayDate', () => {
  it('derives Sun–Sat work week from a Friday ADP check date', () => {
    const week = deriveWorkWeekFromPayDate('2025-06-13');
    expect(week.weekEnding).toBe('2025-06-07');
    expect(week.weekStart).toBe('2025-06-01');
    expect(week.weekDates[0]).toBe('2025-06-01');
    expect(week.weekDates[6]).toBe('2025-06-07');
    expect(week.payDate).toBe('2025-06-13');
  });
});

describe('adpPayPeriodMatchesWeek', () => {
  it('matches ADP period ending to CPR week using Saturday normalization', () => {
    expect(adpPayPeriodMatchesWeek('2025-06-14', '2025-06-14')).toBe(true);
    expect(adpPayPeriodMatchesWeek('2025-06-15', '2025-06-14')).toBe(true);
    expect(adpPayPeriodMatchesWeek('2025-06-07', '2025-06-13')).toBe(false);
  });
});
