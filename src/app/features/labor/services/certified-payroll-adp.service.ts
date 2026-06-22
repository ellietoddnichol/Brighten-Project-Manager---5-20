import { Injectable, inject } from '@angular/core';
import { AdpPayrollDetail } from '@app/models/certified-payroll.types';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { parseAdpEarningsRecordCsv } from '@features/labor/utils/adp-earnings-record.parser';
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

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollAdpService {
  private cprData = inject(CertifiedPayrollDataService);

  async importEarningsRecordCsv(text: string, fileName: string): Promise<AdpImportResult> {
    const parsed = parseAdpEarningsRecordCsv(text, fileName);
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
        sourceFileName: fileName,
      });
    }

    await this.cprData.batchUpsertAdpPayrollDetails(details);
    await this.cprData.upsertAdpReportIndex({
      id: safeFirestoreId(`adp_report_${parsed.weekEnding}_${fileName}`),
      fileName,
      payDate: parsed.payDate,
      weekEnding: parsed.weekEnding,
      weekStart: parsed.weekStart,
      employeeCount: parsed.employees.length,
    });

    return {
      fileName,
      payDate: parsed.payDate,
      weekEnding: parsed.weekEnding,
      weekStart: parsed.weekStart,
      employeesImported: parsed.employees.length,
      tableRowCount: parsed.tableRowCount,
    };
  }
}
