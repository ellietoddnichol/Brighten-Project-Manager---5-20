import { describe, expect, it } from 'vitest';
import { shouldShowCertifiedPayroll } from './certified-payroll-week';

describe('certified-payroll-week visibility', () => {
  it('hides CPR tools while certified payroll is disabled in the UI', () => {
    expect(shouldShowCertifiedPayroll({ prevailingWage: true })).toBe(false);
    expect(shouldShowCertifiedPayroll({ certifiedPayrollRequired: true })).toBe(false);
    expect(shouldShowCertifiedPayroll({ hasCPRRecords: true })).toBe(false);
    expect(shouldShowCertifiedPayroll({ showAllTools: true })).toBe(false);
  });
});
