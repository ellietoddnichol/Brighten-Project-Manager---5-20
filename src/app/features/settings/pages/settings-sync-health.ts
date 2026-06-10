import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SyncHealthService, SyncHealthStatus } from '@core/services/sync-health.service';
import { LaborTimelogsSyncService } from '@core/services/labor-timelogs-sync.service';

@Component({
  selector: 'app-settings-sync-health',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RouterLink],
  template: `
    <section id="sync-health" class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
      <h2 class="text-sm font-semibold text-slate-900 mb-1">Sync Health</h2>
      <p class="text-sm text-slate-500 mb-2">
        Phase Zero source-of-truth: Firestore is the normalized working database.
        Drive, Sheets, and QuickBooks remain live feeds.
      </p>
      <p class="text-xs text-slate-400 mb-4">
        See docs/data-storage-map.md for collection responsibilities.
      </p>

      @if (blocking().length) {
        <div class="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>{{ blocking().length }}</strong> source{{ blocking().length === 1 ? '' : 's' }} need attention.
          Import conflicts belong in
          <a routerLink="/settings" fragment="source-review" class="font-semibold underline">Source Review</a>.
        </div>
      }

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-200">
            <tr>
              <th class="py-2 pr-4">Source</th>
              <th class="py-2 pr-4">Status</th>
              <th class="py-2 pr-4">Last sync</th>
              <th class="py-2 pr-4 text-right">Read</th>
              <th class="py-2 pr-4 text-right">Imported</th>
              <th class="py-2 pr-4">Warnings / errors</th>
              <th class="py-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            @for (row of syncHealth.rows(); track row.id) {
              <tr class="border-b border-slate-100 align-top">
                <td class="py-2 pr-4">
                  <div class="flex items-center gap-2 font-semibold text-slate-900">
                    <mat-icon class="!text-[16px]" [class]="statusClass(row.status)">{{ statusIcon(row.status) }}</mat-icon>
                    {{ row.label }}
                  </div>
                  @if (row.detail) {
                    <p class="text-xs text-slate-500 mt-1 max-w-xs">{{ row.detail }}</p>
                  }
                </td>
                <td class="py-2 pr-4 capitalize">{{ row.status.replace('_', ' ') }}</td>
                <td class="py-2 pr-4 text-xs text-slate-500 whitespace-nowrap">
                  {{ row.lastSync ? (row.lastSync | date:'medium') : '—' }}
                </td>
                <td class="py-2 pr-4 text-right font-numeric">{{ row.rowsRead ?? '—' }}</td>
                <td class="py-2 pr-4 text-right font-numeric">{{ row.rowsImported ?? '—' }}</td>
                <td class="py-2 pr-4 text-xs">
                  @if (row.errors?.length) {
                    @for (e of row.errors; track e) {
                      <p class="text-rose-700">{{ e }}</p>
                    }
                  }
                  @if (row.warnings?.length) {
                    @for (w of row.warnings; track w) {
                      <p class="text-amber-800">{{ w }}</p>
                    }
                  }
                  @if (!row.errors?.length && !row.warnings?.length) {
                    <span class="text-slate-400">—</span>
                  }
                </td>
                <td class="py-2 text-xs font-semibold text-indigo-700">{{ row.nextAction ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    <!-- Labor Hours — Timelogs → SQL sync -->
    <section class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
      <h2 class="text-sm font-semibold text-slate-900 mb-1">Labor Hours — Timelogs Sync</h2>
      <p class="text-sm text-slate-500 mb-4">
        Reads your <strong>Timelogs</strong> tab from the Master Time Sheet and imports
        all approved rows into Cloud SQL, matching each row to a project by job number.
        Rows for PTO / OFFICE / SHOP are skipped automatically.
      </p>

      <div class="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Spreadsheet ID</label>
          <input [(ngModel)]="timelogSheetId" class="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                 placeholder="Google Sheets spreadsheet ID">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Tab Name</label>
          <input [(ngModel)]="timelogTabName" class="w-full px-3 py-2 border rounded-lg text-sm"
                 placeholder="Timelogs">
        </div>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" [(ngModel)]="timelogApprovedOnly" class="rounded">
          Approved rows only
        </label>
      </div>

      <button type="button" (click)="syncTimelogs()"
              [disabled]="laborSync.syncing()"
              class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2">
        <mat-icon class="!text-[18px]">sync</mat-icon>
        {{ laborSync.syncing() ? 'Syncing…' : 'Sync Now' }}
      </button>

      @if (laborSync.syncError()) {
        <p class="mt-3 text-sm text-rose-700">{{ laborSync.syncError() }}</p>
      }
      @if (laborSync.syncResult(); as result) {
        <div class="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <p><strong>{{ result.imported }}</strong> labor entr{{ result.imported === 1 ? 'y' : 'ies' }} imported.</p>
          @if (result.skipped > 0) {
            <p class="text-slate-500 text-xs mt-1">{{ result.skipped }} row{{ result.skipped === 1 ? '' : 's' }} skipped (PTO / unmatched / non-approved).</p>
          }
          @if (result.unmatchedJobs.length > 0) {
            <p class="text-amber-800 text-xs mt-1">Unmatched job IDs: {{ result.unmatchedJobs.join(', ') }}</p>
          }
          @if (laborSync.lastSyncedAt()) {
            <p class="text-slate-400 text-xs mt-1">Synced at {{ laborSync.lastSyncedAt() | date:'medium' }}</p>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSyncHealthComponent {
  syncHealth = inject(SyncHealthService);
  laborSync = inject(LaborTimelogsSyncService);

  blocking = this.syncHealth.blockingWarnings;

  timelogSheetId = this.laborSync.defaultSpreadsheetId;
  timelogTabName = this.laborSync.defaultTab;
  timelogApprovedOnly = true;

  async syncTimelogs(): Promise<void> {
    try {
      await this.laborSync.syncFromSheet(this.timelogSheetId, this.timelogTabName, this.timelogApprovedOnly);
    } catch {
      // error already stored in laborSync.syncError
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
}
