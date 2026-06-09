import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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
    RouterLink,
    MatIconModule,
    PageHeaderComponent,
    StatCardComponent,
    CompactStatStripComponent,
    SegmentedControlComponent,
    StatusChipComponent,
  ],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-page-header
        title="WIP"
        subtitle="Active jobs, over/under billing, projected margin, and closeout AR"
        primaryActionLabel="Recalculate WIP"
        (primaryAction)="recalculate()">
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

      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        @for (row of filteredRows(); track row.projectId) {
          <div class="px-5 py-4 hover:bg-slate-50/80">
            <div class="flex flex-wrap items-start gap-4">
              <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'financials', view: 'wip' }"
                 class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="text-xs font-bold font-mono text-slate-500">#{{ row.jobNumber }}</span>
                  <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
                  <app-status-chip tone="slate">{{ groupLabel(row.wipGroup) }}</app-status-chip>
                  @if (row.wipConfidence) {
                    <app-status-chip [tone]="confidenceTone(row.wipConfidence)">{{ confidenceLabel(row.wipConfidence) }}</app-status-chip>
                  }
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span><span class="text-slate-400">Contract</span> <span class="font-mono font-semibold">{{ fmt(row.contractAmount) }}</span></span>
                  <span><span class="text-slate-400">Basis</span> <span class="font-semibold">{{ row.budgetBasisLabel }}</span></span>
                  <span><span class="text-slate-400">EFC</span> <span class="font-mono font-semibold">{{ fmt(row.estimatedFinalCost) }}</span></span>
                  <span><span class="text-slate-400">Actual</span> <span class="font-mono font-semibold">{{ fmt(row.costToDate) }}</span></span>
                  <span><span class="text-slate-400">Billed</span> <span class="font-mono font-semibold">{{ fmt(row.billedToDate) }}</span></span>
                  <span><span class="text-slate-400">Earned</span> <span class="font-mono font-semibold">{{ fmt(row.earnedRevenue) }}</span></span>
                  <span><span class="text-slate-400">O/U</span> <span class="font-mono font-semibold" [class.text-rose-700]="row.overUnderBilling > 1000" [class.text-blue-700]="row.overUnderBilling < -1000">{{ fmt(row.overUnderBilling) }}</span></span>
                  <span><span class="text-slate-400">Margin</span> <span class="font-mono font-semibold" [class.text-rose-700]="row.forecastMargin < 20">{{ row.forecastMargin | number:'1.0-1' }}%</span></span>
                  @if (row.arBalance > 0) {
                    <span><span class="text-slate-400">AR</span> <span class="font-mono font-semibold text-orange-700">{{ fmt(row.arBalance) }}</span></span>
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
              </a>
              <span class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</span>
            </div>
          </div>
        } @empty {
          <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No WIP jobs match this segment</div>
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
    return this.allRecords().filter(r => this.matchesSegment(r, seg));
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
