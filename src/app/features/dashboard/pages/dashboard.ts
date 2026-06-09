import { Component, ChangeDetectionStrategy, inject, computed, signal, effect } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { SyncHealthService } from '@core/services/sync-health.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { ApiClientService } from '@core/services/api/api-client.service';
import { DataService } from '@core/services/data.service';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import {
  buildProjectHoursRows,
  currentLaborMonthKey,
} from '@features/labor/utils/labor-hours-summary.compute';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { ProjectPayAppsApiResponse } from '@core/services/api/project-api.types';
import { mapPayAppsResponse, ProjectSqlPayApp } from '@core/services/api/project-pay-app-api.mapper';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { ChartCardComponent } from '@app/components/ui/chart-card';
import { DonutChartComponent, DonutSlice } from '@app/components/charts/donut-chart';
import {
  buildHomePriorities,
  homeSourceHealthFragment,
  homeSourceHealthRoute,
  isHomeSourceHealthRow,
} from '@shared/utils/home-hub.compute';
import { Active2026ControlRow } from '@app/models/active-2026-control.types';

interface DashboardBillingRecord extends ProjectSqlPayApp {
  projectName: string;
  customer: string;
}

interface DashboardMetric {
  label: string;
  value: string;
  subtext: string;
  icon: string;
  route: string;
}

interface DashboardFinancialMetric {
  label: string;
  value: string;
  subtext: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterLink,
    PageHeaderComponent,
    StatCardComponent,
    StatusChipComponent,
    EmptyStateComponent,
    ChartCardComponent,
    DonutChartComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header
        title="Dashboard"
        [hasActions]="true">
        <a routerLink="/projects"
           class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-800 transition-colors flex items-center gap-2">
          <mat-icon class="!text-[18px]">folder</mat-icon>
          Open Projects
        </a>
        <a routerLink="/billing"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
          <mat-icon class="!text-[18px]">request_quote</mat-icon>
          Review Billing
        </a>
      </app-page-header>

      @if (dashboardError()) {
        <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <mat-icon class="!text-[16px] text-amber-500 shrink-0">warning</mat-icon>
          <span>{{ dashboardError() }}</span>
          <button type="button" (click)="retryDashboard()"
                  class="ml-auto text-xs font-semibold underline hover:text-amber-900 transition-colors">Retry</button>
        </div>
      }

      @if (dashboardLoading()) {
        <div class="animate-pulse space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            @for (i of skeletonSlots; track i) {
              <div class="rounded-xl border border-slate-200 bg-slate-100 h-24"></div>
            }
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-100 h-48"></div>
        </div>
      } @else {

      <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        @for (metric of topMetrics(); track metric.label) {
          <a [routerLink]="metric.route"
             class="block rounded-xl hover:ring-2 hover:ring-indigo-200 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <app-stat-card
              [label]="metric.label"
              [value]="metric.value"
              [subtext]="metric.subtext"
              [icon]="metric.icon" />
          </a>
        }
      </section>

      <div class="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] gap-4">
      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">
              Daily Action Center
              @if (priorities().length) {
                <span class="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full ml-2">{{ priorities().length }}</span>
              }
            </h2>
            
          </div>
          <a routerLink="/active-2026-control"
             class="text-xs font-bold text-indigo-700 hover:text-indigo-800">
            View all follow-up
          </a>
        </div>
        @if (priorities().length) {
          <div class="divide-y divide-slate-100">
            @for (item of priorities(); track item.id) {
              <a [routerLink]="item.route"
                 [queryParams]="item.queryParams"
                 [fragment]="item.fragment"
                 class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    @if (item.jobNumber) {
                      <span class="text-xs font-numeric font-bold text-slate-900">{{ item.jobNumber }}</span>
                      @if (item.projectName) {
                        <span class="text-xs text-slate-500 truncate max-w-[240px]">{{ item.projectName }}</span>
                      }
                    } @else {
                      <span class="text-sm font-semibold text-slate-900">{{ priorityIssueLabel(item.issue) }}</span>
                    }
                    <app-status-chip [tone]="item.severity === 'error' ? 'red' : 'amber'">
                      {{ item.severity === 'error' ? 'Review Needed' : 'Follow Up' }}
                    </app-status-chip>
                    <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400">{{ sourceLabel(item.source) }}</span>
                  </div>
                  @if (item.jobNumber) {
                    <p class="text-sm text-slate-600 mt-0.5">{{ priorityIssueLabel(item.issue) }}</p>
                  }
                </div>
                <span class="shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">
                  {{ priorityActionLabel(item.nextActionLabel) }}
                </span>
              </a>
            }
          </div>
        } @else {
          <div class="p-5">
            <app-empty-state title="No urgent priorities" message="You're caught up for now." />
          </div>
        }
      </section>

      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Billing Snapshot</h2>
            
          </div>
          <a routerLink="/billing" class="text-xs font-bold text-indigo-700 hover:text-indigo-800">Review Billing</a>
        </div>
        @if (billingLoading()) {
          <div class="px-5 py-10 text-center text-slate-400 text-sm">Loading billing records…</div>
        } @else if (billingError()) {
          <div class="px-5 py-8 text-center text-slate-500 text-sm">
            Billing snapshot is not available right now.
          </div>
        } @else if (recentBillingRecords().length) {
          <div class="divide-y divide-slate-100">
            @for (record of recentBillingRecords(); track record.id) {
              <a [routerLink]="['/projects', record.projectId]"
                 [queryParams]="{ section: 'financials', view: 'billing' }"
                 class="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="font-numeric text-xs font-bold text-slate-900">{{ record.jobNumber }}</span>
                    <span class="text-sm font-semibold text-slate-900 truncate max-w-[220px]">{{ record.projectName }}</span>
                    <app-status-chip [tone]="billingTone(record)">{{ billingLabel(record) }}</app-status-chip>
                  </div>
                  <p class="text-xs text-slate-500 truncate mt-0.5">
                    {{ record.payAppNumber || 'Pay App' }} · {{ periodLabel(record) }} · {{ record.sovLineCount }} Schedule of Values lines
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs text-slate-500">Current Due</div>
                  <div class="text-xs font-numeric text-slate-700 font-semibold">{{ currencyOrPending(record.currentPaymentDue) }}</div>
                </div>
              </a>
            }
          </div>
        } @else {
          <div class="p-5">
            <app-empty-state title="No Pay App records yet" message="Billing snapshot will populate when SQL pay apps load." />
          </div>
        }
      </section>
      </div>

      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Active Projects</h2>
            
          </div>
          <a routerLink="/active-2026-control"
             class="text-xs font-bold text-indigo-700 hover:text-indigo-800">
            View all active jobs
          </a>
        </div>
        @if (activeProjectRows().length) {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm min-w-[1120px]">
              <thead>
                <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                  <th class="px-4 py-2">Job #</th>
                  <th class="px-4 py-2">Project</th>
                  <th class="px-4 py-2">Customer</th>
                  <th class="px-4 py-2">Status</th>
                  <th class="px-4 py-2">Billing Status</th>
                  <th class="px-4 py-2 text-right">Contract</th>
                  <th class="px-4 py-2 text-right">Billed</th>
                  <th class="px-4 py-2 text-right">Balance</th>
                  <th class="px-4 py-2">Foreman / PM</th>
                  <th class="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of activeProjectRows(); track row.projectId) {
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2 font-numeric text-xs font-bold text-slate-900">{{ row.jobNumber }}</td>
                    <td class="px-4 py-2">
                      <a [routerLink]="['/projects', row.projectId]" class="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate block max-w-[220px]">
                        {{ row.projectName }}
                      </a>
                    </td>
                    <td class="px-4 py-2 text-xs text-slate-600 truncate max-w-[180px]">{{ row.customer || 'Not available' }}</td>
                    <td class="px-4 py-2">
                      <app-status-chip [tone]="healthTone(row.healthStatus)">{{ row.status || row.healthStatus }}</app-status-chip>
                    </td>
                    <td class="px-4 py-2">
                      <app-status-chip [tone]="billingStatusTone(row.billingStatus)">{{ row.billingStatus || 'Pending' }}</app-status-chip>
                    </td>
                    <td class="px-4 py-2 text-right font-numeric text-xs">{{ fmt(row.contract2026) }}</td>
                    <td class="px-4 py-2 text-right font-numeric text-xs">{{ fmt(row.billedToDate) }}</td>
                    <td class="px-4 py-2 text-right font-numeric text-xs" [class.text-amber-700]="row.leftToBill > 0">{{ fmt(row.leftToBill) }}</td>
                    <td class="px-4 py-2">
                      <div class="text-xs font-semibold text-slate-700 truncate max-w-[160px]">{{ foremanPmLabel(row) }}</div>
                    </td>
                    <td class="px-4 py-2">
                      <a [routerLink]="row.nextAction.route"
                         [queryParams]="row.nextAction.queryParams"
                         [fragment]="row.nextAction.fragment"
                         class="text-xs font-semibold text-indigo-700 hover:underline truncate block max-w-[180px]">
                        {{ priorityActionLabel(row.nextAction.label) }}
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="p-5">
            <app-empty-state icon="work_off" title="No active projects" message="All projects are closed or archived." />
          </div>
        }
      </section>

      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Financial Snapshot</h2>
            
          </div>
          <a routerLink="/financials" class="text-xs font-bold text-indigo-700 hover:text-indigo-800">View Financials</a>
        </div>
        <div class="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 divide-x divide-y divide-slate-100">
            @for (item of financialSnapshot(); track item.label) {
              <div class="p-4 min-w-0">
                <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">{{ item.label }}</div>
                <div class="text-lg font-bold text-slate-950 mt-1 truncate">{{ item.value }}</div>
                <div class="text-xs text-slate-500 mt-1 truncate">{{ item.subtext }}</div>
              </div>
            }
          </div>
          <div class="p-4">
            <app-chart-card title="Portfolio Mix" subtitle="Billed vs balance across active jobs">
              <app-donut-chart [slices]="portfolioDonut()" />
            </app-chart-card>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-900">Field Labor Hours</h2>
            <p class="text-xs text-slate-500 mt-0.5">Approved timekeeper hours · {{ laborMonthLabel() }}</p>
          </div>
          <a routerLink="/labor" class="text-xs font-bold text-indigo-700 hover:text-indigo-800">Open Labor</a>
        </div>
        @if (laborHoursRows().length) {
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-slate-100 text-sm">
              <thead class="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th class="px-4 py-2">Job</th>
                  <th class="px-4 py-2">Project</th>
                  <th class="px-4 py-2 text-right">Hours</th>
                  <th class="px-4 py-2 text-right">Crew</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of laborHoursRows(); track row.projectNumber) {
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2 font-numeric text-xs font-bold text-slate-900">{{ row.projectNumber }}</td>
                    <td class="px-4 py-3 text-slate-600 truncate max-w-[280px]">{{ row.projectName }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-semibold">{{ fmtHours(row.totalHours) }}</td>
                    <td class="px-4 py-3 text-right text-slate-600">{{ row.employeeCount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="p-5">
            <app-empty-state title="No timekeeper hours this month" message="Approved hours from the Master Time Data Sheet will appear here." />
          </div>
        }
      </section>

      <section class="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        @for (action of quickActions(); track action.label) {
          <a [routerLink]="action.route"
             class="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-100 shadow-sm p-4 transition-colors">
            <div class="flex items-center gap-3">
              <span class="w-9 h-9 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
                <mat-icon class="!text-[19px]">{{ action.icon }}</mat-icon>
              </span>
              <div>
                <div class="text-sm font-bold text-slate-900">{{ action.label }}</div>
                <div class="text-xs text-slate-500">{{ action.subtext }}</div>
              </div>
            </div>
          </a>
        }
      </section>

      @if (sourceWarnings().length) {
        <section class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 class="text-lg font-bold text-amber-800">Missing Pay App Backup</h2>
            <a routerLink="/settings" fragment="import-review" class="text-xs font-bold text-amber-900 underline">Admin / Setup</a>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (row of sourceWarnings(); track row.id) {
              <a [routerLink]="homeSourceHealthRoute(row.id)"
                 [fragment]="homeSourceHealthFragment(row.id)"
                 class="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:border-amber-300 hover:bg-amber-50/50 transition-colors">
                <mat-icon class="!text-[16px] text-amber-600">warning</mat-icon>
                {{ backupReviewLabel(row.label) }}
              </a>
            }
          </div>
        </section>
      }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  globalNeeds = inject(GlobalNeedsService);
  private syncHealth = inject(SyncHealthService);
  private importReview = inject(ImportReviewService);
  private qbSyncData = inject(QuickBooksSyncDataService);
  private api = inject(ApiClientService);
  private currency = inject(CurrencyPipe);
  private data = inject(DataService);
  private laborData = inject(LaborDataService);

  projects = toSignal(this.data.getProjects(), { initialValue: [] });

  readonly homeSourceHealthRoute = homeSourceHealthRoute;
  readonly homeSourceHealthFragment = homeSourceHealthFragment;

  billingLoading = signal(false);
  billingError = signal<string | null>(null);
  billingRecords = signal<DashboardBillingRecord[]>([]);
  private billingLoadStarted = false;

  projectsReady = signal(false);
  projectsError = signal<string | null>(null);
  readonly skeletonSlots = [1, 2, 3, 4, 5];

  dashboardError = computed(() => this.projectsError() ?? this.billingError());
  dashboardLoading = computed(() => !this.projectsReady());

  activeProjectRows = computed(() =>
    [...this.globalNeeds.active2026Rows()]
      .sort((a, b) => this.activeProjectRank(b) - this.activeProjectRank(a) || a.jobNumber.localeCompare(b.jobNumber))
      .slice(0, 12),
  );

  topMetrics = computed<DashboardMetric[]>(() => {
    const rows = this.globalNeeds.active2026Rows();
    const waitingArRows = rows.filter(row => row.arBalance > 0 || /open ar|waiting/i.test(row.billingStatus));
    const currentDue = this.sumNullable(this.billingRecords().map(record => record.currentPaymentDue));
    const reviewCount = rows.filter(row =>
      row.needsReview
      || row.missingItemCount > 0
      || row.reviewFlags.length > 0
      || /review|missing/i.test(row.billingStatus),
    ).length + this.billingRecords().filter(record => this.billingNeedsReview(record)).length;

    return [
      {
        label: 'Active Jobs',
        value: rows.length.toString(),
        subtext: 'Open project workspace',
        icon: 'domain',
        route: '/projects',
      },
      {
        label: 'Waiting on A/R',
        value: waitingArRows.length.toString(),
        subtext: this.fmt(waitingArRows.reduce((sum, row) => sum + row.arBalance, 0)),
        icon: 'receipt_long',
        route: '/ar',
      },
      {
        label: 'Current Due',
        value: this.currencyOrPending(currentDue),
        subtext: this.billingRecords().length ? 'Open Pay App current due' : 'No Pay Apps yet',
        icon: 'request_quote',
        route: '/billing',
      },
      {
        label: 'Review Items',
        value: reviewCount.toString(),
        subtext: 'Billing review, project setup, missing backup',
        icon: 'rule',
        route: '/active-2026-control',
      },
      {
        label: 'Active / Updated',
        value: this.recentlyActiveRows().length.toString(),
        subtext: 'Jobs with billing or follow-up',
        icon: 'update',
        route: '/projects',
      },
    ];
  });

  priorities = computed(() => {
    const qbRun = this.qbSyncData.lastRun();
    const qbSyncWarning = !!qbRun?.completedAt && ((qbRun.warnings?.length ?? 0) > 0 || qbRun.status === 'Failed');
    return buildHomePriorities({
      rows: this.globalNeeds.active2026Rows(),
      qbSyncWarning,
      unmatchedSourceCount: this.importReview.unresolvedCount(),
    });
  });

  recentBillingRecords = computed(() =>
    [...this.billingRecords()]
      .sort((a, b) => this.billingRecordTime(b) - this.billingRecordTime(a))
      .slice(0, 6),
  );

  portfolioDonut = computed<DonutSlice[]>(() => {
    const rows = this.globalNeeds.active2026Rows();
    const billed = rows.reduce((sum, row) => sum + row.billedToDate, 0);
    const balance = rows.reduce((sum, row) => sum + row.leftToBill, 0);
    const ar = rows.reduce((sum, row) => sum + row.arBalance, 0);
    return [
      { label: 'Billed', value: billed, color: '#059669' },
      { label: 'Balance to Bill', value: balance, color: '#2563eb' },
      { label: 'Open A/R', value: ar, color: '#d97706' },
    ].filter(slice => slice.value > 0);
  });

  laborMonthLabel = computed(() => {
    const key = currentLaborMonthKey();
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
      .format(new Date(year, month - 1, 1));
  });

  laborHoursRows = computed(() =>
    buildProjectHoursRows(
      this.laborData.normalizedEntries(),
      this.projects() ?? [],
      currentLaborMonthKey(),
    ).slice(0, 8),
  );

  quickActions = computed(() => [
    { label: 'Open Projects', subtext: 'Search, filter, and open active jobs', route: '/projects', icon: 'folder_open' },
    { label: 'Review Billing', subtext: 'Pay Apps, A/R, and retainage', route: '/billing', icon: 'request_quote' },
    { label: 'View Financials', subtext: 'WIP, A/R, contracts, and costs', route: '/financials', icon: 'monitoring' },
    { label: 'Find Documents', subtext: 'Contracts, Pay Apps, RFIs, and photos', route: '/documents', icon: 'description' },
    { label: 'Admin / Setup', subtext: 'Project setup and import review', route: '/settings', icon: 'settings' },
  ]);

  financialSnapshot = computed<DashboardFinancialMetric[]>(() => {
    const rows = this.globalNeeds.active2026Rows();
    const billing = this.billingRecords();
    const currentDue = this.sumNullable(billing.map(record => record.currentPaymentDue));
    const retainage =
      this.sumNullable(billing.map(record => record.retainageAmount))
      ?? this.sumNullable(rows.map(row => row.retainage));
    const waitingAr = rows.reduce((sum, row) => sum + row.arBalance, 0);

    return [
      {
        label: 'Active Contract Value',
        value: this.fmt(rows.reduce((sum, row) => sum + row.contract2026, 0)),
        subtext: `${rows.length} active jobs`,
      },
      {
        label: 'Billed to Date',
        value: this.fmt(rows.reduce((sum, row) => sum + row.billedToDate, 0)),
        subtext: 'Progress billings',
      },
      {
        label: 'Balance to Bill',
        value: this.fmt(rows.reduce((sum, row) => sum + row.leftToBill, 0)),
        subtext: 'Remaining contract',
      },
      {
        label: 'Open Current Due',
        value: this.currencyOrPending(currentDue),
        subtext: 'Pay Apps',
      },
      {
        label: 'Retainage',
        value: this.currencyOrPending(retainage),
        subtext: 'Held / final billing',
      },
      {
        label: 'Waiting on A/R',
        value: this.fmt(waitingAr),
        subtext: 'Open invoices',
      },
    ];
  });

  recentlyActiveRows = computed(() =>
    this.globalNeeds.active2026Rows().filter(row =>
      row.billedToDate > 0
      || row.arBalance > 0
      || row.leftToBill > 0
      || row.missingItemCount > 0
      || row.nextAction.label !== 'Open job',
    ),
  );

  sourceWarnings = computed(() =>
    this.syncHealth.blockingWarnings().filter(row => isHomeSourceHealthRow(row.id)),
  );

  constructor() {
    // 8-second timeout ensures dashboard renders even if Firestore is slow or rules block the first snapshot
    const timeout = setTimeout(() => {
      if (!this.projectsReady()) this.projectsReady.set(true);
    }, 8000);

    this.data.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => { clearTimeout(timeout); this.projectsReady.set(true); },
      error: (err) => {
        clearTimeout(timeout);
        this.projectsReady.set(true);
        this.projectsError.set(err instanceof Error ? err.message : 'Could not load projects from Firestore.');
      },
    });

    effect(() => {
      const rows = this.globalNeeds.active2026Rows();
      if (!this.billingLoadStarted && rows.length > 0) {
        this.billingLoadStarted = true;
        void this.loadBillingSnapshot(rows);
      }
    });
  }

  fmt(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  fmtHours(value: number): string {
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  currencyOrPending(value: number | null): string {
    return value === null ? 'Pending' : this.fmt(value);
  }

  healthTone(health: string): StatusTone {
    switch (health) {
      case 'Green': return 'green';
      case 'Yellow': return 'amber';
      case 'Red': return 'red';
      default: return 'slate';
    }
  }

  billingStatusTone(status: string | null | undefined): StatusTone {
    const text = (status ?? '').toLowerCase();
    if (text.includes('review') || text.includes('missing')) return 'amber';
    if (text.includes('open ar') || text.includes('waiting')) return 'amber';
    if (text.includes('progress') || text.includes('current')) return 'green';
    if (text.includes('not started')) return 'slate';
    return 'blue';
  }

  billingTone(record: DashboardBillingRecord): StatusTone {
    const text = `${record.status ?? ''} ${record.notes ?? ''}`.toLowerCase();
    if (this.billingNeedsReview(record)) return 'amber';
    if (text.includes('waiting on a/r') || text.includes('waiting on ar')) return 'amber';
    if (text.includes('retainage') || text.includes('final') || /\bret\b/.test(text)) return 'violet';
    if (text.includes('imported') || text.includes('ready')) return 'green';
    return 'slate';
  }

  billingLabel(record: DashboardBillingRecord): string {
    const text = `${record.status ?? ''} ${record.notes ?? ''}`.toLowerCase();
    if (this.billingNeedsReview(record)) return 'Billing Review';
    if (text.includes('waiting on a/r') || text.includes('waiting on ar')) return 'Waiting on A/R';
    if (text.includes('retainage') || text.includes('final') || /\bret\b/.test(text)) return 'Retainage / Final';
    return record.status || 'Pay App';
  }

  periodLabel(record: DashboardBillingRecord): string {
    if (record.billingPeriodStart && record.billingPeriodEnd) {
      return `${record.billingPeriodStart} - ${record.billingPeriodEnd}`;
    }
    return record.applicationDate || record.createdAt?.slice(0, 10) || 'Period pending';
  }

  sourceLabel(source: string): string {
    switch (source) {
      case 'QB': return 'Billing';
      case 'Drive': return 'Backup';
      case 'Time': return 'Labor';
      default: return 'Office';
    }
  }

  priorityIssueLabel(issue: string): string {
    const text = issue.toLowerCase();
    if (text.includes('missing contract')) return 'Missing Contract';
    if (text.includes('missing drive')) return 'Missing Drive Folder';
    if (text.includes('budget estimate')) return 'Project Setup Needed';
    if (text.includes('quickbooks')) return 'Billing Review Needed';
    if (text.includes('unmatched')) return 'Missing Pay App Backup';
    return issue;
  }

  priorityActionLabel(label: string): string {
    const text = label.toLowerCase();
    if (text.includes('review sources')) return 'Review Backup';
    if (text.includes('missing backup')) return 'Review Backup';
    if (text.includes('re-sync quickbooks')) return 'Review Billing';
    if (text.includes('confirm budget')) return 'Project Setup';
    if (text.includes('link drive')) return 'Link Project Folder';
    return label;
  }

  backupReviewLabel(label: string): string {
    switch (label) {
      case 'Master Time Sheet':
        return 'Labor Hours';
      case 'QuickBooks Sync':
        return 'Pay App / Invoice Backup';
      case 'Drive Folder Links':
        return 'Project Folders';
      case 'Labor Code Discovery':
        return 'Rates / Classifications';
      case 'Subcontractor Discovery':
        return 'Directory Setup';
      case 'Source Review':
        return 'Missing Pay App Backup';
      default:
        return label;
    }
  }

  foremanPmLabel(row: Active2026ControlRow): string {
    const people = [row.foreman, row.pm].filter(value => !!value && value !== 'TBD');
    return people.length ? people.join(' / ') : 'Not assigned';
  }

  retryDashboard(): void {
    this.projectsError.set(null);
    this.billingError.set(null);
    this.billingLoadStarted = false;
    this.billingRecords.set([]);
    this.projectsReady.set(false);
    this.data.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => this.projectsReady.set(true),
      error: (err) => {
        this.projectsReady.set(true);
        this.projectsError.set(err instanceof Error ? err.message : 'Could not load projects from Firestore.');
      },
    });
    const rows = this.globalNeeds.active2026Rows();
    if (rows.length) {
      this.billingLoadStarted = true;
      void this.loadBillingSnapshot(rows);
    } else {
      this.projectsReady.set(true);
    }
  }

  private async loadBillingSnapshot(rows: Active2026ControlRow[]): Promise<void> {
    const scopedRows = rows.slice(0, 24);
    if (!scopedRows.length) return;

    this.billingLoading.set(true);
    this.billingError.set(null);
    try {
      const results = await Promise.allSettled(
        scopedRows.map(async row => {
          const response = await this.api.get<ProjectPayAppsApiResponse>(`/api/projects/${encodeURIComponent(row.projectId)}/pay-apps`);
          return mapPayAppsResponse(response).map(record => ({
            ...record,
            projectName: row.projectName,
            customer: row.customer,
          }));
        }),
      );
      const records = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      this.billingRecords.set(records);
      if (results.some(result => result.status === 'rejected')) {
        this.billingError.set(records.length ? null : 'Billing snapshot is not available right now. Check your API connection.');
      }
    } catch (err) {
      this.billingRecords.set([]);
      this.billingError.set(err instanceof Error ? err.message : 'Billing snapshot is not available right now. Check your API connection.');
    } finally {
      this.billingLoading.set(false);
    }
  }

  private activeProjectRank(row: Active2026ControlRow): number {
    let score = 0;
    if (row.arBalance > 0) score += 700;
    if (row.needsReview || row.reviewFlags.length || row.missingItemCount > 0) score += 500;
    if (/review|missing/i.test(row.billingStatus)) score += 400;
    score += Math.min(row.leftToBill, 1_000_000) / 5000;
    return score;
  }

  private billingRecordTime(record: DashboardBillingRecord): number {
    const date = record.applicationDate || record.billingPeriodEnd || record.createdAt;
    return date ? new Date(date).getTime() || 0 : 0;
  }

  private billingNeedsReview(record: Pick<ProjectSqlPayApp, 'status' | 'notes' | 'payAppNumber'>): boolean {
    const text = `${record.status ?? ''} ${record.notes ?? ''} ${record.payAppNumber ?? ''}`.toLowerCase();
    return text.includes('review') || text.includes('missing') || text.includes('scanned') || text.includes('mismatch');
  }

  private sumNullable(values: Array<number | null>): number | null {
    const present = values.filter((value): value is number => value !== null);
    return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  }
}

