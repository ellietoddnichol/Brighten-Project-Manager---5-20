import {
  commercialCarpenterFringeApplies,
  computeJobPayrollNumber,
  getEmployeeCprOverride,
  normalizeOccupationLabel,
  workWeekDatesSunThroughSat,
} from './cpr-form.util';

describe('cpr-form.util', () => {
  describe('normalizeOccupationLabel', () => {
    it('maps foreman to journeyman carpenter', () => {
      expect(normalizeOccupationLabel('Foreman')).toBe('Journeyman Carpenter');
    });

    it('maps apprentice percentages', () => {
      expect(normalizeOccupationLabel('Apprentice 90%')).toBe('Apprentice – 90%');
    });

    it('applies employee overrides via getEmployeeCprOverride', () => {
      const override = getEmployeeCprOverride('Max Albright');
      expect(override?.displayName).toBe('Maxy Albright');
      expect(override?.occupation).toBe('Summer Intern');
      expect(override?.carpenterFringeApplies).toBe(false);
    });
  });

  describe('commercialCarpenterFringeApplies', () => {
    it('returns true for journeyman carpenter', () => {
      expect(commercialCarpenterFringeApplies('Journeyman Carpenter')).toBe(true);
    });

    it('returns false for laborer and intern', () => {
      expect(commercialCarpenterFringeApplies('Laborer')).toBe(false);
      expect(commercialCarpenterFringeApplies('Summer Intern')).toBe(false);
    });
  });

  describe('workWeekDatesSunThroughSat', () => {
    it('returns seven dates Sunday through Saturday', () => {
      const { dates, weekEndingLabel } = workWeekDatesSunThroughSat('2026-06-07');
      expect(dates).toHaveLength(7);
      expect(new Date(`${dates[0]}T12:00:00`).getDay()).toBe(0);
      expect(new Date(`${dates[6]}T12:00:00`).getDay()).toBe(6);
      expect(weekEndingLabel).toBe(dates[6]);
    });
  });

  describe('computeJobPayrollNumber', () => {
    it('returns 01 for the first job week and increments', () => {
      const weeks = ['2026-06-07', '2026-06-14', '2026-06-21'];
      expect(computeJobPayrollNumber(weeks, '2026-06-07', weeks[0])).toBe('01');
      expect(computeJobPayrollNumber(weeks, '2026-06-14', weeks[0])).toBe('02');
      expect(computeJobPayrollNumber(weeks, '2026-06-21', weeks[0])).toBe('03');
    });
  });
});
