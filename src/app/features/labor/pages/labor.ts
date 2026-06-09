import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { ChartCardComponent } from '@app/components/ui/chart-card';
import { DonutChartComponent } from '@app/components/charts/donut-chart';
import { StackedBarChartComponent } from '@app/components/charts/stacked-bar-chart';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { DataService } from '@core/services/data.service';
import { LaborCodeMappingService } from '@features/labor/services/labor-code-mapping.service';
import { LABOR_SHEET } from '@app/config/labor-sheet.config';
import { isNonUnionEmployee } from '@features/labor/utils/labor-normalizers';
import { groupHoursByLaborCode } from '@features/labor/utils/labor-hours-by-code.compute';
import {
  enrichLaborCodeHoursRow,
  filterLaborCodeRows,
} from '@features/labor/utils/labor-code-mapping.compute';
import { LaborCodeFilter } from '@app/models/labor-code-mapping.types';
import { LaborException, LaborExceptionType } from '@app/models/labor.types';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { isWorkCompAuditEnabled, shouldShowWorkCompAudit } from '@app/config/feature-setup.config';
import {
  buildClassificationLaborRows,
  computeLaborBudgetSummary,
  normalizeJobNumberKey,
  summarizeClassificationLabor,
} from '@features/labor/utils/labor-by-classification.compute';
import { isClosedProject, isOverheadJob } from '@shared/utils/project';
import { downloadCsv } from '@shared/utils/csv-export';

type LaborTab = 'overview' | 'byClass' | 'employees' | 'rates' | 'accrual' | 'laborCode' | 'exceptions';

@Component({
  selector: 'app-labor',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusChipComponent,
    ChartCardComponent,
    DonutChartComponent,
    StackedBarChartComponent,
  ],
  providers: [CurrencyPipe, DecimalPipe],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
        Read-only labor accrual from Google Sheets timekeeper rows
        (<strong>Approval Status = Approved</strong>).
        QBO actual labor from bundled Project costs detail report.
        Rates match Employee Summary → Classification → {{ defaultArea }} default.
        Admin / office staff are treated as non-union (no union fringe).
        @if (laborData.refreshStatus().lastRefreshAt) {
          <span class="block mt-1 text-slate-500">
            Last refreshed {{ laborData.refreshStatus().lastRefreshAt | date:'medium' }}
            · {{ laborData.refreshStatus().approvedRowCount }} approved rows
            · {{ laborData.refreshStatus().rateCount }} rates
          </span>
        }
        @if (laborData.refreshStatus().error) {
          <span class="block mt-1 text-rose-600">{{ laborData.refreshStatus().error }}</span>
        }
      </div>

      <app-page-header
        title="Labor"
        subtitle="Approved timekeeper hours · union wage &amp; fringe package · monthly accrual vs QBO."
        [hasActions]="true">
        <button type="button" (click)="refresh()" [disabled]="laborData.loading()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ laborData.loading() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          Refresh from Sheets
        </button>
        <a [href]="sheetUrl" target="_blank" rel="noopener"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">open_in_new</mat-icon> Timekeeper Sheet
        </a>
      </app-page-header>

      <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        @for (tab of tabs; track tab.id) {
          <button type="button" (click)="activeTab.set(tab.id)"
                  class="px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors shrink-0"
                  [class.bg-slate-900]="activeTab() === tab.id"
                  [class.text-white]="activeTab() === tab.id"
                  [class.text-slate-500]="activeTab() !== tab.id"
                  [class.hover:text-slate-900]="activeTab() !== tab.id"
                  [class.hover:bg-slate-50]="activeTab() !== tab.id">
            <mat-icon class="!text-[16px] align-middle mr-1">{{ tab.icon }}</mat-icon>
            {{ tab.label }}
            @if (tab.id === 'exceptions' && laborData.exceptions().length) {
              <span class="ml-1 text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full">{{ laborData.exceptions().length }}</span>
            }
          </button>
        }
      </div>

      @if (activeTab() === 'overview') {
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
          <app-stat-card label="Approved Hrs (Month)" [value]="fmtHours(kpis().approvedHoursThisMonth)" icon="schedule" />
          <app-stat-card label="Est. Wage Cost" [value]="fmtMoney(kpis().estimatedWageCost)" icon="payments" />
          <app-stat-card label="Est. Fringe Cost" [value]="fmtMoney(kpis().estimatedFringeCost)" icon="health_and_safety" />
          <app-stat-card label="Est. Total Labor" [value]="fmtMoney(kpis().estimatedTotalLabor)" icon="engineering" />
          <app-stat-card label="Not Yet in QBO" [value]="fmtMoney(kpis().laborNotYetInQbo)" icon="account_balance" />
          <app-stat-card label="Missing Rates" [value]="fmtCount(kpis().missingRates)" icon="warning" />
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <app-chart-card title="Wage vs Fringe (This Month)" subtitle="Estimated from approved hours">
            <app-donut-chart [slices]="wageFringeDonut()" />
          </app-chart-card>
          <app-chart-card title="Hours by Project (This Month)" subtitle="Approved timekeeper rows">
            <app-stacked-bar-chart
              [labels]="hoursByProject().labels"
              [data]="hoursByProject().rows"
              [series]="hoursSeries" />
          </app-chart-card>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <app-chart-card title="Hours by Labor Code (This Month)" subtitle="Regular + OT + DT">
            <app-stacked-bar-chart
              [labels]="hoursByLaborCode().labels"
              [data]="hoursByLaborCode().rows"
              [series]="laborCodeSeries" />
          </app-chart-card>
        </div>

        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
            <h3 class="font-bold text-slate-900">Recent Approved Time</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Date</th>
                  <th class="px-4 py-3 text-left">Employee</th>
                  <th class="px-4 py-3 text-left">Job</th>
                  <th class="px-4 py-3 text-left">Labor Code</th>
                  <th class="px-4 py-3 text-left">Class</th>
                  <th class="px-4 py-3 text-right">Hours</th>
                  <th class="px-4 py-3 text-right">Est. Total</th>
                  <th class="px-4 py-3 text-left">Rate</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of recentEntries(); track row.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3">{{ row.workDate || '—' }}</td>
                    <td class="px-4 py-3 font-medium">{{ row.employeeName || '—' }}</td>
                    <td class="px-4 py-3">{{ row.jobIdLabel || '—' }}</td>
                    <td class="px-4 py-3 font-numeric text-xs">{{ row.laborCode || '—' }}</td>
                    <td class="px-4 py-3">{{ row.classification || '—' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.estimatedLaborTotal) }}</td>
                    <td class="px-4 py-3">
                      @if (row.rateMissing) {
                        <app-status-chip tone="red">Missing</app-status-chip>
                      } @else {
                        <span class="text-xs text-slate-500">{{ row.rateSource }}</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="px-4 py-10 text-center text-slate-400 italic">No approved timekeeper rows loaded.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'byClass') {
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <label class="text-sm text-slate-600 font-semibold">Month</label>
          <select [value]="classMonth()" (change)="onClassMonthChange($event)"
                  class="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            <option value="all">All loaded months</option>
            @for (month of availableMonths(); track month) {
              <option [value]="month">{{ month }}</option>
            }
          </select>
          <span class="text-xs text-slate-500">
            Estimated wages + fringe from approved hours, across {{ activeJobCount() }} active jobs.
          </span>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <app-stat-card label="Labor Budget (Active Jobs)" [value]="fmtMoney(budgetSummary().totalLaborBudget)" icon="account_balance_wallet" />
          <app-stat-card label="Est. Labor To-Date" [value]="fmtMoney(budgetSummary().estLaborToDate)" icon="engineering" />
          <app-stat-card label="Budget Used"
                         [value]="budgetSummary().totalLaborBudget > 0 ? fmtPct(budgetSummary().pctUsed) : 'No budget'"
                         icon="percent" />
          <app-stat-card label="Remaining" [value]="fmtMoney(budgetSummary().remaining)" icon="savings" />
        </div>

        @if (budgetSummary().totalLaborBudget > 0) {
          <div class="bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-6">
            <div class="flex items-center justify-between text-sm mb-2">
              <span class="font-semibold text-slate-700">Labor budget consumed (to-date)</span>
              <span class="font-numeric font-bold"
                    [class.text-rose-600]="budgetSummary().pctUsed > 1"
                    [class.text-emerald-600]="budgetSummary().pctUsed <= 1">
                {{ fmtPct(budgetSummary().pctUsed) }}
              </span>
            </div>
            <div class="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full transition-all"
                   [class.bg-emerald-500]="budgetSummary().pctUsed <= 0.85"
                   [class.bg-amber-500]="budgetSummary().pctUsed > 0.85 && budgetSummary().pctUsed <= 1"
                   [class.bg-rose-500]="budgetSummary().pctUsed > 1"
                   [style.width.%]="budgetBarWidth()"></div>
            </div>
            @if (budgetSummary().jobsMissingBudget > 0) {
              <p class="text-xs text-amber-700 mt-2">
                {{ budgetSummary().jobsMissingBudget }} active job{{ budgetSummary().jobsMissingBudget === 1 ? '' : 's' }}
                missing a labor budget — % used reflects only jobs with a budget.
              </p>
            }
          </div>
        } @else {
          <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-6">
            No labor budget found on active jobs yet. Budget comparison will appear once Labor budget lines exist.
          </div>
        }

        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-bold text-slate-900">Estimated Labor by Classification</h3>
              <p class="text-xs text-slate-500">Wages (reg + OT + DT) plus union fringe · {{ classMonthLabel() }}</p>
            </div>
            <button type="button" (click)="exportByClass()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Export CSV
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Classification</th>
                  <th class="px-4 py-3 text-right">Regular</th>
                  <th class="px-4 py-3 text-right">OT</th>
                  <th class="px-4 py-3 text-right">DT</th>
                  <th class="px-4 py-3 text-right">Total Hrs</th>
                  <th class="px-4 py-3 text-right">Est. Wage</th>
                  <th class="px-4 py-3 text-right">Est. Fringe</th>
                  <th class="px-4 py-3 text-right">Est. Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of classRows(); track row.classification) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 font-medium">
                      {{ row.classification }}
                      @if (row.hasMissingRate) {
                        <span class="ml-1 text-[10px] font-bold uppercase text-rose-600">Missing rate</span>
                      }
                    </td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.regularHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.overtimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.doubleTimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.wageCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.fringeCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ fmtMoney(row.estimatedLaborTotal) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="px-4 py-10 text-center text-slate-400 italic">No approved time for active jobs this period.</td></tr>
                }
              </tbody>
              @if (classRows().length) {
                <tfoot class="bg-slate-50 border-t font-bold">
                  <tr>
                    <td class="px-4 py-3">Total</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ classTotals().regularHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ classTotals().overtimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ classTotals().doubleTimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ classTotals().totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(classTotals().wageCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(classTotals().fringeCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(classTotals().estimatedLaborTotal) }}</td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'employees') {
        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Employee</th>
                  <th class="px-4 py-3 text-left">Status</th>
                  <th class="px-4 py-3 text-left">Default Class</th>
                  <th class="px-4 py-3 text-left">Union / Area</th>
                  <th class="px-4 py-3 text-right">Base Rate</th>
                  <th class="px-4 py-3 text-center">Fringe Elig.</th>
                  <th class="px-4 py-3 text-left">QBO Match</th>
                  <th class="px-4 py-3 text-center">Timekeeper</th>
                  <th class="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (emp of laborData.employeeRows(); track emp.employeeName) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 font-medium">{{ emp.employeeName }}</td>
                    <td class="px-4 py-3">{{ emp.status || '—' }}</td>
                    <td class="px-4 py-3">{{ emp.defaultClassification || '—' }}</td>
                    <td class="px-4 py-3">{{ employeeUnionArea(emp) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ emp.baseRate != null ? fmtMoney(emp.baseRate) + '/hr' : '—' }}</td>
                    <td class="px-4 py-3 text-center">{{ emp.fringeEligible === false ? 'No' : 'Yes' }}</td>
                    <td class="px-4 py-3">{{ emp.qboMatch || '—' }}</td>
                    <td class="px-4 py-3 text-center">
                      <app-status-chip [tone]="emp.timekeeperMatch ? 'green' : 'slate'">
                        {{ emp.timekeeperMatch ? 'Yes' : 'No' }}
                      </app-status-chip>
                    </td>
                    <td class="px-4 py-3 text-slate-500">{{ emp.notes || '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="px-4 py-10 text-center text-slate-400 italic">No employee summary rows loaded.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'rates') {
        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Union / Area</th>
                  <th class="px-4 py-3 text-left">Classification</th>
                  <th class="px-4 py-3 text-right">Base Rate</th>
                  <th class="px-4 py-3 text-right">Fringe Rate</th>
                  <th class="px-4 py-3 text-right">Total Package</th>
                  <th class="px-4 py-3 text-left">Effective</th>
                  <th class="px-4 py-3 text-left">Source</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (rate of laborData.rateRows(); track rate.unionArea + rate.classification) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3">{{ rate.unionArea }}</td>
                    <td class="px-4 py-3 font-medium">{{ rate.classification }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(rate.baseRate) }}/hr</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(rate.fringeRate) }}/hr</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ fmtMoney(rate.totalPackage) }}/hr</td>
                    <td class="px-4 py-3">{{ rate.effectiveDate || '—' }}</td>
                    <td class="px-4 py-3 text-slate-500">{{ rate.source }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'laborCode') {
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <label class="text-sm text-slate-600 font-semibold">Period</label>
          <select [value]="laborCodeMonth()" (change)="onLaborCodeMonthChange($event)"
                  class="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            <option value="all">All approved time</option>
            @for (month of availableMonths(); track month) {
              <option [value]="month">{{ month }}</option>
            }
          </select>
          <label class="text-sm text-slate-600 font-semibold">Filter</label>
          <select [value]="laborCodeFilter()" (change)="onLaborCodeFilterChange($event)"
                  class="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            @for (option of laborCodeFilterOptions; track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
          @if (showWorkCompAudit()) {
            <button type="button" (click)="exportWorkCompAudit()"
                    class="ml-auto bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
              Export Work Comp Audit CSV
            </button>
          }
        </div>

        <div class="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="font-bold text-slate-900">Hours by Labor Code</h3>
              <p class="text-xs text-slate-500">Mapped categories drive WIP, bonus, certified payroll, and work comp rules</p>
            </div>
            <div class="text-sm text-slate-600">
              {{ laborCodeRows().length }} code{{ laborCodeRows().length === 1 ? '' : 's' }}
              · {{ laborCodeTotalHours() | number:'1.1-1' }} total hrs
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Labor Code</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-right">Regular</th>
                  <th class="px-4 py-3 text-right">OT</th>
                  <th class="px-4 py-3 text-right">DT</th>
                  <th class="px-4 py-3 text-right">Total Hrs</th>
                  <th class="px-4 py-3 text-right">Est. Wage</th>
                  <th class="px-4 py-3 text-right">Est. Fringe</th>
                  <th class="px-4 py-3 text-right">Est. Total</th>
                  <th class="px-4 py-3 text-right">Rows</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of laborCodeRows(); track row.laborCode) {
                  <tr class="hover:bg-slate-50"
                      [class.bg-amber-50]="row.unassigned || row.unmapped"
                      [class.bg-slate-50]="row.excluded && !row.unassigned && !row.unmapped">
                    <td class="px-4 py-3">
                      <div class="font-numeric font-semibold">{{ row.laborCode }}</div>
                      @if (row.displayName && row.displayName !== row.laborCode) {
                        <div class="text-xs text-slate-500">{{ row.displayName }}</div>
                      }
                      @if (row.unassigned || row.unmapped) {
                        <span class="text-[10px] font-bold uppercase text-amber-700">Needs mapping</span>
                      }
                    </td>
                    <td class="px-4 py-3">
                      @if (row.categoryLabel) {
                        <span>{{ row.categoryLabel }}</span>
                      } @else {
                        <span class="text-amber-700 italic">Unmapped</span>
                      }
                    </td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.regularHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.overtimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.doubleTimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.wageCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.fringeCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ fmtMoney(row.totalCost) }}</td>
                    <td class="px-4 py-3 text-right text-slate-500">{{ row.rowCount }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="10" class="px-4 py-10 text-center text-slate-400 italic">No approved time for this period.</td></tr>
                }
              </tbody>
              @if (laborCodeRows().length) {
                <tfoot class="bg-slate-50 border-t font-bold">
                  <tr>
                    <td class="px-4 py-3" colspan="2">Total</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ laborCodeTotals().regularHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ laborCodeTotals().overtimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ laborCodeTotals().doubleTimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ laborCodeTotals().totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(laborCodeTotals().wageCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(laborCodeTotals().fringeCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(laborCodeTotals().totalCost) }}</td>
                    <td class="px-4 py-3 text-right">{{ laborCodeTotals().rowCount }}</td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'accrual') {
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <button type="button" (click)="shiftAccrualPeriod(-1)"
                  class="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <mat-icon class="!text-[18px] align-middle">chevron_left</mat-icon>
          </button>
          <span class="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">{{ accrualPeriodLabel() }}</span>
          <button type="button" (click)="shiftAccrualPeriod(1)"
                  class="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            <mat-icon class="!text-[18px] align-middle">chevron_right</mat-icon>
          </button>
        </div>
        <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-widest font-bold">
                <tr>
                  <th class="px-4 py-3 text-left">Month</th>
                  <th class="px-4 py-3 text-left">Project</th>
                  <th class="px-4 py-3 text-left">Employee</th>
                  <th class="px-4 py-3 text-left">Labor Code</th>
                  <th class="px-4 py-3 text-left">Class</th>
                  <th class="px-4 py-3 text-right">Hours</th>
                  <th class="px-4 py-3 text-right">Wage</th>
                  <th class="px-4 py-3 text-right">Fringe</th>
                  <th class="px-4 py-3 text-right">Est. Total</th>
                  <th class="px-4 py-3 text-right">QBO Actual</th>
                  <th class="px-4 py-3 text-right">Not in QBO</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of accrualRows(); track row.id) {
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-numeric">{{ row.month }}</td>
                    <td class="px-4 py-3">
                      <div class="font-medium">J{{ row.projectNo }}</div>
                      @if (row.projectName) { <div class="text-xs text-slate-500">{{ row.projectName }}</div> }
                    </td>
                    <td class="px-4 py-3">{{ row.employeeName }}</td>
                    <td class="px-4 py-3 font-numeric text-xs">{{ row.laborCode || '—' }}</td>
                    <td class="px-4 py-3">{{ row.classification }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.wageCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ fmtMoney(row.fringeCost) }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ fmtMoney(row.estimatedLaborTotal) }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.qbActualLaborCost != null ? fmtMoney(row.qbActualLaborCost) : '—' }}</td>
                    <td class="px-4 py-3 text-right font-numeric" [class.text-amber-700]="(row.laborNotYetInQb ?? 0) > 0">
                      {{ row.laborNotYetInQb != null ? fmtMoney(row.laborNotYetInQb) : '—' }}
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="11" class="px-4 py-10 text-center text-slate-400 italic">No monthly accrual rows yet.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (activeTab() === 'exceptions') {
        <div class="space-y-3">
          @for (ex of laborData.exceptions(); track ex.id) {
            <div class="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex items-start gap-4">
              <app-status-chip [tone]="exceptionTone(ex)">{{ exceptionLabel(ex.type) }}</app-status-chip>
              <div class="min-w-0 flex-1">
                <div class="font-bold text-slate-900">{{ ex.title }}</div>
                <div class="text-sm text-slate-600 mt-1">{{ ex.description }}</div>
              </div>
              @if (ex.estimatedCost) {
                <div class="text-sm font-numeric text-slate-700 shrink-0">{{ fmtMoney(ex.estimatedCost) }}</div>
              }
            </div>
          } @empty {
            <div class="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-400 italic">
              No labor exceptions detected.
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Labor {
  laborData = inject(LaborDataService);
  private data = inject(DataService);
  private laborCodeMapping = inject(LaborCodeMappingService);
  private globalNeeds = inject(GlobalNeedsService);
  private currency = inject(CurrencyPipe);

  showWorkCompAudit = computed(() => shouldShowWorkCompAudit({
    showAllTools: this.globalNeeds.showAllTools(),
    auditModeEnabled: isWorkCompAuditEnabled(),
  }));

  private laborCodeMappings = toSignal(this.data.getLaborCodeMappings(), { initialValue: [] });
  private firestoreActuals = toSignal(this.data.getProjectLaborActuals(), { initialValue: [] });
  private projects = toSignal(this.data.getProjects(), { initialValue: [] });
  private budgetLines = toSignal(this.data.getBudgetLines(), { initialValue: [] });

  defaultArea = LABOR_SHEET.defaultUnionArea;
  sheetUrl = LABOR_SHEET.url;
  activeTab = signal<LaborTab>('overview');
  laborCodeMonth = signal<string>(currentMonthKey());
  laborCodeFilter = signal<LaborCodeFilter>('all');
  classMonth = signal<string>(currentMonthKey());
  accrualPeriod = signal<string>(currentMonthKey());

  laborCodeFilterOptions: { id: LaborCodeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'wipEligible', label: 'WIP eligible' },
    { id: 'bonusEligible', label: 'Bonus eligible' },
    { id: 'certifiedPayrollEligible', label: 'Certified payroll eligible' },
    { id: 'excluded', label: 'Excluded' },
    { id: 'unassigned', label: 'Unassigned' },
  ];

  tabs: { id: LaborTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'byClass', label: 'By Classification', icon: 'badge' },
    { id: 'laborCode', label: 'By Labor Code', icon: 'category' },
    { id: 'employees', label: 'Employees', icon: 'groups' },
    { id: 'rates', label: 'Rates', icon: 'price_change' },
    { id: 'accrual', label: 'Monthly Accrual', icon: 'calendar_month' },
    { id: 'exceptions', label: 'Exceptions', icon: 'report_problem' },
  ];

  readonly hoursSeries = [
    { key: 'hours', label: 'Hours', color: '#3b82f6' },
  ];

  readonly laborCodeSeries = [
    { key: 'regular', label: 'Regular', color: '#3b82f6' },
    { key: 'overtime', label: 'OT', color: '#f59e0b' },
    { key: 'doubleTime', label: 'DT', color: '#ef4444' },
  ];

  kpis = this.laborData.overviewKpis;

  recentEntries = computed(() =>
    [...this.laborData.normalizedEntries()]
      .sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''))
      .slice(0, 25),
  );

  wageFringeDonut = computed(() => {
    const k = this.kpis();
    return [
      { label: 'Wage', value: k.estimatedWageCost, color: '#3b82f6' },
      { label: 'Fringe', value: k.estimatedFringeCost, color: '#10b981' },
    ];
  });

  hoursByProject = computed(() => {
    const month = currentMonthKey();
    const byProject = new Map<string, number>();
    for (const entry of this.laborData.normalizedEntries()) {
      if (entry.month !== month) continue;
      const label = entry.jobIdLabel ?? entry.projectNumber ?? 'Unknown';
      byProject.set(label, (byProject.get(label) ?? 0) + entry.totalHours);
    }
    const sorted = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      labels: sorted.map(([label]) => label),
      rows: sorted.map(([, hours]) => ({ hours })),
    };
  });

  availableMonths = computed(() =>
    [...new Set(this.laborData.normalizedEntries().map(e => e.month).filter(Boolean))].sort().reverse(),
  );

  private activeProjects = computed(() =>
    (this.projects() ?? []).filter(p => !isOverheadJob(p) && !isClosedProject(p)),
  );

  activeJobCount = computed(() => this.activeProjects().length);

  /** Approved labor entries scoped to active (non-closed, non-overhead) jobs. */
  private activeEntries = computed(() => {
    const active = this.activeProjects();
    const activeIds = new Set(active.map(p => p.id));
    const activeNums = new Set(active.map(p => normalizeJobNumberKey(p.projectNumber)).filter(Boolean));
    return this.laborData.normalizedEntries().filter(e => {
      if (e.projectId && activeIds.has(e.projectId)) return true;
      const num = normalizeJobNumberKey(e.projectNumber ?? e.jobIdLabel);
      return num ? activeNums.has(num) : false;
    });
  });

  classRows = computed(() => buildClassificationLaborRows(this.activeEntries(), this.classMonth()));

  classTotals = computed(() => summarizeClassificationLabor(this.classRows()));

  budgetSummary = computed(() =>
    computeLaborBudgetSummary(this.activeProjects(), this.budgetLines() ?? [], this.activeEntries()),
  );

  budgetBarWidth = computed(() => Math.min(100, Math.round(this.budgetSummary().pctUsed * 100)));

  classMonthLabel = computed(() => (this.classMonth() === 'all' ? 'All loaded months' : this.classMonth()));

  laborCodeEntries = computed(() => {
    const month = this.laborCodeMonth();
    return this.laborData.normalizedEntries().filter(entry =>
      month === 'all' ? true : entry.month === month,
    );
  });

  laborCodeRows = computed(() => {
    const mappings = this.laborCodeMappings();
    const grouped = groupHoursByLaborCode(
      this.laborCodeEntries(),
      entry => entry.estimatedLaborTotal ?? 0,
    );
    const enriched = grouped.map(row => {
      const entries = this.laborCodeEntries().filter(e =>
        ((e.laborCode ?? '').trim() || '— Unassigned') === row.laborCode,
      );
      const wageCost = entries.reduce((sum, e) => sum + (e.wageCost ?? 0), 0);
      const fringeCost = entries.reduce((sum, e) => sum + (e.fringeCost ?? 0), 0);
      return enrichLaborCodeHoursRow(row.laborCode, row, mappings, wageCost, fringeCost);
    });
    return filterLaborCodeRows(enriched, this.laborCodeFilter(), mappings);
  });

  laborCodeTotals = computed(() =>
    this.laborCodeRows().reduce(
      (acc, row) => ({
        regularHours: acc.regularHours + row.regularHours,
        overtimeHours: acc.overtimeHours + row.overtimeHours,
        doubleTimeHours: acc.doubleTimeHours + row.doubleTimeHours,
        totalHours: acc.totalHours + row.totalHours,
        wageCost: acc.wageCost + row.wageCost,
        fringeCost: acc.fringeCost + row.fringeCost,
        totalCost: acc.totalCost + row.totalCost,
        rowCount: acc.rowCount + row.rowCount,
      }),
      {
        regularHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        totalHours: 0,
        wageCost: 0,
        fringeCost: 0,
        totalCost: 0,
        rowCount: 0,
      },
    ),
  );

  laborCodeTotalHours = computed(() => this.laborCodeTotals().totalHours);

  accrualPeriodLabel = computed(() => {
    const p = this.accrualPeriod();
    const [y, m] = p.split('-').map(Number);
    if (!y || !m) return p;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  accrualRows = computed(() =>
    this.laborData.monthlyAccruals().filter(row => row.month === this.accrualPeriod()),
  );

  hoursByLaborCode = computed(() => {
    const month = currentMonthKey();
    const rows = groupHoursByLaborCode(
      this.laborData.normalizedEntries().filter(e => e.month === month),
    ).slice(0, 8);
    return {
      labels: rows.map(r => r.laborCode),
      rows: rows.map(r => ({
        regular: r.regularHours,
        overtime: r.overtimeHours,
        doubleTime: r.doubleTimeHours,
      })),
    };
  });

  onLaborCodeMonthChange(event: Event): void {
    this.laborCodeMonth.set((event.target as HTMLSelectElement).value);
  }

  onClassMonthChange(event: Event): void {
    this.classMonth.set((event.target as HTMLSelectElement).value);
  }

  shiftAccrualPeriod(delta: number): void {
    const [y, m] = this.accrualPeriod().split('-').map(Number);
    const d = new Date(y, (m - 1) + delta, 1);
    this.accrualPeriod.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  exportByClass(): void {
    const rows = this.classRows().map(r => [
      r.classification,
      r.regularHours.toFixed(1),
      r.overtimeHours.toFixed(1),
      r.doubleTimeHours.toFixed(1),
      r.totalHours.toFixed(1),
      r.wageCost.toFixed(2),
      r.fringeCost.toFixed(2),
      r.estimatedLaborTotal.toFixed(2),
    ]);
    const month = this.classMonth() === 'all' ? 'all-months' : this.classMonth();
    downloadCsv(
      `labor-by-classification-${month}.csv`,
      ['Classification', 'Regular Hrs', 'OT Hrs', 'DT Hrs', 'Total Hrs', 'Est. Wage', 'Est. Fringe', 'Est. Total'],
      rows,
    );
  }

  fmtPct(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  onLaborCodeFilterChange(event: Event): void {
    this.laborCodeFilter.set((event.target as HTMLSelectElement).value as LaborCodeFilter);
  }

  exportWorkCompAudit(): void {
    const actuals = (this.firestoreActuals() ?? []).filter(a => a.approvalStatus === 'Approved');
    this.laborCodeMapping.exportWorkCompAuditCsv(actuals);
  }

  fmtMoney(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  fmtHours(value: number): string {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;
  }

  fmtCount(value: number): string {
    return String(value);
  }

  employeeUnionArea(emp: { unionArea?: string; defaultClassification?: string; status?: string; fringeEligible?: boolean }): string {
    if (isNonUnionEmployee(emp, emp.defaultClassification)) return 'Non-Union';
    return emp.unionArea || this.defaultArea;
  }

  refresh(): void {
    void this.laborData.refreshFromSheets(true);
  }

  exceptionTone(ex: LaborException): StatusTone {
    return ex.severity === 'error' ? 'red' : 'amber';
  }

  exceptionLabel(type: LaborExceptionType): string {
    const labels: Record<LaborExceptionType, string> = {
      'missing-employee-match': 'Employee',
      'missing-classification': 'Class',
      'missing-base-rate': 'Rate',
      'missing-fringe-rate': 'Fringe',
      'employee-no-qbo-match': 'QBO Emp',
      'project-no-match': 'Project',
      'certified-payroll-non-certified-class': 'Cert Payroll',
      'approved-not-in-qbo': 'Not in QBO',
      'qbo-no-timekeeper-hours': 'QBO Only',
      'office-labor-on-job': 'Office/998',
      'unassigned-labor-code': 'Unassigned',
      'unmapped-labor-code': 'Unmapped',
    };
    return labels[type] ?? type;
  }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
