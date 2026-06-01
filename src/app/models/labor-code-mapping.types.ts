export type LaborCodeCategory =
  | 'SelfPerformedLabor'
  | 'Foreman'
  | 'Apprentice'
  | 'Journeyman'
  | 'Operator'
  | 'Admin'
  | 'PTO'
  | 'NonBillable'
  | 'Other';

export type LaborCodeFilter =
  | 'all'
  | 'wipEligible'
  | 'bonusEligible'
  | 'certifiedPayrollEligible'
  | 'excluded'
  | 'unassigned';

export interface LaborCodeMapping {
  id: string;
  laborCode: string;
  displayName?: string;
  description?: string;
  category: LaborCodeCategory;
  workCompCategory?: string;
  certifiedPayrollClassification?: string;
  defaultCostCode?: string;
  bonusEligible: boolean;
  certifiedPayrollEligible: boolean;
  wipEligible: boolean;
  excludeFromForemanBonus: boolean;
  excludeFromAudit: boolean;
  active: boolean;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  ownerId?: string;
}

export const UNASSIGNED_LABOR_CODE_LABEL = '— Unassigned';

export const LABOR_CODE_CATEGORY_LABELS: Record<LaborCodeCategory, string> = {
  SelfPerformedLabor: 'Self-Performed Labor',
  Foreman: 'Foreman',
  Apprentice: 'Apprentice',
  Journeyman: 'Journeyman',
  Operator: 'Operator',
  Admin: 'Admin',
  PTO: 'PTO',
  NonBillable: 'Non-Billable',
  Other: 'Other',
};
