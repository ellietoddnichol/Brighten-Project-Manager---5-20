import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { ForemanBonusService } from '@features/labor/services/foreman-bonus.service';
import {
  ForemanBonusExportFormat,
  ForemanBonusRecord,
  ForemanBonusReportMeta,
  ForemanBonusStatus,
} from '@app/models/foreman-bonus.types';
import {
  buildForemanBonusReportHtml,
  downloadForemanBonusCsv,
  openForemanBonusReport,
} from '@features/labor/utils/foreman-bonus-report';
import { summarizeForemanBonusRecords } from '@features/labor/utils/foreman-bonus.compute';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';

@Component({
  selector: 'app-foreman-bonuses-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HiddenModuleBannerComponent],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-hidden-module-banner moduleId="foreman-bonuses" />
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">Foreman Bonuses</h1>
          <p class="text-sm text-slate-500">Labor savings bonus with work progress and billing release caps</p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <div>
            <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">Export Format</label>
            <select [(ngModel)]="exportFormat" class="px-3 py-2 border rounded-lg text-sm min-w-[280px]">
              @for (option of exportOptions; track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </div>
          <button type="button" (click)="exportReport()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
            Export
          </button>
          <button type="button" (click)="approveSelected()" [disabled]="!selectedIds().size"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50">
            Approve payment batch
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        @for (card of summaryCards(); track card.label) {
          <div class="bg-white p-4 rounded-xl border shadow-sm">
            <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
            <p class="text-lg font-bold" [class.text-rose-700]="card.alert">{{ card.value }}</p>
          </div>
        }
      </div>

      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">Report Period</label>
          <select [(ngModel)]="periodFilter" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All report periods</option>
            @for (period of reportPeriods(); track period) {
              <option [value]="period">{{ period }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">Report Through</label>
          <input type="date" [(ngModel)]="reportThroughDate" class="px-3 py-2 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">Foreman</label>
          <select [(ngModel)]="foremanFilter" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All foremen</option>
            @for (name of foremanNames(); track name) {
              <option [value]="name">{{ name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-slate-500 mb-1">Status</label>
          <select [(ngModel)]="statusFilter" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">All statuses</option>
            @for (status of statusOptions; track status) {
              <option [value]="status">{{ status }}</option>
            }
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm px-1 pb-2">
          <input type="checkbox" [(ngModel)]="needsReviewOnly">
          Needs Review only
        </label>
        <input [(ngModel)]="projectFilter" placeholder="Filter by job or project"
               class="px-3 py-2 border rounded-lg text-sm min-w-[220px]">
      </div>

      <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[1600px]">
            <thead>
              <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                <th class="px-4 py-3 text-left">Select</th>
                <th class="px-4 py-3 text-left">Foreman</th>
                <th class="px-4 py-3 text-left">Job</th>
                <th class="px-4 py-3 text-left">Period</th>
                <th class="px-4 py-3 text-right">Labor Savings</th>
                <th class="px-4 py-3 text-right">Potential Total Bonus</th>
                <th class="px-4 py-3 text-right">Bonus Total of Received</th>
                <th class="px-4 py-3 text-right">Previously Paid</th>
                <th class="px-4 py-3 text-right">Pay This Term</th>
                <th class="px-4 py-3 text-right">Remaining Potential</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              @for (row of filteredRows(); track row.id) {
                <tr class="hover:bg-slate-50" [class.bg-amber-50]="row.status === 'NeedsReview'">
                  <td class="px-4 py-3">
                    <input type="checkbox" [checked]="selectedIds().has(row.id)" (change)="toggleSelected(row.id, $event)">
                  </td>
                  <td class="px-4 py-3 font-semibold">{{ row.foremanName }}</td>
                  <td class="px-4 py-3">
                    @if (row.projectId.startsWith('seed-job-')) {
                      {{ row.jobNumber }} — {{ row.projectName }}
                    } @else {
                      <a [routerLink]="['/projects', row.projectId]" class="text-indigo-700 font-semibold hover:underline">
                        {{ row.jobNumber }} — {{ row.projectName }}
                      </a>
                    }
                  </td>
                  <td class="px-4 py-3">{{ row.reportPeriodEnd || '—' }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.laborSavings | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.foremanShareBonus | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.bonusAvailableToReceive | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.previouslyPaid | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric font-bold">{{ row.payThisTerm | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.remainingPotential | currency }}</td>
                  <td class="px-4 py-3">
                    <span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full"
                          [class.bg-amber-100]="row.status === 'NeedsReview' || row.status === 'MissingData'"
                          [class.text-amber-800]="row.status === 'NeedsReview' || row.status === 'MissingData'"
                          [class.bg-emerald-100]="row.status === 'Calculated' || row.status === 'Approved'"
                          [class.text-emerald-800]="row.status === 'Calculated' || row.status === 'Approved'">
                      {{ row.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-slate-500 max-w-[200px]">{{ row.notes || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="12" class="px-4 py-12 text-center text-slate-400 italic">No foreman bonus records match the current filters.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ForemanBonusesPage {
  private data = inject(DataService);
  private bonusSvc = inject(ForemanBonusService);

  private records = toSignal(this.data.getForemanBonusRecords(), { initialValue: [] as ForemanBonusRecord[] });

  exportFormat: ForemanBonusExportFormat = 'combined';
  foremanFilter = '';
  periodFilter = '';
  reportThroughDate = '';
  statusFilter = '';
  needsReviewOnly = false;
  projectFilter = '';
  selectedIds = signal(new Set<string>());

  readonly exportOptions: Array<{ id: ForemanBonusExportFormat; label: string }> = [
    { id: 'combined', label: 'Combined Pay Period Summary PDF' },
    { id: 'short', label: 'Individual Short Summary PDF' },
    { id: 'full', label: 'Individual Full Breakdown PDF' },
    { id: 'csv', label: 'CSV Export' },
  ];

  readonly statusOptions: ForemanBonusStatus[] = [
    'MissingData', 'Calculated', 'NeedsReview', 'Approved', 'Paid', 'Closed',
  ];

  constructor() {
    effect(() => {
      const periods = this.reportPeriods();
      if (periods.length && !this.periodFilter) {
        this.periodFilter = periods[0];
      }
      if (periods.length && !this.reportThroughDate) {
        this.reportThroughDate = periods[0];
      }
    });
  }

  enrichedRows = computed(() => this.records().map(r => this.bonusSvc.enrichRecord(r)));

  foremanNames = computed(() => [...new Set(this.enrichedRows().map(r => r.foremanName))].sort());
  reportPeriods = computed(() =>
    [...new Set(this.enrichedRows().map(r => r.reportPeriodEnd).filter(Boolean) as string[])].sort().reverse(),
  );

  filteredRows = computed(() => {
    const projectQ = this.projectFilter.trim().toLowerCase();
    return this.enrichedRows().filter(row => {
      if (this.foremanFilter && row.foremanName !== this.foremanFilter) return false;
      if (this.periodFilter && row.reportPeriodEnd !== this.periodFilter) return false;
      if (this.statusFilter && row.status !== this.statusFilter) return false;
      if (this.needsReviewOnly && row.status !== 'NeedsReview') return false;
      if (projectQ) {
        const hay = `${row.jobNumber ?? ''} ${row.projectName ?? ''}`.toLowerCase();
        if (!hay.includes(projectQ)) return false;
      }
      return true;
    });
  });

  summaryCards = computed(() => {
    const rows = this.filteredRows();
    const missingData = rows.filter(r => r.status === 'MissingData').length;
    const needsReview = rows.filter(r => r.status === 'NeedsReview').length;
    return [
      { label: 'Total Bonus to Date', value: this.money(rows.reduce((s, r) => s + r.bonusAvailableToReceive, 0)) },
      { label: 'Potential Total Bonus', value: this.money(rows.reduce((s, r) => s + r.foremanShareBonus, 0)) },
      { label: 'Previously Paid', value: this.money(rows.reduce((s, r) => s + r.previouslyPaid, 0)) },
      { label: 'Pay This Term', value: this.money(rows.reduce((s, r) => s + r.payThisTerm, 0)) },
      { label: 'Remaining Potential', value: this.money(rows.reduce((s, r) => s + r.remainingPotential, 0)) },
      { label: 'Needs Review', value: String(needsReview), alert: needsReview > 0 },
    ];
  });

  toggleSelected(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selectedIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectedIds.set(next);
  }

  exportReport(): void {
    const rows = this.filteredRows();
    if (!rows.length) return;

    if (this.exportFormat === 'csv') {
      const stamp = this.periodFilter || this.reportThroughDate || 'all';
      downloadForemanBonusCsv(rows, `foreman-bonus-${stamp}.csv`);
      return;
    }

    if ((this.exportFormat === 'short' || this.exportFormat === 'full') && !this.foremanFilter) {
      window.alert('Select a foreman for individual summary exports.');
      return;
    }

    const meta = this.buildReportMeta(rows);
    const sections = this.buildReportSections(rows, meta.reportPeriodEnd);
    const html = buildForemanBonusReportHtml(this.exportFormat, meta, sections);
    openForemanBonusReport(html, this.exportFilename(meta));
  }

  async approveSelected(): Promise<void> {
    const ids = [...this.selectedIds()];
    for (const id of ids) {
      const record = this.records().find(r => r.id === id);
      if (!record) continue;
      await firstValueFrom(this.data.updateForemanBonusRecord(id, {
        ...record,
        status: 'Approved',
      }));
    }
    this.selectedIds.set(new Set());
  }

  private buildReportMeta(rows: ForemanBonusRecord[]): ForemanBonusReportMeta {
    const periodEnd = this.periodFilter || rows[0]?.reportPeriodEnd || this.reportThroughDate;
    const periodStart = rows.find(r => r.reportPeriodStart)?.reportPeriodStart;
    return {
      companyName: 'Brighten Builders LLC',
      reportThrough: this.reportThroughDate || periodEnd || '',
      reportPeriodStart: periodStart,
      reportPeriodEnd: periodEnd,
      reportLabel: periodEnd ? `Bonus Summary - ${periodEnd.slice(0, 7)}` : 'Foreman Bonus Summary',
    };
  }

  private buildReportSections(rows: ForemanBonusRecord[], reportPeriodEnd?: string) {
    const foremen = this.exportFormat === 'combined'
      ? [...new Set(rows.map(r => r.foremanName))].sort()
      : [this.foremanFilter];

    return foremen.map(foremanName => {
      const foremanRows = rows.filter(r => r.foremanName === foremanName);
      return {
        summary: summarizeForemanBonusRecords(foremanRows, foremanName, reportPeriodEnd),
        records: foremanRows,
      };
    });
  }

  private exportFilename(meta: ForemanBonusReportMeta): string {
    const stamp = (meta.reportPeriodEnd ?? meta.reportThrough ?? 'report').slice(0, 10);
    if (this.exportFormat === 'combined') return `bonus-summary-${stamp}`;
    const slug = this.foremanFilter.replace(/\s+/g, '-').toLowerCase();
    if (this.exportFormat === 'short') return `${slug}-bonus-summary`;
    return `${slug}-bonus-full`;
  }

  private money(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
}
