import { Injectable, inject } from '@angular/core';
import {
  AdpPayrollDetail,
  CertifiedPayrollDailyHours,
  CertifiedPayrollEntry,
  CertifiedPayrollException,
  CertifiedPayrollWeek,
  EmployeePayrollInfo,
} from '@app/models/certified-payroll.types';
import { ClassificationRateRecord, EmployeeRecord, NormalizedLaborEntry } from '@app/models/labor.types';
import { Project } from '@app/models/types';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { LaborRateService } from '@features/labor/services/labor-rate.service';
import { LaborCodeMappingService } from '@features/labor/services/labor-code-mapping.service';
import {
  entryId,
  isCertifiedPayrollProject,
  normalizeEmployeeKey,
  safeFirestoreId,
  weekEndingSunday,
  weekId,
} from '@features/labor/utils/certified-payroll-week';
import {
  countsTowardCertifiedPayroll,
  effectiveClassification,
  isUnmappedLaborCode,
  resolveLaborCodeMapping,
} from '@features/labor/utils/labor-code-mapping.compute';

export interface GenerateWeeklyResult {
  weeksCreated: number;
  entriesCreated: number;
  exceptionsCreated: number;
}

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollGeneratorService {
  private cprData = inject(CertifiedPayrollDataService);
  private laborData = inject(LaborDataService);
  private rateService = inject(LaborRateService);
  private laborCodeMapping = inject(LaborCodeMappingService);

  async generateWeeklyDrafts(projects: Project[], projectId?: string): Promise<GenerateWeeklyResult> {
    const targetProjects = projects.filter(p =>
      isCertifiedPayrollProject(p) && (!projectId || p.id === projectId),
    );

    let weeksCreated = 0;
    let entriesCreated = 0;
    let exceptionsCreated = 0;

    const employeeInfo = this.cprData.getEmployeePayrollInfoSnapshot();
    const adpDetails = this.cprData.getAdpPayrollDetailsSnapshot();
    const rates = this.resolveRates();
    const employees = this.laborData.employees();

    for (const project of targetProjects) {
      const projectEntries = this.laborData.normalizedEntries().filter(e => e.projectId === project.id);
      const projectExceptions = this.detectProjectExceptions(project);
      exceptionsCreated += projectExceptions.length;
      await this.cprData.batchReplaceExceptions(project.id, undefined, projectExceptions);

      const grouped = this.groupByWeekEmployeeClassification(projectEntries);
      for (const [key, rows] of grouped.entries()) {
        const [weekEnding, employeeName, classification, laborCode] = key.split('||');
        const wId = weekId(project.id, weekEnding);
        const eId = entryId(project.id, weekEnding, employeeName, classification, laborCode || undefined);

        const built = this.buildEntry(rows, employeeName, classification, laborCode || undefined, rates, employees, employeeInfo, adpDetails);
        const weekExceptions = this.detectWeekEntryExceptions(project, wId, weekEnding, eId, built.entry, built.entryRows, adpDetails);

        await this.cprData.upsertEntry({
          ...built.entry,
          id: eId,
          weekId: wId,
          projectId: project.id,
          weekEnding,
          employeeName,
          classification,
        });
        entriesCreated += 1;

        const existingWeek = this.cprData.getWeeksSnapshot().find(w => w.id === wId);
        if (!existingWeek) weeksCreated += 1;

        await this.cprData.batchReplaceExceptions(project.id, wId, weekExceptions);
        exceptionsCreated += weekExceptions.length;

        const weekEntries = this.aggregateWeekEntries(project.id, weekEnding, eId, built.entry);
        const weekExceptionCount =
          projectExceptions.length
          + weekExceptions.length
          + this.cprData.getExceptionsSnapshot().filter(e => e.weekId === wId && !e.resolved).length;

        const status = weekExceptionCount > 0 ? 'blocked' : 'ready';
        await this.cprData.upsertWeek({
          id: wId,
          projectId: project.id,
          weekEnding,
          status: existingWeek?.status === 'exported' ? existingWeek.status : status,
          regularHours: weekEntries.regularHours,
          overtimeHours: weekEntries.overtimeHours,
          doubleTimeHours: weekEntries.doubleTimeHours,
          totalHours: weekEntries.totalHours,
          entryCount: weekEntries.entryCount,
          exceptionCount: weekExceptionCount,
          readyAt: status === 'ready' ? new Date().toISOString() : undefined,
        });
      }
    }

    return { weeksCreated, entriesCreated, exceptionsCreated };
  }

  private resolveRates(): ClassificationRateRecord[] {
    const stored = this.cprData.getClassificationRates();
    // Observable snapshot may be empty on first run — fall back to labor module rates.
    return this.laborData.classificationRates();
  }

  private groupByWeekEmployeeClassification(entries: NormalizedLaborEntry[]): Map<string, NormalizedLaborEntry[]> {
    const map = new Map<string, NormalizedLaborEntry[]>();
    const mappings = this.laborCodeMapping.snapshot();
    for (const entry of entries) {
      if (!entry.workDate || !entry.employeeName) continue;
      const weekEnding = weekEndingSunday(entry.workDate);
      const mapping = resolveLaborCodeMapping(entry.laborCode, mappings);
      const classification = (effectiveClassification(entry, mapping) ?? 'Unknown').trim();
      const key = [
        weekEnding,
        entry.employeeName.trim(),
        classification,
        (entry.laborCode ?? '').trim(),
      ].join('||');
      const bucket = map.get(key) ?? [];
      bucket.push(entry);
      map.set(key, bucket);
    }
    return map;
  }

  private buildEntry(
    rows: NormalizedLaborEntry[],
    employeeName: string,
    classification: string,
    laborCode: string | undefined,
    rates: ClassificationRateRecord[],
    employees: EmployeeRecord[],
    employeeInfo: EmployeePayrollInfo[],
    adpDetails: AdpPayrollDetail[],
  ): { entry: Omit<CertifiedPayrollEntry, 'id' | 'weekId' | 'projectId' | 'weekEnding' | 'employeeName' | 'classification'>; entryRows: NormalizedLaborEntry[] } {
    const dailyMap = new Map<string, CertifiedPayrollDailyHours>();
    for (const row of rows) {
      const date = row.workDate!.slice(0, 10);
      const existing = dailyMap.get(date) ?? { workDate: date, regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
      existing.regularHours += row.regularHours;
      existing.overtimeHours += row.overtimeHours;
      existing.doubleTimeHours += row.doubleTimeHours;
      dailyMap.set(date, existing);
    }

    const dailyHours = [...dailyMap.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
    const regularHours = dailyHours.reduce((s, d) => s + d.regularHours, 0);
    const overtimeHours = dailyHours.reduce((s, d) => s + d.overtimeHours, 0);
    const doubleTimeHours = dailyHours.reduce((s, d) => s + d.doubleTimeHours, 0);
    const totalHours = regularHours + overtimeHours + doubleTimeHours;

    const matched = this.rateService.matchRate(employeeName, classification, employees, rates);
    const baseRate = matched.baseRate ?? rows[0]?.baseRate;
    const fringeRate = matched.fringeEligible ? (matched.fringeRate ?? 0) : 0;
    const regularWage = regularHours * (baseRate ?? 0);
    const overtimeWage = overtimeHours * (baseRate ?? 0) * 1.5;
    const doubleTimeWage = doubleTimeHours * (baseRate ?? 0) * 2;
    const fringeAmount = totalHours * (fringeRate ?? 0);

    const empKey = normalizeEmployeeKey(employeeName);
    const empInfo = employeeInfo.find(e => e.employeeKey === empKey);
    const adp = adpDetails.find(d => d.employeeKey === empKey && d.payPeriodEnding === rows[0]?.workDate?.slice(0, 10));

    return {
      entryRows: rows,
      entry: {
        laborCode,
        dailyHours,
        regularHours,
        overtimeHours,
        doubleTimeHours,
        totalHours,
        baseRate,
        fringeRate,
        totalPackage: baseRate != null && fringeRate != null ? baseRate + fringeRate : undefined,
        regularWage,
        overtimeWage,
        doubleTimeWage,
        fringeAmount,
        grossPackage: regularWage + overtimeWage + doubleTimeWage + fringeAmount,
        employeePayrollInfoId: empInfo?.id,
        adpPayrollDetailId: adp?.id,
        sourceEntryIds: rows.map(r => r.id),
      },
    };
  }

  private aggregateWeekEntries(
    projectId: string,
    weekEnding: string,
    newEntryId: string,
    newEntry: Partial<CertifiedPayrollEntry>,
  ): { regularHours: number; overtimeHours: number; doubleTimeHours: number; totalHours: number; entryCount: number } {
    const wId = weekId(projectId, weekEnding);
    const entries = this.cprData.getEntriesSnapshot().filter(e => e.weekId === wId && e.id !== newEntryId);
    const all = [...entries, newEntry as CertifiedPayrollEntry];
    return {
      regularHours: all.reduce((s, e) => s + (e.regularHours ?? 0), 0),
      overtimeHours: all.reduce((s, e) => s + (e.overtimeHours ?? 0), 0),
      doubleTimeHours: all.reduce((s, e) => s + (e.doubleTimeHours ?? 0), 0),
      totalHours: all.reduce((s, e) => s + (e.totalHours ?? 0), 0),
      entryCount: all.length,
    };
  }

  private detectProjectExceptions(project: Project): Array<CertifiedPayrollException & { id: string }> {
    const exceptions: Array<CertifiedPayrollException & { id: string }> = [];
    const push = (type: CertifiedPayrollException['type'], message: string, severity: 'warning' | 'error' = 'error') => {
      exceptions.push({
        id: safeFirestoreId(`${project.id}_project_${type}`),
        projectId: project.id,
        type,
        severity,
        message,
        resolved: false,
      });
    };

    if (!project.wageOrderNumber) push('missing-wage-order', 'Wage order / AWO number is missing.');
    if (!project.county) push('missing-county', 'Project county is missing for certified payroll.');
    if (!project.publicBody) push('missing-public-body', 'Public body / owner agency is missing.');

    if (project.status === 'Closeout' || project.status === 'Closed') {
      if (project.certifiedPayrollStatus !== 'Complete') {
        push('final-payroll-needed', 'Final certified payroll submission is required for closeout.', 'warning');
      }
    }

    return exceptions;
  }

  private detectWeekEntryExceptions(
    project: Project,
    weekIdValue: string,
    weekEnding: string,
    entryIdValue: string,
    entry: Partial<CertifiedPayrollEntry>,
    rows: NormalizedLaborEntry[],
    adpDetails: AdpPayrollDetail[],
  ): Array<CertifiedPayrollException & { id: string }> {
    const exceptions: Array<CertifiedPayrollException & { id: string }> = [];
    const employeeName = rows[0]?.employeeName ?? 'Unknown';
    const laborCode = rows[0]?.laborCode;
    const mapping = resolveLaborCodeMapping(laborCode, this.laborCodeMapping.snapshot());
    const classification = effectiveClassification(rows[0] ?? {}, mapping) ?? rows[0]?.classification ?? '';

    const push = (type: CertifiedPayrollException['type'], message: string, severity: 'warning' | 'error' = 'error') => {
      exceptions.push({
        id: safeFirestoreId(`${entryIdValue}_${type}`),
        projectId: project.id,
        weekId: weekIdValue,
        entryId: entryIdValue,
        type,
        severity,
        message,
        employeeName,
        classification,
        resolved: false,
      });
    };

    if (!employeeName || employeeName === 'Unknown') {
      push('missing-employee-info', 'Employee name is missing on approved time row.');
    } else {
      const empInfo = this.cprData.getEmployeePayrollInfoSnapshot().find(e => e.employeeKey === normalizeEmployeeKey(employeeName));
      if (!empInfo?.legalName && !empInfo?.address) {
        push('missing-employee-info', `Employee payroll info incomplete for ${employeeName}.`, 'warning');
      }
    }

    if (!classification) push('missing-classification', 'Classification is missing.');
    else if (!/cert|journeyman|apprentice|foreman|helper|carpenter/i.test(classification)) {
      push('unknown-classification', `Classification "${classification}" may not be certified-payroll eligible.`, 'warning');
    }

    if (project.prevailingWage && isUnmappedLaborCode(laborCode, this.laborCodeMapping.snapshot())) {
      push('unmapped-labor-code', `Labor code ${laborCode || '(blank)'} is not mapped for prevailing wage payroll.`);
    }

    if (countsTowardCertifiedPayroll(mapping) && !mapping?.certifiedPayrollClassification?.trim()) {
      push('labor-code-missing-classification', `Labor code ${laborCode} is CPR eligible but missing classification mapping.`);
    }

    if (entry.baseRate == null || entry.baseRate <= 0) push('missing-wage-rate', 'Base wage rate is missing.');
    if (entry.fringeRate == null || entry.fringeRate <= 0) push('missing-fringe-rate', 'Fringe rate is missing.');

    for (const row of rows) {
      if (row.approvalStatus && !/^approved$/i.test(row.approvalStatus)) {
        push('unapproved-time', `Time row ${row.id} is not approved.`);
      }
    }

    const adp = adpDetails.find(d =>
      d.employeeKey === normalizeEmployeeKey(employeeName)
      && d.payPeriodEnding === weekEnding,
    );
    if (adp?.regularHours != null && Math.abs((adp.regularHours ?? 0) - (entry.regularHours ?? 0)) > 0.25) {
      push('adp-time-mismatch', `ADP regular hours (${adp.regularHours}) differ from timekeeper (${entry.regularHours}).`, 'warning');
    }

    return exceptions;
  }
}
