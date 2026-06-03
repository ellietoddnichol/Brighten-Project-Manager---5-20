import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SyncHealthService, SyncHealthStatus } from '@core/services/sync-health.service';

@Component({
  selector: 'app-settings-sync-health',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink],
  template: `
    <section id="sync-health" class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-6">
      <h2 class="text-xl font-bold mb-1">Sync Health</h2>
      <p class="text-sm text-slate-500 mb-2">
        Phase Zero source-of-truth: Firestore is the normalized working database.
        Drive, Sheets, and QuickBooks remain live feeds.
      </p>
      <p class="text-xs text-slate-400 mb-6">
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
              <th class="py-3 pr-4">Source</th>
              <th class="py-3 pr-4">Status</th>
              <th class="py-3 pr-4">Last sync</th>
              <th class="py-3 pr-4 text-right">Read</th>
              <th class="py-3 pr-4 text-right">Imported</th>
              <th class="py-3 pr-4">Warnings / errors</th>
              <th class="py-3">Next action</th>
            </tr>
          </thead>
          <tbody>
            @for (row of syncHealth.rows(); track row.id) {
              <tr class="border-b border-slate-100 align-top">
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-2 font-semibold text-slate-900">
                    <mat-icon class="!text-[16px]" [class]="statusClass(row.status)">{{ statusIcon(row.status) }}</mat-icon>
                    {{ row.label }}
                  </div>
                  @if (row.detail) {
                    <p class="text-xs text-slate-500 mt-1 max-w-xs">{{ row.detail }}</p>
                  }
                </td>
                <td class="py-3 pr-4 capitalize">{{ row.status.replace('_', ' ') }}</td>
                <td class="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">
                  {{ row.lastSync ? (row.lastSync | date:'medium') : '—' }}
                </td>
                <td class="py-3 pr-4 text-right font-mono">{{ row.rowsRead ?? '—' }}</td>
                <td class="py-3 pr-4 text-right font-mono">{{ row.rowsImported ?? '—' }}</td>
                <td class="py-3 pr-4 text-xs">
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
                <td class="py-3 text-xs font-semibold text-indigo-700">{{ row.nextAction ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsSyncHealthComponent {
  syncHealth = inject(SyncHealthService);

  blocking = this.syncHealth.blockingWarnings;

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
}
