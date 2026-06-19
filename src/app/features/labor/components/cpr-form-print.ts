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
import { normalizeEmployeeKey } from '@features/labor/utils/certified-payroll-week';
import { fringeRateForClassification } from '@features/labor/utils/fringe-rates-seed';

interface DayHours {
  regular: number;
  overtime: number;
}

interface Page1Row {
  name: string;
  address: string;
  occupation: string;
  stHours: number[];
  otHours: number[];
  totalSt: number;
  totalOt: number;
  stRate: number;
  otRate: number;
  projectGross: number;
  weekGross: number;
  ficaMed: number;
  fedStateTax: number;
  unionDues: number;
  vacationDeduction: number;
  totalDeductions: number;
  netPay: number;
}

interface Page2Row {
  name: string;
  healthWelfare: number;
  pension: number;
  vacation: number;
  holiday: number;
  apprenticeTraining: number;
  otherC: number;
  otherD: number;
  total: number;
  explanation: string;
  planName: string;
}

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
            <td class="center">{{ week.weekEnding }}</td>
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
  @Input() payrollNumber = '001';

  private cprData = inject(CertifiedPayrollDataService);

  readonly dayLabels = ['SU', 'M', 'T', 'W', 'TH', 'F', 'S'] as const;

  weekDates = computed(() => {
    const end = new Date(`${this.week.weekEnding}T12:00:00`);
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  });

  displayDates = computed(() => {
    const dates = this.weekDates();
    return [dates[6], dates[0], dates[1], dates[2], dates[3], dates[4], dates[5]];
  });

  page1Rows = computed((): Page1Row[] => {
    const employeeInfo = this.cprData.getEmployeePayrollInfoSnapshot();
    const adpDetails = this.cprData.getAdpPayrollDetailsSnapshot();
    const dates = this.displayDates();

    return this.entries.map(entry => {
      const fringe = fringeRateForClassification(entry.classification);
      const empInfo = this.findEmployeeInfo(employeeInfo, entry.employeeName);
      const adp = this.findAdp(adpDetails, entry.employeeName);
      const dayMap = new Map(entry.dailyHours.map(d => [d.workDate.slice(0, 10), d]));

      const stHours = dates.map(date => dayMap.get(date)?.regularHours ?? 0);
      const otHours = dates.map(date => dayMap.get(date)?.overtimeHours ?? 0);
      const totalSt = entry.regularHours;
      const totalOt = entry.overtimeHours;
      const stRate = entry.baseRate ?? 0;
      const otRate = stRate * 1.5;
      const projectGross = entry.regularWage + entry.overtimeWage;
      const weekGross = adp?.grossPay ?? entry.grossPackage;
      const ficaMed = weekGross * 0.0765;
      const fedStateTax = Math.max(0, weekGross - ficaMed) * 0.12;
      const unionDues = (fringe?.dues ?? 0) * entry.totalHours;
      const vacationDeduction = (fringe?.vacationDeduction ?? 0) * entry.totalHours;
      const totalDeductions = ficaMed + fedStateTax + unionDues + vacationDeduction;
      const netPay = Math.max(0, weekGross - totalDeductions);

      const addressParts = [empInfo?.address, empInfo?.city, empInfo?.state, empInfo?.zip].filter(Boolean);

      return {
        name: empInfo?.legalName || entry.employeeName,
        address: addressParts.join(' ') || '—',
        occupation: entry.classification,
        stHours,
        otHours,
        totalSt,
        totalOt,
        stRate,
        otRate,
        projectGross,
        weekGross,
        ficaMed,
        fedStateTax,
        unionDues,
        vacationDeduction,
        totalDeductions,
        netPay,
      };
    });
  });

  page2Rows = computed((): Page2Row[] => {
    return this.entries.map(entry => {
      const fringe = fringeRateForClassification(entry.classification);
      if (!fringe) {
        return {
          name: entry.employeeName,
          healthWelfare: 0,
          pension: 0,
          vacation: 0,
          holiday: 0,
          apprenticeTraining: 0,
          otherC: 0,
          otherD: 0,
          total: 0,
          explanation: entry.classification,
          planName: '—',
        };
      }
      return {
        name: entry.employeeName,
        healthWelfare: fringe.healthWelfare,
        pension: fringe.pension,
        vacation: 0,
        holiday: 0,
        apprenticeTraining: fringe.apprenticeTraining,
        otherC: fringe.iaf + fringe.citf + fringe.annuity,
        otherD: 0,
        total: fringe.totalEmployer,
        explanation: 'Other A: Union Dues, Other C: IAF / CITF / Annuity, Other B: Vacation',
        planName: 'Mid American Carpenters Union',
      };
    });
  });

  dayDate(index: number): string {
    const date = this.displayDates()[index];
    if (!date) return '';
    const [, m, d] = date.split('-');
    return `${m}/${d}`;
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
    const key = normalizeEmployeeKey(name);
    return rows.find(r => r.employeeKey === key && r.payPeriodEnding === this.week.weekEnding);
  }
}
