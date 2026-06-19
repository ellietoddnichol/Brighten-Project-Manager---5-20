import { describe, expect, it } from 'vitest';
import { shouldShowCertifiedPayroll } from '@features/labor/utils/certified-payroll-week';

describe('certified-payroll-week visibility', () => {
  it('shows CPR when prevailing wage, CPR required, records exist, or show all tools', () => {
    expect(shouldShowCertifiedPayroll({ prevailingWage: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ certifiedPayrollRequired: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ hasCPRRecords: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({ showAllTools: true })).toBe(true);
    expect(shouldShowCertifiedPayroll({})).toBe(false);
  });
});
