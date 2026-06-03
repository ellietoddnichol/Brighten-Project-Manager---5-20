import { Component, ChangeDetectionStrategy, inject, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SyncHealthService, SyncHealthStatus } from '@core/services/sync-health.service';
import { TimeDataSheetSyncService } from '@core/services/time-data-sheet-sync.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { DataService } from '@core/services/data.service';
import { syncStatusLabel, SettingsSegmentId } from '@shared/utils/settings-hub.compute';

interface SourceCard {
  id: string;
  title: string;
  role: string;
  status: SyncHealthStatus;
  statusLabel: string;
  lastSync?: string;
  lastError?: string;
  detail?: string;
  actionLabel: string;
  detailsFragment?: string;
}

@Component({
  selector: 'app-settings-source-health',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  template: `
    <section id="source-health" class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Source Health</h2>
        <p class="text-sm text-slate-500 mt-1 max-w-3xl">
          External sources feed the app database. Drive holds files; QuickBooks confirms invoices and AR;
          Timekeeper confirms labor; pay apps import only when a new billing file exists.
        </p>
      </div>

      @if (blockingCount() > 0) {
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{{ blockingCount() }}</strong> source{{ blockingCount() === 1 ? '' : 's' }} need attention.
          Open <a routerLink="/settings" fragment="review-center" class="font-semibold underline">Review Center</a> for details.
        </div>
      }

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        @for (card of cards(); track card.id) {
          <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <mat-icon class="!text-[18px]" [class]="statusClass(card.status)">{{ statusIcon(card.status) }}</mat-icon>
                  <h3 class="text-sm font-bold text-slate-900">{{ card.title }}</h3>
                </div>
                <p class="text-xs text-slate-500 mt-1">{{ card.role }}</p>
              </div>
              <span class="text-[10px] uppercase font-bold px-2 py-1 rounded-full"
                    [class]="statusBadgeClass(card.status)">{{ card.statusLabel }}</span>
            </div>

            <dl class="text-xs space-y-1 text-slate-600">
              <div class="flex justify-between gap-2">
                <dt>Last update</dt>
                <dd class="font-medium text-slate-800">{{ card.lastSync ? (card.lastSync | date:'short') : 'Never' }}</dd>
              </div>
              @if (card.detail) {
                <dd class="text-slate-500 pt-1">{{ card.detail }}</dd>
              }
              @if (card.lastError) {
                <dd class="text-rose-700 pt-1">{{ card.lastError }}</dd>
              }
            </dl>

            <div class="mt-auto flex flex-wrap gap-2 pt-2">
              <button type="button" (click)="runAction(card.id)" [disabled]="running()"
                      class="text-xs font-semibold bg-indigo-600 text-white px-3 py-2 rounded-lg disabled:opacity-50">
                {{ card.actionLabel }}
              </button>
              @if (card.detailsFragment) {
                <a [routerLink]="['/settings']" [fragment]="card.detailsFragment"
                   class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">View details</a>
              }
            </div>
          </article>
        }
      </div>

      <details class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">All sync feeds (technical)</summary>
        <div class="px-5 pb-5 overflow-x-auto">
          <table class="w-full text-xs">
            <thead class="text-left text-[10px] uppercase text-slate-500 border-b">
              <tr>
                <th class="py-2 pr-3">Feed</th>
                <th class="py-2 pr-3">Status</th>
                <th class="py-2 pr-3">Last sync</th>
                <th class="py-2">Imported</th>
              </tr>
            </thead>
            <tbody>
              @for (row of syncHealth.rows(); track row.id) {
                <tr class="border-b border-slate-50">
                  <td class="py-2 pr-3 font-medium">{{ row.label }}</td>
                  <td class="py-2 pr-3 capitalize">{{ statusLabelFn(row.status) }}</td>
                  <td class="py-2 pr-3">{{ row.lastSync ? (row.lastSync | date:'short') : '—' }}</td>
                  <td class="py-2 font-mono">{{ row.rowsImported ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>

      @if (actionMessage()) {
        <p class="text-sm text-emerald-700">{{ actionMessage() }}</p>
      }
      @if (actionError()) {
        <p class="text-sm text-rose-700">{{ actionError() }}</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSourceHealthComponent {
  navigate = output<SettingsSegmentId>();

  syncHealth = inject(SyncHealthService);
  timeSync = inject(TimeDataSheetSyncService);
  qbSync = inject(QuickBooksSyncSheetsService);
  qbData = inject(QuickBooksSyncDataService);
  data = inject(DataService);

  actionMessage = signal<string | null>(null);
  actionError = signal<string | null>(null);
  running = computed(() => this.timeSync.syncing() || this.qbSync.syncing());

  readonly statusLabelFn = syncStatusLabel;

  blockingCount = computed(() => this.syncHealth.blockingWarnings().length);

  cards = computed((): SourceCard[] => {
    const rows = this.syncHealth.rows();
    const find = (id: string) => rows.find(r => r.id === id);
    const masterTime = find('master-time');
    const qb = find('qb-workbook');
    const drive = find('drive-folders');
    const firestore = find('firestore');
    const billing = find('import-exceptions');

    return [
      {
        id: 'drive',
        title: 'Google Drive',
        role: 'Confirms folder links and document paths — files stay in Drive.',
        status: drive?.status ?? 'not_connected',
        statusLabel: syncStatusLabel(drive?.status ?? 'not_connected'),
        lastSync: drive?.lastSync,
        detail: drive?.detail,
        actionLabel: 'Check Drive links',
        detailsFragment: 'import-center',
      },
      {
        id: 'qb',
        title: 'QuickBooks',
        role: 'Updates invoices, payments, AR, and accounting actuals.',
        status: qb?.status ?? 'not_connected',
        statusLabel: syncStatusLabel(qb?.status ?? 'not_connected'),
        lastSync: qb?.lastSync ?? this.qbData.lastRun()?.completedAt,
        lastError: this.qbSync.lastSyncError() ?? undefined,
        detail: qb?.detail,
        actionLabel: this.qbSync.syncing() ? 'Refreshing…' : 'Refresh QBO',
      },
      {
        id: 'time',
        title: 'Timekeeper',
        role: 'Updates labor hours and labor actuals from Master Time Sheet.',
        status: masterTime?.status ?? 'not_connected',
        statusLabel: syncStatusLabel(masterTime?.status ?? 'not_connected'),
        lastSync: masterTime?.lastSync ?? this.timeSync.lastSyncAt() ?? undefined,
        lastError: this.timeSync.lastSyncError() ?? undefined,
        detail: masterTime?.detail,
        actionLabel: this.timeSync.syncing() ? 'Refreshing…' : 'Refresh labor',
      },
      {
        id: 'billing',
        title: 'Billing / SOV',
        role: 'Imports new pay apps and invoices only when a file is uploaded.',
        status: billing?.status ?? 'connected',
        statusLabel: billing ? syncStatusLabel(billing.status) : 'Ready',
        detail: 'Use Import Center when a new pay app or invoice arrives.',
        actionLabel: 'Import billing file',
        detailsFragment: 'import-center',
      },
      {
        id: 'setup',
        title: 'Project Setup',
        role: 'Job records live in the app — completion check finds incomplete setup.',
        status: this.setupStatus(),
        statusLabel: syncStatusLabel(this.setupStatus()),
        detail: `${this.data.projectsSnapshot().length} project records in app database.`,
        actionLabel: 'Run completion check',
        detailsFragment: 'review-center',
      },
      {
        id: 'database',
        title: 'App Database',
        role: 'Stores project records, billing summaries, SOV lines, review flags, and source links.',
        status: firestore?.status ?? 'connected',
        statusLabel: syncStatusLabel(firestore?.status ?? 'connected'),
        lastSync: firestore?.lastSync,
        detail: firestore?.detail ?? 'Firestore is the operational app database — not an external sync source.',
        actionLabel: 'Check connection',
      },
    ];
  });

  private setupStatus(): SyncHealthStatus {
    const exceptions = this.syncHealth.rows().find(r => r.id === 'import-exceptions');
    if (exceptions?.status === 'error') return 'warning';
    return 'connected';
  }

  statusIcon(status: SyncHealthStatus): string {
    switch (status) {
      case 'connected': return 'check_circle';
      case 'warning': return 'warning';
      case 'error': return 'error';
      default: return 'link_off';
    }
  }

  statusClass(status: SyncHealthStatus): string {
    switch (status) {
      case 'connected': return 'text-emerald-600';
      case 'warning': return 'text-amber-600';
      case 'error': return 'text-rose-600';
      default: return 'text-slate-400';
    }
  }

  statusBadgeClass(status: SyncHealthStatus): string {
    switch (status) {
      case 'connected': return 'bg-emerald-50 text-emerald-800';
      case 'warning': return 'bg-amber-50 text-amber-800';
      case 'error': return 'bg-rose-50 text-rose-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  async runAction(id: string): Promise<void> {
    this.actionMessage.set(null);
    this.actionError.set(null);
    try {
      switch (id) {
        case 'time':
          await this.timeSync.syncFromTimeDataSheet(true);
          this.actionMessage.set(this.timeSync.lastSyncMessage() ?? 'Labor refreshed from Master Time Sheet.');
          break;
        case 'qb':
          await this.qbSync.syncFromWorkbook(true);
          this.actionMessage.set(this.qbSync.lastMessage() ?? 'QuickBooks workbook refreshed.');
          break;
        case 'drive':
        case 'billing':
        case 'setup':
          this.navigate.emit(id === 'setup' ? 'reviewCenter' : 'importCenter');
          break;
        case 'database':
          this.actionMessage.set(`Connected — ${this.data.projectsSnapshot().length} projects in Firestore.`);
          break;
      }
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Action failed.');
    }
  }
}
