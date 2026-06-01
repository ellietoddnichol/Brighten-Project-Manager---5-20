import { Component, ChangeDetectionStrategy, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ArComputeService } from '../services/ar-compute.service';
import { ArService } from '../services/ar.service';
import { DataService } from '../services/data.service';
import { QuickBooksSyncSheetsService } from '../services/quickbooks-sync-sheets.service';
import { PageHeaderComponent } from '../components/ui/page-header';
import { StatCardComponent } from '../components/ui/stat-card';
import { CompactStatStripComponent } from '../components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '../components/ui/segmented-control';
import { StatusChipComponent } from '../components/ui/status-chip';
import { downloadCsv } from '../utils/csv-export';
import {
  AR_HUB_CSV_HEADERS,
  AR_PAGE_SEGMENT_OPTIONS,
  ArJobRow,
  ArPageSegmentId,
  arHubCsvRows,
  isUnmatchedArProjectId,
  matchesArJobSegment,
  normalizeArPageSegment,
} from '../utils/ar.compute';

@Component({
  selector: 'app-ar-page',
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
        title="AR"
        subtitle="Open receivables, aging, and collection follow-up"
        primaryActionLabel="Re-sync QuickBooks"
        (primaryAction)="resyncQuickBooks()">
        <button type="button" (click)="exportCsv()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export CSV
        </button>
        <a routerLink="/settings" fragment="import-review"
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
        <button type="button" (click)="setSegment('open')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Open AR" [value]="fmt(summary().openAr)" icon="receipt_long"
                         [trend]="summary().openAr > 0 ? 'Collections' : undefined" [trendPositive]="summary().openAr === 0" />
        </button>
        <button type="button" (click)="setSegment('pastDue')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Past Due" [value]="fmt(summary().pastDue)" icon="schedule"
                         [trend]="summary().pastDue > 0 ? 'Needs follow-up' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('days30Plus')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="30+ Days" [value]="fmt(summary().days30Plus)" icon="hourglass_top"
                         [trend]="summary().days30Plus > 0 ? 'Escalate' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('closeout')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Closeout AR" [value]="fmt(summary().closeoutAr)" icon="lock_clock"
                         [trend]="summary().closeoutAr > 0 ? 'Closeout collections' : undefined" [trendPositive]="false" />
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
              @if (rowLink(row); as link) {
                <a [routerLink]="link" [queryParams]="{ section: 'financials', view: 'ar' }"
                   class="min-w-0 flex-1">
                  <ng-container *ngTemplateOutlet="rowBody; context: { $implicit: row }" />
                </a>
              } @else {
                <div class="min-w-0 flex-1">
                  <ng-container *ngTemplateOutlet="rowBody; context: { $implicit: row }" />
                </div>
              }
              <span class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg shrink-0">{{ row.nextAction }}</span>
            </div>
          </div>
        } @empty {
          <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No AR rows match this segment</div>
        }
      </section>
    </div>

    <ng-template #rowBody let-row>
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <span class="text-xs font-bold font-mono text-slate-500">#{{ row.jobNumber }}</span>
        <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
        <span class="text-xs text-slate-500">{{ row.customerName }}</span>
        <app-status-chip tone="slate">{{ row.lifecycleLabel }}</app-status-chip>
        <app-status-chip tone="slate">{{ row.sourceLabel }}</app-status-chip>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span><span class="text-slate-400">Current</span> <span class="font-mono font-semibold">{{ fmt(row.current) }}</span></span>
        <span><span class="text-slate-400">1–30</span> <span class="font-mono font-semibold">{{ fmt(row.days1To30) }}</span></span>
        <span><span class="text-slate-400">31–60</span> <span class="font-mono font-semibold">{{ fmt(row.days31To60) }}</span></span>
        <span><span class="text-slate-400">61–90</span> <span class="font-mono font-semibold">{{ fmt(row.days61To90) }}</span></span>
        <span><span class="text-slate-400">90+</span> <span class="font-mono font-semibold">{{ fmt(row.days90Plus) }}</span></span>
        <span><span class="text-slate-400">Open</span> <span class="font-mono font-semibold text-orange-700">{{ fmt(row.totalOpen) }}</span></span>
        <span><span class="text-slate-400">Status</span> <span class="font-semibold">{{ row.collectionStatus }}</span></span>
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
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArPage implements OnInit {
  private arCompute = inject(ArComputeService);
  private arSvc = inject(ArService);
  private data = inject(DataService);
  private qbSync = inject(QuickBooksSyncSheetsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly segmentOptions = AR_PAGE_SEGMENT_OPTIONS;

  segment = signal<ArPageSegmentId>('open');
  hubMessage = signal<string | null>(null);
  syncing = signal(false);

  ctx = computed(() => this.arCompute.buildContext());
  summary = computed(() => this.arCompute.portfolioSummary(this.ctx()));
  allRows = computed(() => this.arCompute.jobRows(this.ctx()));

  sourceWarning = computed(() => {
    const s = this.summary();
    if (s.missingArSource && s.openAr > 0) {
      return 'AR Aging Summary tab missing — AR cannot be fully synced. Cached AR records are shown; re-sync QuickBooks after adding the aging tab.';
    }
    if (s.missingArSource) {
      return 'AR Aging Summary tab missing — AR cannot be fully synced.';
    }
    return null;
  });

  filteredRows = computed(() => {
    const seg = this.segment();
    return this.allRows().filter(r => matchesArJobSegment(r, seg));
  });

  compactStats = computed(() => {
    const s = this.summary();
    const stats = [
      { label: 'Current', value: this.fmt(s.current) },
      { label: '1–30', value: this.fmt(s.days1To30), alert: s.days1To30 > 0 },
      { label: '31–60', value: this.fmt(s.days31To60), alert: s.days31To60 > 0 },
      { label: '61–90', value: this.fmt(s.days61To90), alert: s.days61To90 > 0 },
      { label: '90+', value: this.fmt(s.days90Plus), alert: s.days90Plus > 0 },
      { label: 'Disputed', value: this.fmt(s.disputed), alert: s.disputed > 0 },
    ];
    if (s.missingArSource) {
      stats.push({ label: 'Missing AR source', value: 'Yes', alert: true });
    }
    return stats;
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.segment.set(normalizeArPageSegment(params.get('segment')));
    });
  }

  ngOnInit(): void {
    void this.data.waitForProjectsLoaded()
      .then(() => this.arSvc.syncFromPayApps())
      .then(() => this.arSvc.refreshArAutomation());
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  rowLink(row: ArJobRow): string[] | null {
    if (row.isUnmatched || isUnmatchedArProjectId(row.projectId)) return null;
    return ['/projects', row.projectId];
  }

  setSegment(id: string): void {
    const seg = normalizeArPageSegment(id);
    this.segment.set(seg);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { segment: seg === 'open' ? null : seg },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async resyncQuickBooks(): Promise<void> {
    if (this.syncing()) return;
    this.syncing.set(true);
    this.hubMessage.set(null);
    try {
      await this.qbSync.syncFromWorkbook();
      await this.arSvc.syncFromPayApps();
      this.hubMessage.set('QuickBooks AR synced from latest workbook.');
    } catch {
      this.hubMessage.set('AR refreshed from current app data.');
    } finally {
      this.syncing.set(false);
    }
  }

  exportCsv(): void {
    downloadCsv('ar-export.csv', AR_HUB_CSV_HEADERS, arHubCsvRows(this.filteredRows()));
  }
}
