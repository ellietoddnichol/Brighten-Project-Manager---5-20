import { Component, Input, computed, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  AdpPayrollDetail,
  CertifiedPayrollEntry,
  CertifiedPayrollWeek,
  EmployeePayrollInfo,
} from '@app/models/certified-payroll.types';
import { Project } from '@app/models/types';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import {
  findAdpPayrollDetail,
  normalizeEmployeeKey,
  normalizeWeekEndingToSaturday,
  workWeekDatesSunThroughSat,
} from '@features/labor/utils/certified-payroll-week';
import {
  buildCprPage1Row,
  buildCprPage2Row,
  formatCprShortDate,
} from '@features/labor/utils/cpr-form.util';

@Component({
  selector: 'app-cpr-form-print',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DecimalPipe],
  styles: [`
    @media print {
      .no-print { display: none !important; }
      .cpr-form { font-size: 8pt; font-family: Arial, sans-serif; }
      .cpr-form table { border-collapse: collapse; width: 100%; }
      .cpr-form td, .cpr-form th { border: 1px solid #000; padding: 2px 3px; vertical-align: top; }
      .cpr-page-break { page-break-before: always; }
    }
    .cpr-form { font-size: 10px; font-family: Arial, sans-serif; }
    .cpr-form table { border-collapse: collapse; width: 100%; }
    .cpr-form td, .cpr-form th { border: 1px solid #000; padding: 3px 4px; vertical-align: top; }
    .cpr-form .header-cell { font-weight: bold; background: #f8fafc; }
    .cpr-form .center { text-align: center; }
    .cpr-form .right { text-align: right; }
  `],
  template: `
    <div class="cpr-form space-y-4">
      <section>
        <div class="text-center font-bold text-sm mb-2">CONTRACTOR PAYROLL RECORDS</div>
        <table class="mb-2">
          <tr>
            <td colspan="4"><strong>NAME OF SUBCONTRACTOR:</strong> Brighten Builders, LLC</td>
          </tr>
          <tr>
            <td colspan="4"><strong>Address:</strong> 512 S 70th St &nbsp; Kansas City &nbsp; KS &nbsp; 66111 &nbsp; <strong>Phone:</strong> 913-306-3055</td>
          </tr>
          <tr>
            <td colspan="2"><strong>Name of Public Body:</strong> {{ project.publicBody || '—' }}</td>
            <td colspan="2"><strong>Address of Public Body:</strong> {{ publicBodyLine() }}</td>
          </tr>
          <tr class="header-cell">
            <td>PAYROLL NO.</td>
            <td>For week ending</td>
            <td>AWO</td>
            <td>Project and Location / Project or Contract No.</td>
          </tr>
          <tr>
            <td class="center">{{ payrollNumber }}</td>
            <td class="center">{{ weekEndingLabel() }}</td>
            <td class="center">{{ project.wageOrderNumber || '—' }}</td>
            <td>{{ projectAndLocation() }} / {{ project.contractNumber || project.projectNumber || '—' }}</td>
          </tr>
        </table>

        <table>
          <thead>
            <tr class="header-cell">
              <th>Name and Address of Employee</th>
              <th>Occupational Title</th>
              <th>ST or OT</th>
              @for (label of dayLabels; track label; let i = $index) {
                <th class="center">{{ label }}<div class="font-normal">{{ dayDate(i) }}</div></th>
              }
              <th class="right">Total Hrs</th>
              <th class="right">Hourly Rate</th>
              <th class="right">Gross (Project/Wk)</th>
              <th class="right">FICA/Med</th>
              <th class="right">Fed/State Tax</th>
              <th class="right">OTHER A</th>
              <th class="right">OTHER B</th>
              <th class="right">Total Ded.</th>
              <th class="right">NET WAGES</th>
            </tr>
          </thead>
          <tbody>
            @for (row of page1Rows(); track row.name + row.occupation) {
              <tr>
                <td>{{ row.name }}</td>
                <td>{{ row.occupation }}</td>
                <td class="center">ST</td>
                @for (h of row.stHours; track $index) {
                  <td class="center">{{ h || '' }}</td>
                }
                <td class="right">{{ row.totalSt | number:'1.1-1' }}</td>
                <td class="right">{{ row.stRate | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.projectGross | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.ficaMed | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.fedStateTax | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.unionDues | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.vacationDeduction | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.totalDeductions | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.netPay | currency:'USD':'symbol':'1.2-2' }}</td>
              </tr>
              <tr>
                <td>{{ row.address }}</td>
                <td></td>
                <td class="center">OT</td>
                @for (h of row.otHours; track $index) {
                  <td class="center">{{ h || '' }}</td>
                }
                <td class="right">{{ row.totalOt | number:'1.1-1' }}</td>
                <td class="right">{{ row.otRate | currency:'USD':'symbol':'1.2-2' }}</td>
                <td class="right">{{ row.weekGross | currency:'USD':'symbol':'1.2-2' }}</td>
                <td colspan="5"></td>
                <td></td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="cpr-page-break">
        <div class="text-center font-bold text-sm mb-2">FRINGE BENEFITS</div>
        <p class="text-[8px] mb-2">
          Payments of fringe benefits to bona fide benefit plans, funds, or programs are made pursuant to
          the applicable Davis-Bacon fringe benefit requirements.
        </p>
        <table>
          <thead>
            <tr class="header-cell">
              <th>Employee Name</th>
              <th>H&amp;W ($/hr)</th>
              <th>Pension ($/hr)</th>
              <th>Vacation ($/hr)</th>
              <th>Holiday ($/hr)</th>
              <th>Apprentice Training ($/hr)</th>
              <th>Other C</th>
              <th>Other D</th>
              <th>Total ($/hr)</th>
              <th>If Other/Deduction or Fringes, explain</th>
              <th>Identify plan/fund/program</th>
            </tr>
          </thead>
          <tbody>
            @for (row of page2Rows(); track row.name) {
              <tr>
                <td>{{ row.name }}</td>
                <td class="right">{{ row.healthWelfare | number:'1.2-2' }}</td>
                <td class="right">{{ row.pension | number:'1.2-2' }}</td>
                <td class="right">{{ row.vacation | number:'1.2-2' }}</td>
                <td class="right">{{ row.holiday | number:'1.2-2' }}</td>
                <td class="right">{{ row.apprenticeTraining | number:'1.2-2' }}</td>
                <td class="right">{{ row.otherC | number:'1.2-2' }}</td>
                <td class="right">{{ row.otherD | number:'1.2-2' }}</td>
                <td class="right">{{ row.total | number:'1.2-2' }}</td>
                <td>{{ row.explanation }}</td>
                <td>{{ row.planName }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class CprFormPrintComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) week!: CertifiedPayrollWeek;
  @Input({ required: true }) entries!: CertifiedPayrollEntry[];
  @Input() payrollNumber = '01';

  private cprData = inject(CertifiedPayrollDataService);

  readonly dayLabels = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'] as const;

  weekEndingLabel = computed(() =>
    formatCprShortDate(normalizeWeekEndingToSaturday(this.week.weekEnding)),
  );

  weekDates = computed(() => workWeekDatesSunThroughSat(this.week.weekEnding));

  page1Rows = computed(() => {
    const employeeInfo = this.cprData.getEmployeePayrollInfoSnapshot();
    const adpDetails = this.cprData.getAdpPayrollDetailsSnapshot();
    const dates = this.weekDates();

    return this.entries.map(entry => {
      const empInfo = this.findEmployeeInfo(employeeInfo, entry.employeeName);
      const adp = this.findAdp(adpDetails, entry.employeeName);
      const addressParts = [empInfo?.address, empInfo?.city, empInfo?.state, empInfo?.zip].filter(Boolean);
      return buildCprPage1Row({
        entry,
        weekDates: dates,
        adp,
        displayName: empInfo?.legalName,
        address: addressParts.join(' ') || undefined,
      });
    });
  });

  page2Rows = computed(() => {
    const employeeInfo = this.cprData.getEmployeePayrollInfoSnapshot();
    return this.entries.map(entry => {
      const empInfo = this.findEmployeeInfo(employeeInfo, entry.employeeName);
      return buildCprPage2Row(entry, empInfo?.legalName);
    });
  });

  dayDate(index: number): string {
    const date = this.weekDates()[index];
    return date ? formatCprShortDate(date) : '';
  }

  publicBodyLine(): string {
    return [
      this.project.publicBodyAddress,
      this.project.publicBodyCity,
      this.project.publicBodyState,
      this.project.publicBodyZip,
    ].filter(Boolean).join(' ') || '—';
  }

  projectAndLocation(): string {
    return [this.project.projectName, this.project.address, this.project.city, this.project.state]
      .filter(Boolean)
      .join(', ');
  }

  private findEmployeeInfo(rows: EmployeePayrollInfo[], name: string): EmployeePayrollInfo | undefined {
    const key = normalizeEmployeeKey(name);
    return rows.find(r => r.employeeKey === key);
  }

  private findAdp(rows: AdpPayrollDetail[], name: string): AdpPayrollDetail | undefined {
    return findAdpPayrollDetail(rows, normalizeEmployeeKey(name), this.week.weekEnding);
  }
}
