import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';
import { AdpPayrollDetail } from '@app/models/certified-payroll.types';
import {
  CPR_ADP_EARNINGS_FILE_NAME_CONTAINS,
  CPR_ADP_EARNINGS_FOLDER_ID,
} from '@app/config/certified-payroll-sheet.config';
import { DriveService } from '@core/services/drive.service';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import {
  parseAdpEarningsRecordCsv,
  parseAdpEarningsRecordMatrix,
} from '@features/labor/utils/adp-earnings-record.parser';
import { normalizePersonName } from '@features/labor/utils/cpr-form.util';
import { normalizeEmployeeKey, safeFirestoreId } from '@features/labor/utils/certified-payroll-week';

export interface AdpImportResult {
  fileName: string;
  payDate: string;
  weekEnding: string;
  weekStart: string;
  employeesImported: number;
  tableRowCount: number;
}

export interface AdpBatchImportResult {
  imported: AdpImportResult[];
  skipped: string[];
  errors: { fileName: string; message: string }[];
}

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollAdpService {
  private cprData = inject(CertifiedPayrollDataService);
  private drive = inject(DriveService);

  async importEarningsRecordFile(file: File): Promise<AdpImportResult> {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][];
      const parsed = parseAdpEarningsRecordMatrix(rows, file.name);
      return this.persistParsedReport(parsed);
    }

    const text = await file.text();
    return this.importEarningsRecordCsv(text, file.name);
  }

  async importEarningsRecordCsv(text: string, fileName: string): Promise<AdpImportResult> {
    const parsed = parseAdpEarningsRecordCsv(text, fileName);
    return this.persistParsedReport(parsed);
  }

  async importEarningsRecordsFromDriveFolder(
    folderId = CPR_ADP_EARNINGS_FOLDER_ID,
    fileNameContains = CPR_ADP_EARNINGS_FILE_NAME_CONTAINS,
  ): Promise<AdpBatchImportResult> {
    const files = await this.drive.listFiles(folderId);
    const targets = files
      .filter(f => f.name.toLowerCase().includes(fileNameContains.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));

    const result: AdpBatchImportResult = { imported: [], skipped: [], errors: [] };
    if (!targets.length) {
      result.skipped.push(`No files matching "${fileNameContains}" in Drive folder.`);
      return result;
    }

    for (const file of targets) {
      try {
        const parsed = await this.parseDriveEarningsFile(file.id, file.name, file.mimeType);
        result.imported.push(await this.persistParsedReport(parsed));
      } catch (err) {
        result.errors.push({
          fileName: file.name,
          message: err instanceof Error ? err.message : 'Import failed.',
        });
      }
    }

    return result;
  }

  private async parseDriveEarningsFile(fileId: string, fileName: string, mimeType: string) {
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const csvText = await this.drive.exportFile(fileId, 'text/csv');
      return parseAdpEarningsRecordCsv(csvText, fileName);
    }

    const buffer = await this.drive.downloadFile(fileId);
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.csv') || mimeType === 'text/csv') {
      return parseAdpEarningsRecordCsv(new TextDecoder().decode(buffer), fileName);
    }

    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][];
    return parseAdpEarningsRecordMatrix(rows, fileName);
  }

  private async persistParsedReport(
    parsed: ReturnType<typeof parseAdpEarningsRecordCsv>,
  ): Promise<AdpImportResult> {
    const details: Array<Partial<AdpPayrollDetail> & Pick<AdpPayrollDetail, 'id' | 'employeeKey' | 'employeeName'>> = [];

    for (const employee of parsed.employees) {
      const employeeKey = normalizeEmployeeKey(employee.rawName);
      const id = safeFirestoreId(`adp_${parsed.weekEnding}_${normalizePersonName(employee.rawName)}`);
      details.push({
        id,
        employeeKey,
        employeeName: employee.rawName,
        payPeriodEnding: parsed.weekEnding,
        payDate: parsed.payDate,
        ssnLast4: employee.ssnLast4,
        department: employee.department,
        regularHours: employee.regularHours,
        overtimeHours: employee.overtimeHours,
        grossPay: employee.grossPay,
        regularRate: employee.regularRate,
        overtimeRate: employee.overtimeRate,
        socialSecurity: employee.socialSecurity,
        medicare: employee.medicare,
        federalIncomeTax: employee.federalIncomeTax,
        stateTaxKs: employee.stateTaxKs,
        stateTaxMo: employee.stateTaxMo,
        unionDues: employee.unionDues,
        vacationDeduction: employee.vacationDeduction,
        netPay: employee.netPay,
        source: 'adp-earnings-record',
        sourceFileName: parsed.fileName,
      });
    }

    await this.cprData.batchUpsertAdpPayrollDetails(details);
    await this.cprData.upsertAdpReportIndex({
      id: safeFirestoreId(`adp_report_${parsed.weekEnding}_${parsed.fileName}`),
      fileName: parsed.fileName,
      payDate: parsed.payDate,
      weekEnding: parsed.weekEnding,
      weekStart: parsed.weekStart,
      employeeCount: parsed.employees.length,
    });

    return {
      fileName: parsed.fileName,
      payDate: parsed.payDate,
      weekEnding: parsed.weekEnding,
      weekStart: parsed.weekStart,
      employeesImported: parsed.employees.length,
      tableRowCount: parsed.tableRowCount,
    };
  }
}
