import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { SyncHealthService } from '@core/services/sync-health.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { MasterSheetSyncService } from '@core/services/master-sheet-sync.service';
import { TimeDataSheetSyncService } from '@core/services/time-data-sheet-sync.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { BRIGHTEN_PROFIT_TARGET } from '@app/config/active-2026-jobs.config';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import {
  buildHomePriorities,
  buildHomeSnapshotRows,
  homeSourceHealthFragment,
  homeSourceHealthLabel,
  homeSourceHealthRoute,
  isHomeSourceHealthRow,
} from '@shared/utils/home-hub.compute';

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
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-8">
      <app-page-header
        title="Home"
        subtitle="Brighten command center · Active 2026 jobs · {{ profitTargetPct }}% profit target"
        [hasActions]="true">
        <button type="button"
                (click)="resyncSources()"
                [disabled]="resyncing()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ resyncing() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          {{ resyncing() ? 'Syncing…' : 'Re-sync sources' }}
        </button>
        <a routerLink="/active-2026-control"
           class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2">
          <mat-icon class="!text-[18px]">monitoring</mat-icon>
          Open Active 2026 Control
        </a>
      </app-page-header>

      @if (resyncMessage()) {
        <p class="text-sm text-emerald-700 -mt-4">{{ resyncMessage() }}</p>
      }
      @if (resyncError()) {
        <p class="text-sm text-rose-600 -mt-4">{{ resyncError() }}</p>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        @for (card of homeCards(); track card.id) {
          <a [routerLink]="card.route"
             [queryParams]="card.queryParams"
             class="block rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <app-stat-card
              [label]="card.label"
              [value]="card.value"
              [subtext]="card.subtext"
              [icon]="card.icon"
              [trend]="card.alert ? 'Needs attention' : undefined"
              [trendPositive]="false" />
          </a>
        }
      </div>

      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Today's Priorities</h2>
            <p class="text-xs text-slate-500 mt-0.5">Highest-priority actions across active jobs and sources</p>
          </div>
        </div>
        @if (priorities().length) {
          <div class="divide-y divide-slate-100">
            @for (item of priorities(); track item.id) {
              <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50/80">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    @if (item.jobNumber) {
                      <span class="text-xs font-bold text-slate-900">{{ item.jobNumber }}</span>
                      @if (item.projectName) {
                        <span class="text-xs text-slate-500 truncate max-w-[240px]">{{ item.projectName }}</span>
                      }
                    } @else {
                      <span class="text-sm font-semibold text-slate-900">{{ item.issue }}</span>
                    }
                    <app-status-chip [tone]="item.severity === 'error' ? 'red' : 'amber'">
                      {{ item.severity === 'error' ? 'Critical' : 'Attention' }}
                    </app-status-chip>
                    <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400">{{ item.source }}</span>
                  </div>
                  @if (item.jobNumber) {
                    <p class="text-sm text-slate-600 mt-0.5">{{ item.issue }}</p>
                  }
                </div>
                <a [routerLink]="item.route"
                   [queryParams]="item.queryParams"
                   [fragment]="item.fragment"
                   class="shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                  {{ item.nextActionLabel }}
                </a>
              </div>
            }
          </div>
        } @else {
          <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No urgent priorities — you're caught up</div>
        }
      </section>

      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Active 2026 Snapshot</h2>
            <p class="text-xs text-slate-500 mt-0.5">Top jobs by risk, AR, and billing follow-up</p>
          </div>
          <a routerLink="/active-2026-control"
             class="text-xs font-bold text-indigo-700 hover:text-indigo-800">
            View all in Active 2026 Control
          </a>
        </div>
        @if (snapshotRows().length) {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                  <th class="px-5 py-3">Job #</th>
                  <th class="px-5 py-3">Project</th>
                  <th class="px-5 py-3">Health</th>
                  <th class="px-5 py-3 text-right">Margin</th>
                  <th class="px-5 py-3 text-right">AR</th>
                  <th class="px-5 py-3 text-right">Left to bill</th>
                  <th class="px-5 py-3">Next action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of snapshotRows(); track row.projectId) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-5 py-2.5 font-mono text-xs font-bold text-slate-900">{{ row.jobNumber }}</td>
                    <td class="px-5 py-2.5">
                      <a [routerLink]="['/projects', row.projectId]" class="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate block max-w-[220px]">
                        {{ row.projectName }}
                      </a>
                    </td>
                    <td class="px-5 py-2.5">
                      <app-status-chip [tone]="healthTone(row.health)">{{ row.health }}</app-status-chip>
                    </td>
                    <td class="px-5 py-2.5 text-right font-mono text-xs" [class.text-rose-700]="row.marginPct < profitTargetPct">
                      {{ row.marginPct | number:'1.0-1' }}%
                    </td>
                    <td class="px-5 py-2.5 text-right font-mono text-xs" [class.text-rose-700]="row.arBalance > 0">
                      {{ fmt(row.arBalance) }}
                    </td>
                    <td class="px-5 py-2.5 text-right font-mono text-xs">{{ fmt(row.leftToBill) }}</td>
                    <td class="px-5 py-2.5">
                      <a [routerLink]="row.nextActionRoute" class="text-xs font-semibold text-indigo-700 hover:underline truncate block max-w-[160px]">
                        {{ row.nextActionLabel }}
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="px-5 py-12 text-center text-slate-400 text-sm italic">No active 2026 jobs loaded</div>
        }
      </section>

      @if (sourceWarnings().length) {
        <section class="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 class="text-sm font-bold text-amber-950">Source Health</h2>
            <a routerLink="/settings" fragment="import-review" class="text-xs font-bold text-amber-900 underline">Source Review</a>
          </div>
          <div class="flex flex-wrap gap-2">
            @for (row of sourceWarnings(); track row.id) {
              <a [routerLink]="homeSourceHealthRoute(row.id)"
                 [fragment]="homeSourceHealthFragment(row.id)"
                 class="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:border-amber-300 transition-colors">
                <mat-icon class="!text-[16px] text-amber-600">warning</mat-icon>
                {{ homeSourceHealthLabel(row.label) }}
              </a>
            }
          </div>
        </section>
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
  private masterSync = inject(MasterSheetSyncService);
  private timeSync = inject(TimeDataSheetSyncService);
  private qbSheetsSync = inject(QuickBooksSyncSheetsService);
  private currency = inject(CurrencyPipe);

  readonly profitTargetPct = BRIGHTEN_PROFIT_TARGET * 100;
  readonly homeSourceHealthRoute = homeSourceHealthRoute;
  readonly homeSourceHealthFragment = homeSourceHealthFragment;
  readonly homeSourceHealthLabel = homeSourceHealthLabel;

  resyncing = signal(false);
  resyncMessage = signal<string | null>(null);
  resyncError = signal<string | null>(null);

  homeCards = computed(() => this.globalNeeds.modules().dashboardCards);

  priorities = computed(() => {
    const qbRun = this.qbSyncData.lastRun();
    const qbSyncWarning = !!qbRun?.completedAt && ((qbRun.warnings?.length ?? 0) > 0 || qbRun.status === 'Failed');
    return buildHomePriorities({
      rows: this.globalNeeds.active2026Rows(),
      qbSyncWarning,
      unmatchedSourceCount: this.importReview.unresolvedCount(),
    });
  });

  snapshotRows = computed(() => buildHomeSnapshotRows(this.globalNeeds.active2026Rows(), 10));

  sourceWarnings = computed(() =>
    this.syncHealth.blockingWarnings().filter(row => isHomeSourceHealthRow(row.id)),
  );

  fmt(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  healthTone(health: string): StatusTone {
    switch (health) {
      case 'Green': return 'green';
      case 'Yellow': return 'amber';
      case 'Red': return 'red';
      default: return 'slate';
    }
  }

  async resyncSources(): Promise<void> {
    this.resyncing.set(true);
    this.resyncMessage.set(null);
    this.resyncError.set(null);
    try {
      await this.masterSync.syncFromMasterSheet(true);
      await this.timeSync.syncFromTimeDataSheet(true);
      await this.qbSheetsSync.syncFromWorkbook(true);
      this.resyncMessage.set('Sources re-synced — Master Sheet, Master Time, and QuickBooks workbook.');
    } catch (err) {
      this.resyncError.set(err instanceof Error ? err.message : 'Source sync failed');
    } finally {
      this.resyncing.set(false);
    }
  }
}
