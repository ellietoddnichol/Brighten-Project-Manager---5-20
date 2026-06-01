import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CERTIFIED_PAYROLL_SHEET, CERTIFIED_PAYROLL_EXPORT_MESSAGE } from '../config/certified-payroll-sheet.config';
import { environment } from '../config/environment';
import { CertifiedPayrollEntry, CertifiedPayrollWeek } from '../models/certified-payroll.types';
import { Project } from '../models/types';
import { buildCertifiedPayrollCsv } from '../utils/workflow-document-templates';
import { CertifiedPayrollDataService } from './certified-payroll-data.service';
import { ProjectWorkflowSaveService } from './project-workflow-save.service';
import { SheetsService } from './sheets.service';

export interface ExportWeekResult {
  success: boolean;
  message: string;
  rowCount: number;
}

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollExportService {
  private cprData = inject(CertifiedPayrollDataService);
  private sheets = inject(SheetsService);
  private workflowSave = inject(ProjectWorkflowSaveService);

  exportConfigured(): boolean {
    return !!environment.certifiedPayrollSheetId.trim();
  }

  async exportWeek(project: Project, week: CertifiedPayrollWeek): Promise<ExportWeekResult> {
    const sheetId = environment.certifiedPayrollSheetId.trim();
    const entries = this.cprData.getEntriesSnapshot().filter(e => e.weekId === week.id);

    if (!sheetId) {
      await firstValueFrom(this.cprData.createExport({
        projectId: project.id,
        weekId: week.id,
        weekEnding: week.weekEnding,
        destination: 'manual',
        rowCount: entries.length,
        status: 'pending',
        message: CERTIFIED_PAYROLL_EXPORT_MESSAGE,
      }));
      return { success: false, message: CERTIFIED_PAYROLL_EXPORT_MESSAGE, rowCount: entries.length };
    }

    if (week.status !== 'ready' && week.status !== 'exported') {
      return { success: false, message: 'Week is blocked by exceptions and cannot be exported.', rowCount: 0 };
    }

    const rows = entries.map(entry => this.entryToExportRow(project, week, entry));
    const tab = CERTIFIED_PAYROLL_SHEET.exportTab;
    const range = `'${tab}'!A:T`;

    try {
      const existing = await this.sheets.getValues(sheetId, `'${tab}'!A1:T1`).catch(() => []);
      const exportRows = existing.length ? rows : [this.headerRow(), ...rows];
      await this.sheets.appendValues(sheetId, range, exportRows);

      await this.cprData.upsertWeek({
        ...week,
        status: 'exported',
        exportedAt: new Date().toISOString(),
      });

      await firstValueFrom(this.cprData.createExport({
        projectId: project.id,
        weekId: week.id,
        weekEnding: week.weekEnding,
        destination: 'google-sheet',
        sheetId,
        rowCount: rows.length,
        status: 'success',
        exportedAt: new Date().toISOString(),
        message: `Exported ${rows.length} rows to ${tab}.`,
      }));

      await this.saveDriveExport(project, week, entries);

      return { success: true, message: `Exported ${rows.length} draft rows to certified payroll sheet.`, rowCount: rows.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed.';
      await firstValueFrom(this.cprData.createExport({
        projectId: project.id,
        weekId: week.id,
        weekEnding: week.weekEnding,
        destination: 'google-sheet',
        sheetId,
        rowCount: entries.length,
        status: 'failed',
        message,
      }));
      return { success: false, message, rowCount: 0 };
    }
  }

  private entryToExportRow(project: Project, week: CertifiedPayrollWeek, entry: CertifiedPayrollEntry): string[] {
    return [
      project.projectNumber ?? '',
      project.projectName ?? '',
      week.weekEnding,
      entry.employeeName,
      entry.classification,
      entry.laborCode ?? '',
      String(entry.regularHours ?? 0),
      String(entry.overtimeHours ?? 0),
      String(entry.doubleTimeHours ?? 0),
      String(entry.baseRate ?? ''),
      String(entry.fringeRate ?? ''),
      String(entry.regularWage ?? 0),
      String(entry.overtimeWage ?? 0),
      String(entry.doubleTimeWage ?? 0),
      String(entry.fringeAmount ?? 0),
      String(entry.grossPackage ?? 0),
      project.county ?? '',
      project.wageOrderNumber ?? '',
      project.publicBody ?? '',
      project.payrollComplianceType ?? '',
    ];
  }

  private headerRow(): string[] {
    return [
      'Project Number',
      'Project Name',
      'Week Ending',
      'Employee',
      'Classification',
      'Labor Code',
      'Regular Hours',
      'Overtime Hours',
      'Double Time Hours',
      'Base Rate',
      'Fringe Rate',
      'Regular Wage',
      'OT Wage',
      'DT Wage',
      'Fringe Amount',
      'Gross Package',
      'County',
      'Wage Order',
      'Public Body',
      'Compliance Type',
    ];
  }

  private async saveDriveExport(
    project: Project,
    week: CertifiedPayrollWeek,
    entries: CertifiedPayrollEntry[],
  ): Promise<void> {
    const rows = entries.map(entry => [
      project.projectNumber ?? '',
      project.projectName ?? '',
      week.weekEnding,
      entry.employeeName,
      entry.classification,
      String(entry.regularHours ?? 0),
      String(entry.overtimeHours ?? 0),
      String(entry.grossPackage ?? 0),
    ]);
    const csv = buildCertifiedPayrollCsv(project, week.weekEnding, rows);
    const fileName = `CPR-${project.projectNumber}-WE-${week.weekEnding}.csv`;

    try {
      await this.workflowSave.saveProjectWorkflowFile({
        projectId: project.id,
        workflowType: 'certified_payroll',
        fileName,
        content: csv,
        mimeType: 'text/csv',
        documentType: 'Certified Payroll Export',
        documentStatus: 'Exported',
        sourceRecordId: week.id,
        requestAuthIfNeeded: true,
      });
    } catch (err) {
      console.warn('CPR Drive export failed:', err);
    }
  }
}
