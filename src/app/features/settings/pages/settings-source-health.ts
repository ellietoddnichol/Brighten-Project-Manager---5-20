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
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { qbSyncConfig, qbWorkbookSyncEnabled } from '@app/config/qb-sync.config';

interface SourceCard {
  id: string;
  title: string;
  role: string;
  status: SyncHealthStatus;
  statusLabel: string;
  lastSync?: string;
  lastError?: string;
  detail?: string;
  detailsFragment?: string;
}

@Component({
  selector: 'app-settings-source-health',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink, StatusChipComponent],
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
              <app-status-chip [tone]="statusTone(card.status)" [label]="card.statusLabel" />
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
              @if (card.id === 'qb' && qbManualMode()) {
                <span class="text-xs text-slate-500">Manual entry — edit projects directly</span>
                <button type="button" (click)="enableQbWorkbookSync()"
                        class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                  Enable workbook sync
                </button>
              } @else {
              <button type="button" (click)="runAction(card.id)" [disabled]="running()"
                      class="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors disabled:opacity-50">
                {{ running() ? 'Testing…' : (card.id === 'qb' && qbManualMode() ? 'Disabled' : 'Test Connection') }}
              </button>
              }
              @if (card.detailsFragment) {
                <a [routerLink]="['/settings']" [fragment]="card.detailsFragment"
                   class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                  View details
                </a>
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
                  <td class="py-2 pr-3">
                    <app-status-chip [tone]="statusTone(row.status)" [label]="statusLabelFn(row.status)" />
                  </td>
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

  qbManualMode = computed(() => !qbWorkbookSyncEnabled());

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
        detailsFragment: 'import-center',
      },
      {
        id: 'qb',
        title: 'QuickBooks',
        role: qbSyncConfig.isManualMode()
          ? 'Manual entry — update contract, AR, and billing on each project. Workbook auto-sync is off.'
          : 'Updates invoices, payments, AR, and accounting actuals from the QB export workbook.',
        status: qb?.status ?? (qbSyncConfig.isManualMode() ? 'connected' : 'not_connected'),
        statusLabel: qbSyncConfig.isManualMode() ? 'Manual' : syncStatusLabel(qb?.status ?? 'not_connected'),
        lastSync: qbSyncConfig.isManualMode() ? undefined : (qb?.lastSync ?? this.qbData.lastRun()?.completedAt),
        lastError: qbSyncConfig.isManualMode() ? undefined : (this.qbSync.lastSyncError() ?? undefined),
        detail: qbSyncConfig.isManualMode()
          ? 'You control financials in the app. Re-enable workbook sync here if needed later.'
          : qb?.detail,
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
      },
      {
        id: 'billing',
        title: 'Billing / SOV',
        role: 'Imports new pay apps and invoices only when a file is uploaded.',
        status: billing?.status ?? 'connected',
        statusLabel: billing ? syncStatusLabel(billing.status) : 'Ready',
        detail: 'Use Import Center when a new pay app or invoice arrives.',
        detailsFragment: 'import-center',
      },
      {
        id: 'setup',
        title: 'Project Setup',
        role: 'Job records live in the app — completion check finds incomplete setup.',
        status: this.setupStatus(),
        statusLabel: syncStatusLabel(this.setupStatus()),
        detail: `${this.data.projectsSnapshot().length} project records in app database.`,
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
      },
    ];
  });

  private setupStatus(): SyncHealthStatus {
    const exceptions = this.syncHealth.rows().find(r => r.id === 'import-exceptions');
    if (exceptions?.status === 'error') return 'warning';
    return 'connected';
  }

  statusTone(status: SyncHealthStatus): StatusTone {
    switch (status) {
      case 'connected': return 'green';
      case 'warning': return 'amber';
      case 'error': return 'red';
      default: return 'slate';
    }
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
      case 'connected': return 'text-emerald-700';
      case 'warning': return 'text-amber-700';
      case 'error': return 'text-rose-700';
      default: return 'text-slate-400';
    }
  }

  async runAction(id: string): Promise<void> {
    this.actionMessage.set(null);
    this.actionError.set(null);
    if (id === 'qb' && qbSyncConfig.isManualMode()) {
      this.actionMessage.set('QuickBooks workbook sync is off. Edit financials on each project, or click Enable workbook sync.');
      return;
    }
    try {
      switch (id) {
        case 'time':
          await this.timeSync.syncFromTimeDataSheet(true);
          this.actionMessage.set(this.timeSync.lastSyncMessage() ?? 'Labor connection OK — Master Time Sheet refreshed.');
          break;
        case 'qb':
          await this.qbSync.syncFromWorkbook(true);
          this.actionMessage.set(this.qbSync.lastMessage() ?? 'QuickBooks connection OK — workbook refreshed.');
          break;
        case 'drive':
        case 'billing':
        case 'setup':
          this.navigate.emit(id === 'setup' ? 'reviewCenter' : 'importCenter');
          this.actionMessage.set('Connection check passed — open the linked section for details.');
          break;
        case 'database':
          this.actionMessage.set(`Connected — ${this.data.projectsSnapshot().length} projects in Firestore.`);
          break;
      }
    } catch (err) {
      this.actionError.set(err instanceof Error ? err.message : 'Connection test failed.');
    }
  }

  enableQbWorkbookSync(): void {
    qbSyncConfig.setUseWorkbookSync(true);
    this.qbSync.startAutoSync();
    this.actionMessage.set('QuickBooks workbook sync enabled. Use Test Connection to run the first sync.');
  }
}
