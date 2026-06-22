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
import { resolveAdpPayrollDetail } from '@features/labor/utils/cpr-name-match.util';
import {
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

    /* LS-57-3 Statement of Compliance styles */
    .ls57 { font-size: 9pt; font-family: Arial, sans-serif; line-height: 1.5; padding: 8px; }
    .ls57-date { margin-bottom: 10px; }
    .ls57-signatory { margin-bottom: 10px; }
    .ls57-line {
      display: inline-block;
      border-bottom: 1px solid #000;
      vertical-align: bottom;
      padding: 0 2px;
    }
    .ls57-para { margin-bottom: 14px; text-align: justify; }
    .ls57-sig-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    .ls57-sig-table td { border: 1px solid #000; }
    .ls57-warning-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .ls57-warning-table td { border: 1px solid #000; padding: 4px 6px; font-style: italic; font-size: 8pt; }
    .ls57-footer { font-style: italic; font-size: 7.5pt; text-align: center; color: #444; margin-top: 16px; }
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
          the applicable prevailing wage fringe benefit requirements. Employer-paid fringe benefit rates shown below
          are per hour worked, per the KC1 Commercial Carpenter Agreement 2026-2027.
        </p>
        <table>
          <thead>
            <tr class="header-cell">
              <th>Employee Name</th>
              <th class="center">H&amp;W<br/>($/hr)</th>
              <th class="center">Pension<br/>($/hr)</th>
              <th class="center">Vacation<br/>($/hr)</th>
              <th class="center">Holiday<br/>($/hr)</th>
              <th class="center">Apprentice<br/>Training ($/hr)</th>
              <th class="center">Other C<br/>(IAF/CITF/Ann)</th>
              <th class="center">Other D</th>
              <th class="center">Total<br/>($/hr)</th>
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

      <!-- PAGE 3 — Missouri LS-57-3 Statement of Compliance -->
      <section class="cpr-page-break ls57">

        <!-- Date line -->
        <div class="ls57-date">
          Date: <span class="ls57-line" style="min-width:180px;">&nbsp;</span>
        </div>

        <!-- Signatory line -->
        <div class="ls57-signatory">
          I,&nbsp;
          <span class="ls57-line" style="min-width:300px;">&nbsp;</span>
          &nbsp;<em>(Name of Signatory Party)</em>,&nbsp;
          <span class="ls57-line" style="min-width:200px;">&nbsp;</span>
          &nbsp;<em>(Title)</em>&nbsp;do hereby state:
        </div>

        <!-- Paragraph 1 -->
        <div class="ls57-para">
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1) That I pay or supervise the payment of the persons employed by
          <span class="ls57-line" style="min-width:260px;">Brighten Builders, LLC</span>
          <em>(Contractor or Subcontractor)</em> on the
          <span class="ls57-line" style="min-width:200px;">{{ buildingOrWork() }}</span>
          <em>(Building or Work)</em>;
          that during the payroll period commencing seven (7) days prior to the week ending date of
          <span class="ls57-line" style="min-width:90px;">{{ weekEndingLabel() }}</span>
          all persons employed on said project have been paid the full weekly wages stated above,
          that no rebates have been or will be made either directly or indirectly to or on behalf of
          <span class="ls57-line" style="min-width:260px;">Brighten Builders, LLC</span>
          <em>(Contractor or Subcontractor)</em>,
          from the full weekly wages earned by any person and that no deductions have been made
          either directly or indirectly from the full wages earned by any person, other than legally
          permissible deductions, that full and accurate records clearly indicating the names,
          occupations, and crafts of every worker employed by them in connection with the public work
          together with an accurate record of the number of hours worked by each worker and the actual
          wages paid for each class or type of work performed and deduction made for each worker have
          been prepared, that these payroll records are kept and have been provided for inspection to
          the authorized representative of the contracting public body and will be available as often
          as may be necessary and such records shall not be destroyed or removed from the state for
          the period of one year following the completion of the public work in connection with which
          the records are made.
        </div>

        <!-- Paragraph 2 -->
        <div class="ls57-para">
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2) That any payrolls otherwise under this contract required
          to be submitted for the above period are correct and complete; that the wage rates for
          laborers or mechanics contained therein are not less than the applicable wage rates
          contained in any wage order incorporated into the contract; that the occupational title
          set forth herein for each laborer or mechanic conform with the work performed.
        </div>

        <!-- Signature block -->
        <table class="ls57-sig-table">
          <tr>
            <td style="width:50%;padding:4px 6px;">Name and Title</td>
            <td style="width:50%;padding:4px 6px;">Signature</td>
          </tr>
          <tr>
            <td style="height:56px;padding:4px 6px;">&nbsp;</td>
            <td style="height:56px;padding:4px 6px;">&nbsp;</td>
          </tr>
        </table>

        <!-- Legal warning inside border -->
        <table class="ls57-warning-table">
          <tr>
            <td>
              The falsification of any of the above statements may subject the contractor or
              subcontractor to criminal prosecution. See Sections 290.340, 570.090, 575.050,
              and 575.060, RSMo.
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <div class="ls57-footer">
          Missouri Department of Labor and Industrial Relations is an equal opportunity employer/program.<br/>
          TDD/TTY: 800-735-2966 &nbsp;&nbsp; Relay Missouri: 711
          <span style="float:right;">LS-57-3 (08-18) AI</span>
        </div>
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

  buildingOrWork(): string {
    return [this.project.projectName, this.project.address, this.project.city, this.project.state]
      .filter(Boolean)
      .join(', ') || '';
  }

  private findEmployeeInfo(rows: EmployeePayrollInfo[], name: string): EmployeePayrollInfo | undefined {
    const key = normalizeEmployeeKey(name);
    return rows.find(r => r.employeeKey === key);
  }

  private findAdp(rows: AdpPayrollDetail[], name: string): AdpPayrollDetail | undefined {
    const match = resolveAdpPayrollDetail({
      timelogEmployee: name,
      weekEnding: this.week.weekEnding,
      adpDetails: rows,
      memory: this.cprData.getCprMemorySnapshot(),
      employeeInfo: this.cprData.getEmployeePayrollInfoSnapshot(),
    });
    return match.detail;
  }
}
