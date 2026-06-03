import { LaborCodeMapping } from '@app/models/labor-code-mapping.types';
import { normalizeLaborCodeKey } from '@features/labor/utils/labor-code-mapping.compute';

/** Labor codes / labels treated as Office/Admin — non-union, non-CPR, no rate panic. */
export const OFFICE_ADMIN_LABOR_LABELS = [
  'office',
  'admin',
  'administrative',
  'project management',
  'pm',
  'estimating',
  'accounting',
  'payroll',
  'office/admin',
  'non job',
  'non-billable admin',
  'nonbillable admin',
  'overhead',
  '998',
  'pto',
] as const;

export function isOfficeAdminLaborCode(code?: string): boolean {
  const key = normalizeLaborCodeKey(code);
  if (!key) return false;
  if (key === '998' || key === 'pto') return true;
  return OFFICE_ADMIN_LABOR_LABELS.some(label => {
    const norm = label.replace(/\s+/g, '').toLowerCase();
    return key === norm || key.includes(norm) || norm.includes(key);
  });
}

export function isOfficeAdminLaborMapping(
  code: string | undefined,
  mapping?: LaborCodeMapping,
): boolean {
  if (mapping?.category === 'Admin' || mapping?.category === 'PTO' || mapping?.category === 'NonBillable') {
    return true;
  }
  if (mapping?.excludeFromForemanBonus && mapping?.excludeFromAudit && !mapping?.certifiedPayrollEligible) {
    return true;
  }
  return isOfficeAdminLaborCode(code ?? mapping?.laborCode);
}

/** Suppress union/rate/classification exceptions for office/admin labor. */
export function suppressLaborExceptionsForOfficeAdmin(
  code: string | undefined,
  mapping?: LaborCodeMapping,
): boolean {
  return isOfficeAdminLaborMapping(code, mapping);
}

export function defaultOfficeAdminMapping(laborCode: string): Partial<LaborCodeMapping> {
  return {
    laborCode,
    displayName: laborCode,
    category: 'Admin',
    workCompCategory: 'Clerical',
    bonusEligible: false,
    certifiedPayrollEligible: false,
    wipEligible: false,
    excludeFromForemanBonus: true,
    excludeFromAudit: true,
    active: true,
    notes: 'Office/Admin — excluded from bonus, CPR, WIP, and work comp audit',
  };
}
