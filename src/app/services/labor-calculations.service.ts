import { Injectable } from '@angular/core';
import {
  EmployeeRecord,
  LaborException,
  LaborExceptionType,
  LaborOverviewKpis,
  LaborTimeEntry,
  MonthlyLaborAccrual,
  NormalizedLaborEntry,
  QbLaborActual,
} from '../models/labor.types';
import { MatchedLaborRate } from './labor-rate.service';
import { Project } from '../models/types';
import { monthKeyFromDate, isNonUnionEmployee } from '../utils/labor-normalizers';
import { isOverheadJobLabel } from '../utils/project';
import {
  countsTowardCertifiedPayroll,
  effectiveClassification,
  isUnassignedLaborCode,
  isUnmappedLaborCode,
  resolveLaborCodeMapping,
} from '../utils/labor-code-mapping.compute';
import { suppressLaborExceptionsForOfficeAdmin } from '../utils/office-admin-labor';
import { LaborCodeMapping } from '../models/labor-code-mapping.types';

@Injectable({ providedIn: 'root' })
export class LaborCalculationsService {
  normalizeEntry(
    entry: LaborTimeEntry,
    rate: MatchedLaborRate,
    project?: Project,
  ): NormalizedLaborEntry {
    const totalHours = entry.regularHours + entry.overtimeHours + entry.doubleTimeHours;
    const baseRate = rate.baseRate ?? 0;
    const fringeRate = rate.fringeEligible ? (rate.fringeRate ?? 0) : 0;

    const regularWageCost = entry.regularHours * baseRate;
    const overtimeWageCost = entry.overtimeHours * baseRate * 1.5;
    const doubleTimeWageCost = entry.doubleTimeHours * baseRate * 2;
    const wageCost = regularWageCost + overtimeWageCost + doubleTimeWageCost;
    const fringeCost = totalHours * fringeRate;
    const estimatedLaborTotal = wageCost + fringeCost;

    return {
      ...entry,
      month: monthKeyFromDate(entry.workDate),
      totalHours,
      rateSource: rate.source,
      unionArea: rate.unionArea,
      baseRate: rate.baseRate,
      fringeRate: rate.fringeRate,
      totalPackage: rate.totalPackage,
      regularWageCost,
      overtimeWageCost,
      doubleTimeWageCost,
      wageCost,
      fringeCost,
      estimatedLaborTotal,
      projectId: project?.id,
      projectName: project?.projectName,
      rateMissing: rate.source === 'missing' || !rate.baseRate,
    };
  }

  buildMonthlyAccruals(
    entries: NormalizedLaborEntry[],
    qbActuals: QbLaborActual[],
  ): MonthlyLaborAccrual[] {
    const map = new Map<string, MonthlyLaborAccrual>();

    for (const entry of entries) {
      const key = [
        entry.month,
        entry.projectNumber ?? entry.jobIdLabel ?? 'unknown',
        normalizeKey(entry.employeeName),
        normalizeKey(entry.classification),
        normalizeKey(entry.laborCode),
      ].join('|');

      const existing = map.get(key);
      if (existing) {
        existing.regularHours += entry.regularHours;
        existing.overtimeHours += entry.overtimeHours;
        existing.doubleTimeHours += entry.doubleTimeHours;
        existing.totalHours += entry.totalHours;
        existing.wageCost += entry.wageCost;
        existing.fringeCost += entry.fringeCost;
        existing.estimatedLaborTotal += entry.estimatedLaborTotal;
        if (entry.rateMissing) existing.exceptions.push('missing-base-rate');
      } else {
        map.set(key, {
          id: key,
          month: entry.month,
          projectNo: entry.projectNumber ?? entry.jobIdLabel ?? '—',
          projectId: entry.projectId,
          projectName: entry.projectName,
          employeeName: entry.employeeName ?? '—',
          classification: entry.classification ?? '—',
          laborCode: entry.laborCode,
          regularHours: entry.regularHours,
          overtimeHours: entry.overtimeHours,
          doubleTimeHours: entry.doubleTimeHours,
          totalHours: entry.totalHours,
          baseRate: entry.baseRate,
          fringeRate: entry.fringeRate,
          wageCost: entry.wageCost,
          fringeCost: entry.fringeCost,
          estimatedLaborTotal: entry.estimatedLaborTotal,
          exceptions: entry.rateMissing ? ['missing-base-rate'] : [],
        });
      }
    }

    const accruals = [...map.values()];
    for (const accrual of accruals) {
      const qb = this.findQbActualForAccrual(accrual.projectNo, accrual.month, qbActuals);
      accrual.qbActualLaborCost = qb?.month === accrual.month ? qb.qbActualLaborCost : undefined;

      // Fall back to project-level QBO labor if no monthly row
      if (accrual.qbActualLaborCost == null) {
        const projectLevel = qbActuals.find(q =>
          (q.projectNo === accrual.projectNo.replace(/^J/i, '') || q.projectNo === accrual.projectNo)
          && !q.month,
        );
        if (projectLevel?.qbActualLaborCost != null && accruals.filter(a => a.projectNo === accrual.projectNo).length === 1) {
          accrual.qbActualLaborCost = projectLevel.qbActualLaborCost;
        }
      }
      if (accrual.qbActualLaborCost != null) {
        accrual.laborNotYetInQb = Math.max(0, accrual.estimatedLaborTotal - accrual.qbActualLaborCost);
      } else {
        accrual.laborNotYetInQb = accrual.estimatedLaborTotal;
        if (accrual.estimatedLaborTotal > 0) accrual.exceptions.push('approved-not-in-qbo');
      }
      accrual.exceptions = [...new Set(accrual.exceptions)];
    }

    return accruals.sort((a, b) => b.month.localeCompare(a.month) || a.projectNo.localeCompare(b.projectNo));
  }

  buildOverviewKpis(
    entries: NormalizedLaborEntry[],
    accruals: MonthlyLaborAccrual[],
    referenceMonth?: string,
  ): LaborOverviewKpis {
    const month = referenceMonth ?? currentMonthKey();
    const monthEntries = entries.filter(e => e.month === month);
    const monthAccruals = accruals.filter(a => a.month === month);

    return {
      approvedHoursThisMonth: monthEntries.reduce((s, e) => s + e.totalHours, 0),
      estimatedWageCost: monthEntries.reduce((s, e) => s + e.wageCost, 0),
      estimatedFringeCost: monthEntries.reduce((s, e) => s + e.fringeCost, 0),
      estimatedTotalLabor: monthEntries.reduce((s, e) => s + e.estimatedLaborTotal, 0),
      laborNotYetInQbo: monthAccruals.reduce((s, a) => s + (a.laborNotYetInQb ?? 0), 0),
      missingRates: monthEntries.filter(e => e.rateMissing).length,
    };
  }

  detectExceptions(
    entries: NormalizedLaborEntry[],
    accruals: MonthlyLaborAccrual[],
    employees: EmployeeRecord[],
    projects: Project[],
    mappings: LaborCodeMapping[] = [],
  ): LaborException[] {
    const exceptions: LaborException[] = [];
    const employeeKeys = new Set(employees.map(e => normalizeKey(e.employeeName)));
    const employeeByKey = new Map(employees.map(e => [normalizeKey(e.employeeName), e]));
    const projectNumbers = new Set(projects.map(p => p.projectNumber?.trim()).filter(Boolean));

    for (const entry of entries) {
      const employee = entry.employeeName
        ? employeeByKey.get(normalizeKey(entry.employeeName))
        : undefined;
      const nonUnion = isNonUnionEmployee(employee, entry.classification);
      const mapping = resolveLaborCodeMapping(entry.laborCode, mappings);
      const officeAdmin = suppressLaborExceptionsForOfficeAdmin(entry.laborCode, mapping);

      if (!entry.employeeName) {
        exceptions.push(this.exception('missing-employee-match', 'error', 'Missing employee name', entry));
      } else if (!employeeKeys.has(normalizeKey(entry.employeeName))) {
        exceptions.push(this.exception('missing-employee-match', 'warning', 'Employee not found in Employee Summary', entry));
      }

      if (!entry.classification && !officeAdmin) {
        exceptions.push(this.exception('missing-classification', 'warning', 'Missing classification on approved time row', entry));
      }

      if (isUnassignedLaborCode(entry.laborCode)) {
        exceptions.push(this.exception('unassigned-labor-code', 'warning', 'Unassigned labor code on approved time row', entry));
      } else if (isUnmappedLaborCode(entry.laborCode, mappings) && !officeAdmin) {
        exceptions.push(this.exception('unmapped-labor-code', 'warning', `Labor code ${entry.laborCode} is not mapped in Settings`, entry));
      }

      if (entry.rateMissing && !officeAdmin) {
        exceptions.push(this.exception('missing-base-rate', 'error', 'Labor rate missing — no employee, classification, or area default match', entry));
      } else if (!officeAdmin && !nonUnion && (entry.fringeRate == null || entry.fringeRate === 0)) {
        exceptions.push(this.exception('missing-fringe-rate', 'warning', 'Fringe rate missing for matched labor entry', entry));
      }

      const projectNo = entry.projectNumber ?? entry.jobIdLabel;
      if (projectNo && !projectNumbers.has(String(entry.projectNumber ?? '').trim())) {
        const label = entry.jobIdLabel ?? projectNo;
        if (!isOverheadJobLabel(label) && !/^998$/i.test(String(entry.projectNumber ?? ''))) {
          exceptions.push(this.exception('project-no-match', 'warning', 'Approved labor on job with no project match in app', entry));
        }
      }

      if (!officeAdmin && (isOverheadJobLabel(entry.jobIdLabel) || /^998$/i.test(String(entry.projectNumber ?? '')))) {
        exceptions.push(this.exception('office-labor-on-job', 'warning', 'Office / overhead labor coded to a job cost', entry));
      }

      const project = projects.find(p => p.id === entry.projectId);
      if (project?.prevailingWage && isUnmappedLaborCode(entry.laborCode, mappings) && !officeAdmin) {
        exceptions.push(this.exception('unmapped-labor-code', 'error', 'Prevailing wage job has unmapped labor code', entry));
      }

      const effectiveClass = effectiveClassification(entry, mapping);
      if (countsTowardCertifiedPayroll(mapping) && !effectiveClass && !officeAdmin) {
        exceptions.push(this.exception('missing-classification', 'error', 'Certified payroll eligible labor code missing classification mapping', entry));
      }

      if (!officeAdmin && project?.prevailingWage && entry.classification && !nonUnion) {
        const certified = /cert|journeyman|apprentice|foreman/i.test(entry.classification);
        if (!certified) {
          exceptions.push(this.exception('certified-payroll-non-certified-class', 'error', 'Certified payroll project with non-certified classification', entry));
        }
      }
    }

    for (const employee of employees) {
      const hasHours = entries.some(e => normalizeKey(e.employeeName) === normalizeKey(employee.employeeName));
      if (hasHours && !employee.qboMatch) {
        exceptions.push({
          id: `emp-no-qbo-${normalizeKey(employee.employeeName)}`,
          type: 'employee-no-qbo-match',
          severity: 'warning',
          title: 'Employee has hours but no QBO match',
          description: `${employee.employeeName} has approved timekeeper hours but no QBO employee match.`,
          employeeName: employee.employeeName,
        });
      }
    }

    for (const accrual of accruals) {
      if ((accrual.laborNotYetInQb ?? 0) > 0 && !accrual.qbActualLaborCost) {
        exceptions.push({
          id: `not-in-qbo-${accrual.id}`,
          type: 'approved-not-in-qbo',
          severity: 'warning',
          title: 'Approved labor not yet in QBO',
          description: `${accrual.employeeName} · J${accrual.projectNo} · ${accrual.month}`,
          employeeName: accrual.employeeName,
          projectNo: accrual.projectNo,
          month: accrual.month,
          estimatedCost: accrual.laborNotYetInQb,
        });
      }
    }

    for (const project of projects) {
      const qbLabor = project.qboLaborCost ?? project.selfPerformedAmount;
      if (!qbLabor || qbLabor <= 0) continue;
      const hasHours = entries.some(e => e.projectId === project.id);
      if (!hasHours) {
        exceptions.push({
          id: `qbo-no-hours-${project.id}`,
          type: 'qbo-no-timekeeper-hours',
          severity: 'warning',
          title: 'QBO labor exists but no approved timekeeper hours',
          description: `${project.projectName} (J${project.projectNumber}) has QBO labor cost but no approved timekeeper rows.`,
          projectNo: project.projectNumber,
          estimatedCost: qbLabor,
        });
      }
    }

    return dedupeExceptions(exceptions);
  }

  deriveQbLaborActuals(
    projects: Project[],
    monthlyLabor: import('../data/project-costs.types').ProjectCostMonthlyLabor[] = [],
  ): QbLaborActual[] {
    const fromCostDetail = new Map<string, QbLaborActual>();

    for (const row of monthlyLabor) {
      const key = `${row.jobNumber}|${row.month}`;
      fromCostDetail.set(key, {
        projectNo: row.jobNumber,
        month: row.month,
        qbActualLaborCost: row.laborCost,
        source: 'qbo-project',
      });
    }

    for (const project of projects) {
      const laborCost = project.qboLaborCost ?? project.selfPerformedAmount;
      if (!laborCost || laborCost <= 0) continue;
      const key = `${project.projectNumber}|all`;
      if (!fromCostDetail.has(key)) {
        fromCostDetail.set(key, {
          projectNo: project.projectNumber,
          projectId: project.id,
          qbActualLaborCost: laborCost,
          source: 'qbo-project',
          syncedAt: project.qboCostDetailSyncedAt ?? project.qboSyncedAt,
        });
      }
    }

    return [...fromCostDetail.values()];
  }

  findQbActualForAccrual(
    projectNo: string,
    month: string,
    qbActuals: QbLaborActual[],
  ): QbLaborActual | undefined {
    const normalized = projectNo.replace(/^J/i, '');
    return qbActuals.find(q =>
      (q.projectNo === normalized || q.projectNo === projectNo)
      && (q.month === month || !q.month),
    );
  }

  private findQbActual(projectNo: string, month: string, qbActuals: QbLaborActual[]): QbLaborActual | undefined {
    return this.findQbActualForAccrual(projectNo, month, qbActuals);
  }

  private exception(
    type: LaborExceptionType,
    severity: 'warning' | 'error',
    title: string,
    entry: NormalizedLaborEntry,
  ): LaborException {
    return {
      id: `${type}-${entry.id}`,
      type,
      severity,
      title,
      description: `${entry.employeeName ?? 'Unknown'} · ${entry.jobIdLabel ?? '—'} · ${entry.workDate ?? '—'}`,
      employeeName: entry.employeeName,
      projectNo: entry.projectNumber ?? entry.jobIdLabel,
      classification: entry.classification,
      month: entry.month,
      hours: entry.totalHours,
      estimatedCost: entry.estimatedLaborTotal,
    };
  }
}

function normalizeKey(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function dedupeExceptions(items: LaborException[]): LaborException[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
