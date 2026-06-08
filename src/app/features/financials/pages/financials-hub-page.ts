import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';

import { CommonModule, CurrencyPipe } from '@angular/common';

import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatIconModule } from '@angular/material/icon';

import { DataService } from '@core/services/data.service';

import { WipService } from '@features/financials/services/wip.service';

import { ProjectFinancialService } from '@features/projects/services/project-financial.service';

import { ArComputeService } from '@features/financials/services/ar-compute.service';

import { ForemanBonusService } from '@features/labor/services/foreman-bonus.service';

import { ImportReviewService } from '@core/services/import-review.service';

import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';

import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';

import { PageHeaderComponent } from '@app/components/ui/page-header';

import { StatCardComponent } from '@app/components/ui/stat-card';

import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';

import { SegmentedControlComponent } from '@app/components/ui/segmented-control';

import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';

import { EmptyStateComponent } from '@app/components/ui/empty-state';

import { downloadCsv } from '@shared/utils/csv-export';

import {

  buildFinancialsArJobRows,

  buildFinancialsBillingRows,

  buildFinancialsBonusRows,

  buildFinancialsCommitmentRows,

  buildFinancialsOverviewRows,

  buildFinancialsSourceRows,

  buildFinancialsWipRows,

  CommitmentFilterId,

  countJobsUnderMargin,

  FINANCIALS_SEGMENT_OPTIONS,

  financialsHubCsvRows,

  FinancialsSegmentId,

  matchesCommitmentFilter,

  matchesWipHubFilter,

  normalizeFinancialsSegment,

  qbSyncStatusLabel,

  WIP_HUB_FILTER_OPTIONS,

  WipHubFilterId,

} from '@features/financials/utils/financials-hub.compute';
import { wipGroupLabel } from '@features/financials/utils/wip.compute';
import { WipGroup } from '@app/models/financial.types';
import { Billing } from '@app/models/types';

type FinancialsDateRange = 'thisMonth' | 'last3Months' | 'thisYear' | 'allTime';

@Component({

  selector: 'app-financials-hub-page',

  standalone: true,

  imports: [

    CommonModule,

    MatIconModule,

    RouterLink,

    PageHeaderComponent,

    StatCardComponent,

    CompactStatStripComponent,

    SegmentedControlComponent,

    StatusChipComponent,

    EmptyStateComponent,

  ],

  providers: [CurrencyPipe],

  template: `

    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">

      <app-page-header

        title="Financials"

        subtitle="WIP, AR, billing, purchase orders, and job margin"

        primaryActionLabel="Open WIP"

        (primaryAction)="setSegment('wip')">

        <button type="button" (click)="resyncQb()" [disabled]="qbSyncing()"

                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">

          <mat-icon class="!text-[18px]">{{ qbSyncing() ? 'hourglass_empty' : 'sync' }}</mat-icon>

          {{ qbSyncing() ? 'Syncing…' : 'Re-sync QuickBooks' }}

        </button>

        <button type="button" (click)="exportCsv()"

                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">

          Export CSV

        </button>

        <a routerLink="/settings" fragment="import-review"

           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">

          Source Review

        </a>

      </app-page-header>



      @if (syncMessage()) {

        <p class="text-sm text-emerald-700 -mt-2">{{ syncMessage() }}</p>

      }



      <div class="flex flex-wrap gap-2">

        @for (opt of dateRangeOptions; track opt.id) {

          <button type="button" (click)="dateRange.set(opt.id)"

                  class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"

                  [class.bg-slate-900]="dateRange() === opt.id"

                  [class.text-white]="dateRange() === opt.id"

                  [class.text-slate-600]="dateRange() !== opt.id"

                  [class.hover:bg-slate-100]="dateRange() !== opt.id">

            {{ opt.label }}

          </button>

        }

      </div>



      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <app-stat-card label="Projected Margin" [value]="marginLabel()" [subtext]="'20% target'" icon="trending_up"

                       [trend]="metrics().forecastMargin < 20 ? 'Below target' : undefined" [trendPositive]="metrics().forecastMargin >= 20" />

        <button type="button" (click)="setSegment('ar')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">

          <app-stat-card label="Open AR" [value]="fmt(metrics().arBalance)" icon="receipt_long"

                         [trend]="metrics().arOver30 > 0 ? 'Past due aging' : undefined" [trendPositive]="false" />

        </button>

        <button type="button" (click)="setSegment('billing')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">

          <app-stat-card label="Left to Bill" [value]="fmt(metrics().leftToBill)" icon="pending_actions" />

        </button>

        <button type="button" (click)="setSegment('wip')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">

          <app-stat-card label="Jobs Under 20%" [value]="jobsUnderMarginLabel()" icon="warning"

                         [trend]="jobsUnderMargin() ? 'Review margin' : undefined" [trendPositive]="false" />

        </button>

      </div>



      @if (compactStats().length) {

        <app-compact-stat-strip [stats]="compactStats()" />

      }



      @if (arAgingWarning()) {

        <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">

          AR Aging Summary tab missing — AR cannot be fully synced.

          <a routerLink="/settings" fragment="quickbooks-sync" class="font-semibold underline ml-1">Re-sync QuickBooks</a>

        </div>

      }



      <app-segmented-control

        [options]="segmentOptions()"

        [value]="segment()"

        (select)="setSegment($event)" />



      @switch (segment()) {

        @case ('overview') {

          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center">

              <div>

                <h2 class="text-lg font-bold text-slate-900">Money actions</h2>

                <p class="text-xs text-slate-500 mt-0.5">Margin, collections, billing, and source trust issues</p>

              </div>

            </div>

            @if (overviewRows().length) {

              <div class="divide-y divide-slate-100">

                @for (row of overviewRows(); track row.id) {

                  <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">

                    <div class="min-w-0 flex-1">

                      <div class="flex flex-wrap items-center gap-2">

                        @if (row.jobNumber !== '—') {

                          <span class="text-xs font-bold font-mono">{{ row.jobNumber }}</span>

                          <span class="text-sm font-semibold text-slate-900 truncate max-w-[240px]">{{ row.projectName }}</span>

                        } @else {

                          <span class="text-sm font-semibold text-slate-900">{{ row.projectName }}</span>

                        }

                        <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.issueType }}</app-status-chip>

                      </div>

                      @if (row.amount > 0) {

                        <p class="text-xs text-slate-500 mt-0.5 font-mono">{{ fmt(row.amount) }}</p>

                      }

                    </div>

                    <a [routerLink]="row.route" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">

                      {{ row.nextAction }}

                    </a>

                  </div>

                }

              </div>

            } @else {

              <div class="p-5">
                <app-empty-state title="No urgent money actions" message="You're caught up on billing and AR follow-up." />
              </div>

            }

          </section>

        }



        @case ('wip') {

          <div class="space-y-4">

            <div class="flex flex-wrap items-center justify-between gap-3">

              <app-segmented-control [options]="wipFilterOptions()" [value]="wipFilter()" (select)="wipFilter.set($event)" />

              <a routerLink="/wip" class="text-xs font-bold text-indigo-700 hover:underline">Open full WIP view</a>

            </div>

            <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

              @for (row of filteredWipRows(); track row.record.projectId) {

                <div class="px-5 py-4 hover:bg-slate-50">

                  <div class="flex flex-wrap items-start gap-4">

                    <a [routerLink]="['/projects', row.record.projectId]" class="min-w-0 flex-1">

                      <div class="flex flex-wrap items-center gap-2 mb-1">

                        <span class="text-xs font-bold font-mono">#{{ row.record.jobNumber }}</span>

                        <span class="text-sm font-bold text-slate-900">{{ row.record.projectName }}</span>

                        <app-status-chip tone="slate">{{ row.record.wipGroup === 'ActiveWIP' ? 'Active' : groupLabel(row.record.wipGroup) }}</app-status-chip>
                        @if (row.record.wipConfidence) {
                          <app-status-chip [tone]="row.record.wipConfidence === 'Good' ? 'green' : (row.record.wipConfidence === 'NeedsReview' ? 'red' : 'amber')">
                            {{ row.record.wipConfidence }}
                          </app-status-chip>
                        }

                      </div>

                      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">

                        <span><span class="text-slate-400">Contract</span> <span class="font-mono font-semibold">{{ fmt(row.record.contractAmount) }}</span></span>

                        <span><span class="text-slate-400">Budget</span> <span class="font-semibold">{{ row.budgetBasisLabel }}</span></span>

                        <span><span class="text-slate-400">Cost</span> <span class="font-mono font-semibold">{{ fmt(row.record.costToDate) }}</span></span>

                        <span><span class="text-slate-400">Margin</span> <span class="font-mono font-semibold" [class.text-rose-700]="row.record.forecastMargin < 20">{{ row.record.forecastMargin | number:'1.0-1' }}%</span></span>

                        <span><span class="text-slate-400">O/U bill</span> <span class="font-mono font-semibold">{{ fmt(row.record.overUnderBilling) }}</span></span>

                      </div>

                      @if (row.record.warningChips?.length || row.warnings.length) {
                        <div class="flex flex-wrap gap-1.5 mt-2">
                          @for (w of row.record.warningChips ?? []; track w.label) {
                            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                                  [class.bg-rose-100]="w.tone === 'critical'"
                                  [class.text-rose-800]="w.tone === 'critical'"
                                  [class.bg-amber-100]="w.tone === 'amber'"
                                  [class.text-amber-800]="w.tone === 'amber'">{{ w.label }}</span>
                          }
                          @for (w of row.warnings; track w) {
                            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{{ w }}</span>
                          }
                        </div>
                      }

                    </a>

                    <a [routerLink]="['/projects', row.record.projectId]" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</a>

                  </div>

                </div>

              } @empty {

                <div class="p-5">
                  <app-empty-state title="No WIP jobs match this filter" message="Try a different segment or refresh WIP data." />
                </div>

              }

            </section>

          </div>

        }



        @case ('ar') {

          <div class="space-y-4">

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">

              <app-stat-card label="Open AR" [value]="fmt(metrics().arBalance)" />

              <app-stat-card label="Past Due" [value]="fmt(metrics().arOver30)" [trend]="metrics().arOver30 > 0 ? 'Needs follow-up' : undefined" [trendPositive]="false" />

              <app-stat-card label="30+ Days" [value]="fmt(arAging30Plus())" />

              <app-stat-card label="Closeout AR" [value]="fmt(metrics().closeoutArAmount)" />

            </div>

            <div class="flex justify-end">

              <a routerLink="/ar" class="text-xs font-bold text-indigo-700 hover:underline">Open full AR view</a>

            </div>

            <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

              @for (row of arJobRows(); track row.projectId) {

                <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">

                  <a [routerLink]="['/projects', row.projectId]" class="min-w-0 flex-1">

                    <div class="flex flex-wrap items-center gap-2">

                      <span class="text-xs font-bold font-mono">#{{ row.jobNumber }}</span>

                      <span class="text-sm font-semibold text-slate-900">{{ row.projectName }}</span>

                      <span class="text-xs text-slate-500">{{ row.customer }}</span>

                    </div>

                    <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs font-mono">

                      <span>Cur {{ fmt(row.current) }}</span>

                      <span>1-30 {{ fmt(row.days1To30) }}</span>

                      <span>31-60 {{ fmt(row.days31To60) }}</span>

                      <span>61-90 {{ fmt(row.days61To90) }}</span>

                      <span>90+ {{ fmt(row.days90Plus) }}</span>

                      <span class="font-bold text-slate-900">Open {{ fmt(row.totalOpen) }}</span>

                    </div>

                  </a>

                  <span class="text-[10px] uppercase font-bold text-slate-400">{{ row.collectionStatus }}</span>

                  <a routerLink="/ar" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>

                </div>

              } @empty {

                <div class="p-5">
                  <app-empty-state title="No open AR balances" message="Outstanding receivables will appear when AR data loads." />
                </div>

              }

            </section>

          </div>

        }



        @case ('billing') {

          <div class="space-y-4">

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">

              <app-stat-card label="Total Billed" [value]="fmt(metrics().billedToDate)" />

              <app-stat-card label="Left to Bill" [value]="fmt(metrics().leftToBill)" />

              <app-stat-card label="Approved COs not billed" [value]="fmt(metrics().approvedUnbilledCOAmount)" />

              <app-stat-card label="Draft/submitted pay apps" [value]="payAppsDueLabel()" />

            </div>

            <div class="flex justify-end">

              <a routerLink="/billing" class="text-xs font-bold text-indigo-700 hover:underline">Open full billing view</a>

            </div>

            <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

              @for (row of billingRows(); track row.id) {

                <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">

                  <a [routerLink]="['/projects', row.projectId]" class="min-w-0 flex-1">

                    <div class="flex flex-wrap items-center gap-2">

                      <span class="text-xs font-bold font-mono">#{{ row.jobNumber }}</span>

                      <span class="text-sm font-semibold text-slate-900">{{ row.projectName }}</span>

                      <app-status-chip tone="amber">{{ row.issue }}</app-status-chip>

                    </div>

                    <p class="text-xs font-mono text-slate-500 mt-0.5">{{ fmt(row.amount) }} · {{ row.status }}</p>

                  </a>

                  <a [routerLink]="['/projects', row.projectId]" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>

                </div>

              } @empty {

                <div class="p-5">
                  <app-empty-state title="No billing actions right now" message="Pay apps and retainage follow-up are clear." />
                </div>

              }

            </section>

          </div>

        }



        @case ('commitments') {

          <div class="space-y-4">

            <app-segmented-control [options]="commitmentFilterOptions()" [value]="commitmentFilter()" (select)="commitmentFilter.set($event)" />

            <div class="flex justify-end">

              <a routerLink="/pos" class="text-xs font-bold text-indigo-700 hover:underline">Open full POs view</a>

            </div>

            <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

              @for (row of filteredCommitmentRows(); track row.id) {

                <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">

                  <div class="min-w-0 flex-1">

                    <div class="flex flex-wrap items-center gap-2">

                      <span class="text-sm font-bold text-slate-900">{{ row.poNumber }}</span>

                      <span class="text-xs text-slate-500">{{ row.vendor }}</span>

                    </div>

                    <p class="text-xs text-slate-600 mt-0.5">{{ row.jobLabel }} · {{ row.status }}</p>

                    <p class="text-xs font-mono text-slate-500 mt-0.5">{{ fmt(row.amount) }} · {{ row.source }} · {{ row.matchStatus }}</p>

                  </div>

                  <a routerLink="/settings" fragment="import-review" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>

                </div>

              } @empty {

                <div class="p-5">
                  <app-empty-state title="No purchase orders match this filter" message="Adjust filters or sync commitment data." />
                </div>

              }

            </section>

          </div>

        }



        @case ('bonuses') {

          <div class="space-y-4">

            <div class="flex justify-end">

              <a routerLink="/foreman-bonuses" class="text-xs font-bold text-indigo-700 hover:underline">Open full bonus view</a>

            </div>

            @if (showBonuses()) {

              <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

                @for (row of bonusRows(); track row.record.id) {

                  <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">

                    <a [routerLink]="['/projects', row.record.projectId]" class="min-w-0 flex-1">

                      <div class="flex flex-wrap items-center gap-2">

                        <span class="text-sm font-semibold text-slate-900">{{ row.record.foremanName }}</span>

                        <span class="text-xs font-mono">#{{ row.jobNumber }}</span>

                        <span class="text-xs text-slate-500">{{ row.projectName }}</span>

                      </div>

                      <div class="flex flex-wrap gap-x-3 text-xs font-mono mt-1">

                        <span>Budget {{ fmt(row.record.laborBudget) }}</span>

                        <span>Actual {{ fmt(row.record.actualLaborCost) }}</span>

                        <span>Savings {{ fmt(row.record.laborSavings) }}</span>

                        <span>Bonus {{ fmt(row.record.foremanShareBonus) }}</span>

                        <span>Payable {{ fmt(row.record.payThisTerm) }}</span>

                      </div>

                      <app-status-chip [tone]="bonusTone(row.record.status)">{{ row.record.status }}</app-status-chip>

                    </a>

                    <a [routerLink]="['/projects', row.record.projectId]" class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</a>

                  </div>

                }

              </section>

            } @else {

              <div class="p-5">
                <app-empty-state title="No foreman bonus records yet" message="Bonus rows will appear after labor sync." />
              </div>

            }

          </div>

        }



        @case ('sources') {

          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">

            @for (row of sourceRows(); track row.id) {

              <div class="px-5 py-4 flex flex-wrap items-start gap-3 hover:bg-slate-50">

                <div class="min-w-0 flex-1">

                  <div class="flex items-center gap-2">

                    <app-status-chip [tone]="row.severity === 'error' ? 'red' : 'amber'">{{ row.label }}</app-status-chip>

                  </div>

                  <p class="text-sm text-slate-600 mt-1">{{ row.detail }}</p>

                </div>

                <a [routerLink]="row.route" [fragment]="row.fragment"

                   class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">Source Review</a>

              </div>

            } @empty {

              <div class="p-5">
                <app-empty-state title="All financial sources look healthy" message="No import or sync issues need review." />
              </div>

            }

          </section>

        }

      }

    </div>

  `,

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class FinancialsHubPage {

  private data = inject(DataService);

  private wipSvc = inject(WipService);

  private financialSvc = inject(ProjectFinancialService);

  private arCompute = inject(ArComputeService);

  private foremanBonus = inject(ForemanBonusService);

  private importReview = inject(ImportReviewService);

  private qbSyncData = inject(QuickBooksSyncDataService);

  private qbSheetsSync = inject(QuickBooksSyncSheetsService);

  private route = inject(ActivatedRoute);

  private router = inject(Router);

  private currency = inject(CurrencyPipe);



  segment = signal<FinancialsSegmentId>('overview');

  wipFilter = signal<WipHubFilterId>('activeOnly');

  commitmentFilter = signal<CommitmentFilterId>('all');

  dateRange = signal<FinancialsDateRange>('thisYear');

  qbSyncing = signal(false);

  syncMessage = signal<string | null>(null);

  readonly dateRangeOptions: { id: FinancialsDateRange; label: string }[] = [

    { id: 'thisMonth', label: 'This month' },

    { id: 'last3Months', label: 'Last 3 months' },

    { id: 'thisYear', label: 'This year' },

    { id: 'allTime', label: 'All time' },

  ];



  projects = toSignal(this.data.getProjects(), { initialValue: [] });

  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });

  billings = toSignal(this.data.getBillings(), { initialValue: [] });

  arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });

  pos = toSignal(this.data.getPOs(), { initialValue: [] });



  metrics = computed(() => this.financialSvc.portfolioMetrics());

  wipRecords = computed(() => this.wipSvc.computeAll());



  financialByProjectId = computed(() => {

    const map = new Map<string, ReturnType<ProjectFinancialService['computeForProject']>>();

    for (const p of this.projects() ?? []) {

      map.set(p.id, this.financialSvc.computeForProject(p));

    }

    return map;

  });



  jobsUnderMargin = computed(() => countJobsUnderMargin(this.wipRecords()));



  overviewRows = computed(() => buildFinancialsOverviewRows({

    wipRecords: this.wipRecords(),

    arRecords: this.arRecords() ?? [],

    changeOrders: this.changeOrders() ?? [],

    billings: this.billings() ?? [],

    projects: this.projects() ?? [],

    importReviewCount: this.importReview.unresolvedCount(),

    qbWarnings: this.qbSyncData.lastRun()?.warnings ?? [],

  }));



  wipRows = computed(() => buildFinancialsWipRows(this.wipRecords(), this.financialByProjectId()));



  filteredWipRows = computed(() => {

    const filter = this.wipFilter();

    const fin = this.financialByProjectId();

    return this.wipRows().filter(r => matchesWipHubFilter(r, filter, fin.get(r.record.projectId)));

  });



  arJobRows = computed(() => buildFinancialsArJobRows(this.arCompute.buildContext()));



  billingRows = computed(() => buildFinancialsBillingRows({

    wipRecords: this.wipRecords(),

    changeOrders: this.changeOrders() ?? [],

    billings: this.billingsForDateRange(),

    projects: this.projects() ?? [],

  }));



  commitmentRows = computed(() =>

    buildFinancialsCommitmentRows(this.projects() ?? [], this.pos() ?? []),

  );



  filteredCommitmentRows = computed(() =>

    this.commitmentRows().filter(r => matchesCommitmentFilter(r, this.commitmentFilter())),

  );



  bonusRows = computed(() =>

    buildFinancialsBonusRows(this.foremanBonus.records(), this.projects() ?? []),

  );



  showBonuses = computed(() =>

    this.foremanBonus.records().length > 0

    || this.foremanBonus.assignments().length > 0,

  );



  sourceRows = computed(() => buildFinancialsSourceRows({

    qbWarnings: this.qbSyncData.lastRun()?.warnings ?? [],

    qbTabsMissing: this.qbSyncData.lastRun()?.tabsMissing ?? [],

    importReviewCount: this.importReview.unresolvedCount(),

    hasArAgingTab: this.qbSyncData.arAging().length > 0 || !(this.qbSyncData.lastRun()?.tabsMissing ?? []).some(t => t.includes('AR Aging')),

    hasDetailCosts: this.qbSyncData.detailCostTransactions().length > 0,

  }));



  arAgingWarning = computed(() =>

    (this.metrics().arBalance > 0 || (this.arRecords() ?? []).some(r => r.openBalance > 0))

    && this.qbSyncData.arAging().length === 0

    && (this.qbSyncData.lastRun()?.tabsMissing ?? []).some(t => t.includes('AR Aging')),

  );



  arAging30Plus = computed(() => this.arCompute.portfolioSummary().days30Plus);



  segmentOptions = computed(() => {

    const opts = FINANCIALS_SEGMENT_OPTIONS.map(o => ({ ...o, badge: undefined as number | undefined }));

    const idx = opts.findIndex(o => o.id === 'sources');

    if (idx >= 0 && this.sourceRows().length) opts[idx].badge = this.sourceRows().length;

    return opts;

  });



  wipFilterOptions = computed(() =>

    WIP_HUB_FILTER_OPTIONS.map(o => ({

      id: o.id,

      label: o.label,

      badge: o.id === 'under20' ? (this.jobsUnderMargin() || undefined) : undefined,

    })),

  );



  commitmentFilterOptions = computed(() => {

    const count = (id: CommitmentFilterId) =>

      id === 'all' ? this.commitmentRows().length : this.commitmentRows().filter(r => matchesCommitmentFilter(r, id)).length;

    return [

      { id: 'all' as CommitmentFilterId, label: 'All', badge: count('all') || undefined },

      { id: 'open' as CommitmentFilterId, label: 'Open', badge: count('open') || undefined },

      { id: 'notInQb' as CommitmentFilterId, label: 'Not in QB', badge: count('notInQb') || undefined },

      { id: 'missingProject' as CommitmentFilterId, label: 'Missing project', badge: count('missingProject') || undefined },

      { id: 'overBudget' as CommitmentFilterId, label: 'Over budget', badge: count('overBudget') || undefined },

      { id: 'needsReview' as CommitmentFilterId, label: 'Needs Review', badge: count('needsReview') || undefined },

    ];

  });



  compactStats = computed(() => {

    const m = this.metrics();

    const qb = qbSyncStatusLabel(m, this.qbSyncData.lastRun()?.completedAt);

    return [

      { label: 'Current contract', value: this.fmt(m.activeWipContractAmount) },

      { label: 'Billed to date', value: this.fmt(m.billedToDate) },

      { label: 'Approved COs not billed', value: this.fmt(m.approvedUnbilledCOAmount), alert: m.approvedUnbilledCOAmount > 0 },

      { label: 'QB sync', value: qb, alert: qb !== 'Synced' },

    ];

  });



  marginLabel = computed(() => `${this.metrics().forecastMargin.toFixed(1)}%`);

  jobsUnderMarginLabel = computed(() => String(this.jobsUnderMargin()));

  payAppsDueLabel = computed(() => String(this.metrics().payAppsDueCount));



  constructor() {

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {

      if (params.get('segment')) {

        this.segment.set(normalizeFinancialsSegment(params.get('segment')));

      }

    });

  }



  fmt(value: number): string {

    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';

  }

  private billingsForDateRange(): Billing[] {

    const range = this.dateRange();

    const billings = this.billings() ?? [];

    if (range === 'allTime') return billings;

    const start = this.dateRangeStart(range);

    const end = new Date();

    return billings.filter(b => {

      const raw = b.billingPeriodEnd ?? b.billingPeriodStart ?? b.paymentDate ?? '';

      if (!raw) return true;

      const dt = new Date(raw);

      return !Number.isNaN(dt.getTime()) && dt >= start && dt <= end;

    });

  }

  private dateRangeStart(range: FinancialsDateRange): Date {

    const now = new Date();

    if (range === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1);

    if (range === 'last3Months') {

      const d = new Date(now);

      d.setMonth(d.getMonth() - 3);

      return d;

    }

    return new Date(now.getFullYear(), 0, 1);

  }

  groupLabel(group: WipGroup): string {
    return wipGroupLabel(group);
  }



  bonusTone(status: string): StatusTone {

    if (status === 'Approved' || status === 'Paid') return 'green';

    if (status === 'NeedsReview' || status === 'MissingData') return 'amber';

    return 'slate';

  }



  setSegment(segment: FinancialsSegmentId): void {

    this.segment.set(segment);

    void this.router.navigate([], {

      relativeTo: this.route,

      queryParams: { segment },

      queryParamsHandling: 'merge',

      replaceUrl: true,

    });

  }



  exportCsv(): void {

    downloadCsv(

      `financials-${this.segment()}-${new Date().toISOString().slice(0, 10)}.csv`,

      this.segment() === 'wip'

        ? ['Job', 'Project', 'Contract', 'Budget basis', 'Cost', 'Margin', 'O/U bill', 'WIP group', 'Warnings', 'Next action']

        : ['Job', 'Project', 'Issue', 'Amount', 'Severity', 'Next action'],

      financialsHubCsvRows(this.segment(), this.overviewRows(), this.filteredWipRows()),

    );

  }



  async resyncQb(): Promise<void> {

    this.qbSyncing.set(true);

    this.syncMessage.set(null);

    try {

      await this.qbSheetsSync.syncFromWorkbook(true);

      this.syncMessage.set('QuickBooks workbook re-synced.');

    } catch (err) {

      this.syncMessage.set(err instanceof Error ? err.message : 'QuickBooks sync failed');

    } finally {

      this.qbSyncing.set(false);

    }

  }

}


