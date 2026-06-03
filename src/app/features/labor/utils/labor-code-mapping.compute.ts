import { ProjectLaborActual } from '@app/models/labor-actual.types';
import {
  LABOR_CODE_CATEGORY_LABELS,
  LaborCodeCategory,
  LaborCodeFilter,
  LaborCodeMapping,
  UNASSIGNED_LABOR_CODE_LABEL,
} from '@app/models/labor-code-mapping.types';
import { NormalizedLaborEntry } from '@app/models/labor.types';
import { Project } from '@app/models/types';
import { wagesAndFringeFromActuals } from '@features/labor/utils/foreman-bonus.compute';
import {
  defaultOfficeAdminMapping,
  isOfficeAdminLaborCode,
  isOfficeAdminLaborMapping,
  suppressLaborExceptionsForOfficeAdmin,
} from '@features/labor/utils/office-admin-labor';

const EXCLUDED_WIP_CATEGORIES = new Set<LaborCodeCategory>(['PTO', 'Admin', 'NonBillable']);

export function normalizeLaborCodeKey(code?: string): string {
  return (code ?? '').trim().toLowerCase();
}

export function displayLaborCode(code?: string): string {
  const trimmed = (code ?? '').trim();
  return trimmed || UNASSIGNED_LABOR_CODE_LABEL;
}

export function isUnassignedLaborCode(code?: string): boolean {
  return !normalizeLaborCodeKey(code);
}

export function resolveLaborCodeMapping(
  code: string | undefined,
  mappings: LaborCodeMapping[],
): LaborCodeMapping | undefined {
  if (isUnassignedLaborCode(code)) return undefined;
  const key = normalizeLaborCodeKey(code);
  return mappings.find(m => normalizeLaborCodeKey(m.laborCode) === key && m.active !== false);
}

export function isUnmappedLaborCode(code: string | undefined, mappings: LaborCodeMapping[]): boolean {
  if (isUnassignedLaborCode(code)) return true;
  return !resolveLaborCodeMapping(code, mappings);
}

export function countsTowardWip(mapping?: LaborCodeMapping): boolean {
  if (!mapping || !mapping.active) return false;
  if (mapping.wipEligible === false) return false;
  if (EXCLUDED_WIP_CATEGORIES.has(mapping.category)) return false;
  return true;
}

export function countsTowardBonus(mapping?: LaborCodeMapping, laborCode?: string): boolean {
  if (isOfficeAdminLaborMapping(laborCode, mapping)) return false;
  if (!mapping || !mapping.active) return false;
  if (!mapping.bonusEligible || mapping.excludeFromForemanBonus) return false;
  if (EXCLUDED_WIP_CATEGORIES.has(mapping.category)) return false;
  return true;
}

export function countsTowardCertifiedPayroll(mapping?: LaborCodeMapping): boolean {
  if (!mapping || !mapping.active) return false;
  return mapping.certifiedPayrollEligible === true;
}

export function countsTowardWorkCompAudit(mapping?: LaborCodeMapping, laborCode?: string): boolean {
  if (isOfficeAdminLaborMapping(laborCode, mapping)) return false;
  if (!mapping || !mapping.active) return false;
  if (mapping.excludeFromAudit) return false;
  if (EXCLUDED_WIP_CATEGORIES.has(mapping.category)) return false;
  return true;
}

export function isExcludedLaborMapping(mapping?: LaborCodeMapping): boolean {
  if (!mapping) return true;
  return !mapping.active
    || EXCLUDED_WIP_CATEGORIES.has(mapping.category)
    || mapping.wipEligible === false
    || mapping.excludeFromForemanBonus
    || mapping.excludeFromAudit;
}

export function effectiveClassification(
  entry: { classification?: string; laborCode?: string },
  mapping?: LaborCodeMapping,
): string | undefined {
  if (entry.classification?.trim()) return entry.classification.trim();
  return mapping?.certifiedPayrollClassification?.trim() || undefined;
}

export function filterLaborCodeRows<T extends { laborCode?: string }>(
  rows: T[],
  filter: LaborCodeFilter,
  mappings: LaborCodeMapping[],
): T[] {
  if (filter === 'all') return rows;
  return rows.filter(row => {
    const code = displayLaborCode(row.laborCode);
    const mapping = resolveLaborCodeMapping(row.laborCode, mappings);
    switch (filter) {
      case 'unassigned':
        return isUnassignedLaborCode(row.laborCode) || isUnmappedLaborCode(row.laborCode, mappings);
      case 'wipEligible':
        return countsTowardWip(mapping);
      case 'bonusEligible':
        return countsTowardBonus(mapping);
      case 'certifiedPayrollEligible':
        return countsTowardCertifiedPayroll(mapping);
      case 'excluded':
        return isExcludedLaborMapping(mapping);
      default:
        return true;
    }
  });
}

export interface EnrichedLaborCodeHoursRow {
  laborCode: string;
  displayName?: string;
  category?: LaborCodeCategory;
  categoryLabel?: string;
  workCompCategory?: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  totalCost: number;
  wageCost: number;
  fringeCost: number;
  rowCount: number;
  unassigned: boolean;
  unmapped: boolean;
  wipEligible: boolean;
  bonusEligible: boolean;
  certifiedPayrollEligible: boolean;
  excluded: boolean;
}

export interface LaborCodeHealthFlag {
  id: string;
  type:
    | 'unmapped-labor-code'
    | 'unassigned-labor-code'
    | 'certified-payroll-missing-classification'
    | 'foreman-bonus-unmapped-labor';
  severity: 'warning' | 'error';
  title: string;
  description: string;
  projectId?: string;
  projectName?: string;
  laborCode?: string;
}

export interface WorkCompAuditRow {
  employeeName?: string;
  projectId?: string;
  projectName?: string;
  jobNumber?: string;
  laborCode: string;
  workCompCategory: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  wages: number;
  fringe: number;
  totalCost: number;
}

export function bonusEligibleLaborActuals(
  actuals: ProjectLaborActual[],
  mappings: LaborCodeMapping[],
): ProjectLaborActual[] {
  return actuals.filter(actual =>
    actual.approvalStatus === 'Approved'
    && countsTowardBonus(resolveLaborCodeMapping(actual.laborCode, mappings), actual.laborCode),
  );
}

export function wipEligibleLaborActuals(
  actuals: ProjectLaborActual[],
  mappings: LaborCodeMapping[],
): ProjectLaborActual[] {
  return actuals.filter(actual =>
    actual.approvalStatus === 'Approved'
    && countsTowardWip(resolveLaborCodeMapping(actual.laborCode, mappings)),
  );
}

export function bonusEligibleLaborCost(
  projectId: string,
  actuals: ProjectLaborActual[],
  mappings: LaborCodeMapping[],
): { wages: number; fringe: number; total: number } {
  const eligible = bonusEligibleLaborActuals(
    actuals.filter(a => a.projectId === projectId),
    mappings,
  );
  const { wages, fringe } = wagesAndFringeFromActuals(eligible);
  return { wages, fringe, total: wages + fringe };
}

export function buildWorkCompAuditRows(
  actuals: ProjectLaborActual[],
  mappings: LaborCodeMapping[],
): WorkCompAuditRow[] {
  return actuals
    .filter(a => a.approvalStatus === 'Approved')
    .filter(a => countsTowardWorkCompAudit(resolveLaborCodeMapping(a.laborCode, mappings), a.laborCode))
    .map(actual => {
      const mapping = resolveLaborCodeMapping(actual.laborCode, mappings);
      const wages = (actual.regularHours ?? 0) * (actual.baseRate ?? 0)
        + (actual.overtimeHours ?? 0) * (actual.baseRate ?? 0) * 1.5
        + (actual.doubleTimeHours ?? 0) * (actual.baseRate ?? 0) * 2;
      const fringe = (actual.totalHours ?? 0) * (actual.fringeRate ?? 0);
      const totalCost = actual.totalLaborCost ?? wages + fringe;
      return {
        employeeName: actual.employeeName,
        projectId: actual.projectId,
        projectName: actual.projectName,
        jobNumber: actual.jobNumber,
        laborCode: displayLaborCode(actual.laborCode),
        workCompCategory: mapping?.workCompCategory ?? 'Unmapped',
        regularHours: actual.regularHours ?? 0,
        overtimeHours: actual.overtimeHours ?? 0,
        doubleTimeHours: actual.doubleTimeHours ?? 0,
        totalHours: actual.totalHours ?? 0,
        wages,
        fringe,
        totalCost,
      };
    });
}

export function detectLaborCodeHealthFlags(input: {
  entries?: NormalizedLaborEntry[];
  actuals?: ProjectLaborActual[];
  mappings: LaborCodeMapping[];
  projects?: Project[];
  bonusProjectIds?: string[];
}): LaborCodeHealthFlag[] {
  const flags: LaborCodeHealthFlag[] = [];
  const seen = new Set<string>();
  const projects = input.projects ?? [];
  const entries = input.entries ?? [];
  const actuals = input.actuals ?? [];

  const push = (flag: LaborCodeHealthFlag) => {
    if (seen.has(flag.id)) return;
    seen.add(flag.id);
    flags.push(flag);
  };

  for (const entry of entries) {
    const code = displayLaborCode(entry.laborCode);
    const mapping = resolveLaborCodeMapping(entry.laborCode, input.mappings);
    if (suppressLaborExceptionsForOfficeAdmin(entry.laborCode, mapping)) continue;

    const project = projects.find(p => p.id === entry.projectId);
    if (isUnassignedLaborCode(entry.laborCode)) {
      push({
        id: `labor-unassigned-${entry.id}`,
        type: 'unassigned-labor-code',
        severity: 'warning',
        title: 'Unassigned labor code on approved time',
        description: `${entry.employeeName ?? 'Employee'} · ${entry.jobIdLabel ?? 'Job'} has no labor code.`,
        projectId: entry.projectId,
        projectName: entry.projectName ?? project?.projectName,
        laborCode: code,
      });
    } else if (isUnmappedLaborCode(entry.laborCode, input.mappings)) {
      push({
        id: `labor-unmapped-${normalizeLaborCodeKey(entry.laborCode)}`,
        type: 'unmapped-labor-code',
        severity: 'warning',
        title: `Unmapped labor code ${code}`,
        description: `Labor code ${code} is not mapped in Settings > Labor Codes.`,
        laborCode: code,
      });
    }

    if (project?.prevailingWage && isUnmappedLaborCode(entry.laborCode, input.mappings)) {
      push({
        id: `cpr-unmapped-${entry.id}`,
        type: 'certified-payroll-missing-classification',
        severity: 'error',
        title: 'Prevailing wage job has unmapped labor code',
        description: `${project.projectName}: labor code ${code} needs mapping for certified payroll.`,
        projectId: project.id,
        projectName: project.projectName,
        laborCode: code,
      });
    }

    if (countsTowardCertifiedPayroll(mapping) && !effectiveClassification(entry, mapping)) {
      push({
        id: `cpr-class-${entry.id}`,
        type: 'certified-payroll-missing-classification',
        severity: 'error',
        title: 'Certified payroll labor missing classification',
        description: `${entry.employeeName ?? 'Employee'} · ${code} requires classification mapping.`,
        projectId: entry.projectId,
        projectName: entry.projectName ?? project?.projectName,
        laborCode: code,
      });
    }
  }

  for (const projectId of input.bonusProjectIds ?? []) {
    const project = projects.find(p => p.id === projectId);
    const projectActuals = actuals.filter(a => a.projectId === projectId && a.approvalStatus === 'Approved');
    const hasUnmapped = projectActuals.some(a => {
      if (suppressLaborExceptionsForOfficeAdmin(a.laborCode, resolveLaborCodeMapping(a.laborCode, input.mappings))) {
        return false;
      }
      return isUnmappedLaborCode(a.laborCode, input.mappings);
    });
    if (hasUnmapped) {
      push({
        id: `bonus-labor-unmapped-${projectId}`,
        type: 'foreman-bonus-unmapped-labor',
        severity: 'warning',
        title: 'Review labor codes for foreman bonus',
        description: `${project?.projectName ?? 'Project'} has bonus records with unmapped labor codes.`,
        projectId,
        projectName: project?.projectName,
      });
    }
  }

  return flags;
}

export function enrichLaborCodeHoursRow(
  laborCode: string,
  row: {
    regularHours: number;
    overtimeHours: number;
    doubleTimeHours: number;
    totalHours: number;
    totalCost: number;
    rowCount: number;
  },
  mappings: LaborCodeMapping[],
  wageCost = 0,
  fringeCost = 0,
): EnrichedLaborCodeHoursRow {
  const rawCode = laborCode === UNASSIGNED_LABOR_CODE_LABEL ? '' : laborCode;
  const mapping = resolveLaborCodeMapping(rawCode, mappings);
  const unassigned = isUnassignedLaborCode(rawCode);
  const unmapped = isUnmappedLaborCode(rawCode, mappings);
  return {
    laborCode,
    displayName: mapping?.displayName,
    category: mapping?.category,
    categoryLabel: mapping ? LABOR_CODE_CATEGORY_LABELS[mapping.category] : undefined,
    workCompCategory: mapping?.workCompCategory,
    regularHours: row.regularHours,
    overtimeHours: row.overtimeHours,
    doubleTimeHours: row.doubleTimeHours,
    totalHours: row.totalHours,
    totalCost: row.totalCost,
    wageCost,
    fringeCost,
    rowCount: row.rowCount,
    unassigned,
    unmapped,
    wipEligible: countsTowardWip(mapping),
    bonusEligible: countsTowardBonus(mapping, rawCode),
    certifiedPayrollEligible: countsTowardCertifiedPayroll(mapping),
    excluded: isExcludedLaborMapping(mapping),
  };
}

export function defaultMappingDraft(laborCode: string): Partial<LaborCodeMapping> {
  if (isOfficeAdminLaborCode(laborCode)) return defaultOfficeAdminMapping(laborCode);
  return {
    laborCode,
    displayName: laborCode,
    category: 'SelfPerformedLabor',
    workCompCategory: 'General',
    bonusEligible: true,
    certifiedPayrollEligible: true,
    wipEligible: true,
    excludeFromForemanBonus: false,
    excludeFromAudit: false,
    active: true,
  };
}
