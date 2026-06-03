import { describe, expect, it } from 'vitest';
import {
  defaultOfficeAdminMapping,
  isOfficeAdminLaborCode,
  isOfficeAdminLaborMapping,
  suppressLaborExceptionsForOfficeAdmin,
} from '@features/labor/utils/office-admin-labor';
import { LaborCodeMapping } from '@app/models/labor-code-mapping.types';

describe('office-admin-labor', () => {
  it('recognizes common office/admin labor codes', () => {
    expect(isOfficeAdminLaborCode('Office')).toBe(true);
    expect(isOfficeAdminLaborCode('PM')).toBe(true);
    expect(isOfficeAdminLaborCode('998')).toBe(true);
    expect(isOfficeAdminLaborCode('510')).toBe(false);
  });

  it('maps admin category as office/admin labor', () => {
    const mapping: LaborCodeMapping = {
      id: '1',
      laborCode: '998',
      category: 'Admin',
      bonusEligible: false,
      certifiedPayrollEligible: false,
      wipEligible: false,
      excludeFromForemanBonus: true,
      excludeFromAudit: true,
      active: true,
    };
    expect(isOfficeAdminLaborMapping('998', mapping)).toBe(true);
    expect(suppressLaborExceptionsForOfficeAdmin('998', mapping)).toBe(true);
  });

  it('defaults office/admin mapping flags', () => {
    const draft = defaultOfficeAdminMapping('Office/Admin');
    expect(draft.category).toBe('Admin');
    expect(draft.bonusEligible).toBe(false);
    expect(draft.certifiedPayrollEligible).toBe(false);
    expect(draft.excludeFromForemanBonus).toBe(true);
    expect(draft.excludeFromAudit).toBe(true);
  });
});
