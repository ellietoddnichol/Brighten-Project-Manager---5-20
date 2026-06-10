import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { WipService } from '@features/financials/services/wip.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { StatusChipComponent } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { downloadCsv } from '@shared/utils/csv-export';
import { wipConfidenceLabel, wipGroupLabel } from '@features/financials/utils/wip.compute';
import {
  normalizeWipPageSegment,
  sortWipRecords,
  summarizeWipHub,
  WIP_HUB_CSV_HEADERS,
  WIP_PAGE_SEGMENT_OPTIONS,
  wipHubCsvRows,
  WipPageSegmentId,
} from '@features/financials/utils/wip-hub.compute';
import { WIPRecord } from '@app/models/financial.types';

@Component({
  selector: 'app-wip-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    PageHeaderComponent,
    StatCardComponent,
    CompactStatStripComponent,
    SegmentedControlComponent,
    StatusChipComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header
        title="WIP"
        subtitle="Active jobs, over/under billing, projected margin, and closeout AR">
        <button type="button" (click)="recalculate()" [disabled]="recalculating()"
                class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ recalculating() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          {{ recalculating() ? 'Recalculating…' : 'Recalculate WIP' }}
        </button>
        <button type="button" (click)="exportCsv()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export CSV
        </button>
        <a routerLink="/settings" fragment="source-review"
           class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Source Review
        </a>
      </app-page-header>

      @if (hubMessage()) {
        <p class="text-sm text-emerald-700 -mt-2">{{ hubMessage() }}</p>
      }

      @if (sourceWarning()) {
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {{ sourceWarning() }}
        </div>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" (click)="setSegment('activeWip')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Active WIP" [value]="num(summary().activeWipJobs)" icon="work"
                         [trend]="fmt(summary().activeWipContract)" />
        </button>
        <button type="button" (click)="setSegment('activeWip')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Projected Margin" [value]="marginLabel()" icon="trending_up"
                         />
        </button>
        <button type="button" (click)="setSegment('activeWip')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Over / Under Billing" [value]="fmt(summary().overUnderBilling)" icon="compare_arrows"
                         [trend]="summary().overUnderBilling > 0 ? 'Overbilled' : (summary().overUnderBilling < 0 ? 'Underbilled' : undefined)"
                         [trendPositive]="Math.abs(summary().overUnderBilling) < 1000" />
        </button>
        <button type="button" (click)="setSegment('closeoutAr')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Closeout AR" [value]="fmt(summary().closeoutAr)" icon="receipt_long"
                         [trend]="summary().closeoutAr > 0 ? 'Collections' : undefined" [trendPositive]="false" />
        </button>
      </div>

      @if (compactStats().length) {
        <app-compact-stat-strip [stats]="compactStats()" />
      }

      <app-segmented-control [options]="segmentOptions" [value]="segment()" (select)="setSegment($event)" />

      <div class="flex flex-wrap items-center gap-3 mb-2">
        <div class="relative flex-1 min-w-[220px] max-w-md">
          <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px]">search</mat-icon>
          <input type="text" [ngModel]="jobSearch()" (ngModelChange)="jobSearch.set($event)"
                 placeholder="Filter in-progress jobs by # or name…"
                 class="w-full pl-10 pr-4 py-2.5 bg-white rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-300 outline-none">
        </div>
        <span class="text-xs text-slate-500">{{ filteredRows().length }} job(s) shown</span>
      </div>

      <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        @for (row of filteredRows(); track row.projectId) {
          <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'financials', view: 'wip' }"
             class="block px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer">
            <div class="flex flex-wrap items-start gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="text-xs font-bold font-numeric text-slate-500">#{{ row.jobNumber }}</span>
                  <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
                  <app-status-chip tone="slate">{{ groupLabel(row.wipGroup) }}</app-status-chip>
                  @if (row.wipConfidence) {
                    <app-status-chip [tone]="confidenceTone(row.wipConfidence)">{{ confidenceLabel(row.wipConfidence) }}</app-status-chip>
                  }
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span><span class="text-slate-400">Contract</span> <span class="font-numeric font-semibold">{{ fmt(row.contractAmount) }}</span></span>
                  <span><span class="text-slate-400">Basis</span> <span class="font-semibold">{{ row.budgetBasisLabel }}</span></span>
                  <span><span class="text-slate-400">EFC</span> <span class="font-numeric font-semibold">{{ fmt(row.estimatedFinalCost) }}</span></span>
                  <span><span class="text-slate-400">Actual</span> <span class="font-numeric font-semibold">{{ fmt(row.costToDate) }}</span></span>
                  <span><span class="text-slate-400">Billed</span> <span class="font-numeric font-semibold">{{ fmt(row.billedToDate) }}</span></span>
                  <span><span class="text-slate-400">Earned</span> <span class="font-numeric font-semibold">{{ fmt(row.earnedRevenue) }}</span></span>
                  <span><span class="text-slate-400">O/U</span>
                    <span class="text-xs font-numeric px-1.5 py-0.5 rounded"
                          [class.text-rose-700]="row.overUnderBilling > 1000"
                          [class.bg-rose-50]="row.overUnderBilling > 1000"
                          [class.text-emerald-700]="row.overUnderBilling < -1000"
                          [class.bg-emerald-50]="row.overUnderBilling < -1000"
                          [class.text-slate-700]="Math.abs(row.overUnderBilling) <= 1000">{{ fmt(row.overUnderBilling) }}</span>
                  </span>
                  <span><span class="text-slate-400">Margin</span> <span class="font-numeric font-semibold" [class.text-rose-700]="row.forecastMargin < 20">{{ row.forecastMargin | number:'1.0-1' }}%</span></span>
                  @if (row.arBalance > 0) {
                    <span><span class="text-slate-400">AR</span> <span class="font-numeric font-semibold text-orange-700">{{ fmt(row.arBalance) }}</span></span>
                  }
                </div>
                @if (row.warningChips?.length) {
                  <div class="flex flex-wrap gap-1.5 mt-2">
                    @for (chip of row.warningChips; track chip.label) {
                      <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                            [class.bg-rose-100]="chip.tone === 'critical'"
                            [class.text-rose-800]="chip.tone === 'critical'"
                            [class.bg-amber-100]="chip.tone === 'amber'"
                            [class.text-amber-800]="chip.tone === 'amber'">{{ chip.label }}</span>
                    }
                  </div>
                }
              </div>
              <span class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</span>
            </div>
          </a>
        } @empty {
          <div class="p-5">
            <app-empty-state title="No WIP jobs match this segment" message="Try another filter or refresh WIP data." />
          </div>
        }
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WipPage {
  private wipSvc = inject(WipService);
  private financialSvc = inject(ProjectFinancialService);
  private qbSync = inject(QuickBooksSyncSheetsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly Math = Math;
  readonly segmentOptions = WIP_PAGE_SEGMENT_OPTIONS;
  readonly groupLabel = wipGroupLabel;
  readonly confidenceLabel = wipConfidenceLabel;

  segment = signal<WipPageSegmentId>('activeWip');
  jobSearch = signal('');
  hubMessage = signal<string | null>(null);
  recalculating = signal(false);

  allRecords = computed(() => sortWipRecords(this.wipSvc.computeAll()));
  metrics = computed(() => this.financialSvc.portfolioMetrics());
  summary = computed(() => summarizeWipHub(this.allRecords(), this.metrics()));

  sourceWarning = computed(() => {
    const rows = this.allRecords();
    const missingArTab = rows.some(r => r.warningChips?.some(c => c.label === 'Missing AR Aging Summary'));
    if (missingArTab) {
      return 'QuickBooks AR Aging Summary tab is missing — open AR totals may be incomplete until the workbook includes aging data.';
    }
    return null;
  });

  filteredRows = computed(() => {
    const seg = this.segment();
    const q = this.jobSearch().trim().toLowerCase();
    return this.allRecords().filter(r => {
      if (!this.matchesSegment(r, seg)) return false;
      if (!q) return true;
      return (r.jobNumber ?? '').toLowerCase().includes(q) || (r.projectName ?? '').toLowerCase().includes(q);
    });
  });

  compactStats = computed(() => {
    const s = this.summary();
    return [
      { label: 'Current Contract', value: this.fmt(s.currentContract) },
      { label: 'Budget / EFC', value: this.fmt(s.budgetEfc) },
      { label: 'Actual Cost', value: this.fmt(s.actualCost) },
      { label: 'Billed to Date', value: this.fmt(s.billedToDate) },
      { label: 'Open AR', value: this.fmt(s.openAr) },
      { label: 'Missing Contract', value: String(s.missingContract), alert: s.missingContract > 0 },
      { label: 'Missing Actual Cost Source', value: String(s.missingActualCostSource), alert: s.missingActualCostSource > 0 },
    ];
  });

  marginLabel = computed(() => `${this.summary().projectedMarginPct.toFixed(1)}%`);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const seg = normalizeWipPageSegment(params.get('segment'));
      this.segment.set(seg);
    });
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  num(n: number): string {
    return String(n ?? 0);
  }

  confidenceTone(confidence: string): 'green' | 'amber' | 'red' | 'slate' {
    switch (confidence) {
      case 'Good': return 'green';
      case 'Estimated': return 'amber';
      case 'NeedsSource': return 'amber';
      case 'NeedsReview': return 'red';
      default: return 'slate';
    }
  }

  matchesSegment(record: WIPRecord, segment: WipPageSegmentId): boolean {
    switch (segment) {
      case 'activeWip': return record.wipGroup === 'ActiveWIP';
      case 'upcoming': return record.wipGroup === 'UpcomingWIP';
      case 'closeoutAr': return record.wipGroup === 'CloseoutAR';
      case 'needsReview':
        return !!record.needsReview || !!(record.warningChips?.length);
      case 'archive': return record.wipGroup === 'ExcludedArchive';
      case 'all': return true;
      default: return true;
    }
  }

  setSegment(id: string): void {
    const seg = normalizeWipPageSegment(id);
    this.segment.set(seg);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { segment: seg === 'activeWip' ? null : seg },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async recalculate(): Promise<void> {
    if (this.recalculating()) return;
    this.recalculating.set(true);
    this.hubMessage.set(null);
    try {
      await this.qbSync.syncFromWorkbook();
      this.hubMessage.set('WIP recalculated from latest QuickBooks sync.');
    } catch {
      this.hubMessage.set('WIP refreshed from current app data.');
    } finally {
      this.recalculating.set(false);
    }
  }

  exportCsv(): void {
    downloadCsv('wip-export.csv', WIP_HUB_CSV_HEADERS, wipHubCsvRows(this.filteredRows()));
  }
}
