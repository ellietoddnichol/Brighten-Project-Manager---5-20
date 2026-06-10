import { Component, ChangeDetectionStrategy, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { ArComputeService } from '@features/financials/services/ar-compute.service';
import { ArService } from '@features/financials/services/ar.service';
import { DataService } from '@core/services/data.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { StatusChipComponent } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { downloadCsv } from '@shared/utils/csv-export';
import {
  AR_HUB_CSV_HEADERS,
  AR_PAGE_SEGMENT_OPTIONS,
  ArJobRow,
  ArPageSegmentId,
  arHubCsvRows,
  isUnmatchedArProjectId,
  matchesArJobSegment,
  normalizeArPageSegment,
} from '@features/financials/utils/ar.compute';

@Component({
  selector: 'app-ar-page',
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
        title="AR"
        subtitle="Open receivables, aging, and collection follow-up"
        primaryActionLabel="Re-sync QuickBooks"
        (primaryAction)="resyncQuickBooks()">
        <button type="button" (click)="exportCsv()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
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

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        @for (bucket of agingBuckets(); track bucket.label) {
          <div class="rounded-lg border p-4" [ngClass]="bucket.boxClass">
            <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [ngClass]="bucket.labelClass">{{ bucket.label }}</p>
            <p class="text-xl font-black" [ngClass]="bucket.valueClass">{{ fmt(bucket.amount) }}</p>
            <div class="mt-2 h-1.5 rounded-full bg-white/60 overflow-hidden">
              <div class="h-full rounded-full transition-all" [ngClass]="bucket.barClass" [style.width.%]="bucket.pct"></div>
            </div>
          </div>
        }
      </div>

      @if (compactStats().length) {
        <app-compact-stat-strip [stats]="compactStats()" />
      }

      <app-segmented-control [options]="segmentOptions" [value]="segment()" (select)="setSegment($event)" />

      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[220px] max-w-md">
          <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px]">search</mat-icon>
          <input type="text" [ngModel]="projectSearch()" (ngModelChange)="projectSearch.set($event)"
                 placeholder="Filter by job # or project name…"
                 class="w-full pl-10 pr-4 py-2.5 bg-white rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-300 outline-none">
        </div>
        <span class="text-xs text-slate-500">{{ filteredRows().length }} job(s) shown</span>
      </div>

      <section class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        @for (row of filteredRows(); track row.projectId) {
          <div class="px-5 py-4 hover:bg-slate-50 transition-colors">
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
              <div class="flex flex-col items-end gap-2 shrink-0">
                <span class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg">{{ row.nextAction }}</span>
                @if (row.totalOpen > 0 && !row.isUnmatched) {
                  <button type="button" (click)="markRowPaid(row)"
                          class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    Mark as Paid
                  </button>
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="p-5">
            <app-empty-state title="No AR rows match this segment" message="Adjust the segment filter or sync AR data." />
          </div>
        }
      </section>
    </div>

    <ng-template #rowBody let-row>
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <span class="text-xs font-bold font-numeric text-slate-500">#{{ row.jobNumber }}</span>
        <span class="text-sm font-bold text-slate-900">{{ row.projectName }}</span>
        <span class="text-xs text-slate-500">{{ row.customerName }}</span>
        <app-status-chip tone="slate">{{ row.lifecycleLabel }}</app-status-chip>
        <app-status-chip tone="slate">{{ row.sourceLabel }}</app-status-chip>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span><span class="text-slate-400">Current</span> <span class="font-numeric font-semibold">{{ fmt(row.current) }}</span></span>
        <span><span class="text-slate-400">1–30</span> <span class="font-numeric font-semibold">{{ fmt(row.days1To30) }}</span></span>
        <span><span class="text-slate-400">31–60</span> <span class="font-numeric font-semibold">{{ fmt(row.days31To60) }}</span></span>
        <span><span class="text-slate-400">61–90</span> <span class="font-numeric font-semibold">{{ fmt(row.days61To90) }}</span></span>
        <span><span class="text-slate-400">90+</span> <span class="font-numeric font-semibold">{{ fmt(row.days90Plus) }}</span></span>
        <span><span class="text-slate-400">Open</span> <span class="font-numeric font-semibold text-orange-700">{{ fmt(row.totalOpen) }}</span></span>
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
  projectSearch = signal('');
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
    const q = this.projectSearch().trim().toLowerCase();
    return this.allRows().filter(r => {
      if (!matchesArJobSegment(r, seg)) return false;
      if (!q) return true;
      return (r.jobNumber ?? '').toLowerCase().includes(q)
        || (r.projectName ?? '').toLowerCase().includes(q)
        || (r.customerName ?? '').toLowerCase().includes(q);
    });
  });

  agingBuckets = computed(() => {
    const s = this.summary();
    const buckets = [
      { label: 'Current', amount: s.current, boxClass: 'border-emerald-200 bg-emerald-50', labelClass: 'text-emerald-700', valueClass: 'text-emerald-900', barClass: 'bg-emerald-500' },
      { label: '30–60', amount: s.days1To30 + s.days31To60, boxClass: 'border-amber-200 bg-amber-50', labelClass: 'text-amber-700', valueClass: 'text-amber-900', barClass: 'bg-amber-500' },
      { label: '60–90', amount: s.days61To90, boxClass: 'border-orange-200 bg-orange-50', labelClass: 'text-orange-700', valueClass: 'text-orange-900', barClass: 'bg-orange-500' },
      { label: '90+', amount: s.days90Plus, boxClass: 'border-rose-200 bg-rose-50', labelClass: 'text-rose-700', valueClass: 'text-rose-900', barClass: 'bg-rose-500' },
    ];
    const total = buckets.reduce((sum, b) => sum + b.amount, 0) || 1;
    return buckets.map(b => ({ ...b, pct: Math.max(4, Math.round((b.amount / total) * 100)) }));
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

  async markRowPaid(row: ArJobRow): Promise<void> {
    const openRecords = row.records.filter(r => r.status !== 'Paid' && (r.openBalance ?? 0) > 0);
    if (!openRecords.length) return;
    const msg = `Mark all open AR (${this.fmt(row.totalOpen)}) for ${row.projectName} as paid?`;
    if (!confirm(msg)) return;
    try {
      for (const rec of openRecords) {
        await this.arSvc.markPaid(rec);
      }
      await this.arSvc.refreshArAutomation();
      this.hubMessage.set(`Marked ${openRecords.length} invoice(s) paid for ${row.projectName}.`);
    } catch {
      this.hubMessage.set('Could not mark AR as paid — try again.');
    }
  }
}
