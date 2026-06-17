import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '@app/models/types';
import { JobRecordTotals } from '@features/projects/services/job-record.service';
import { ProjectProfitMetrics, formatMoney, formatPercent } from '@features/projects/utils/project-profit.compute';
import { projectProfileLabel } from '@features/projects/utils/project-profile.compat';

@Component({
  selector: 'app-project-record-header',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <header class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-mono font-bold text-slate-500 mb-1">#{{ project.projectNumber }}</p>
          <h1 class="text-xl font-bold text-slate-900">{{ project.projectName }}</h1>
          <p class="text-sm text-slate-600 mt-1">
            Profile: <span class="font-semibold">{{ profileLabel }}</span>
            <span class="text-slate-300 mx-2">·</span>
            Customer: <span class="font-semibold">{{ project.customer || '—' }}</span>
            <span class="text-slate-300 mx-2">·</span>
            Status: <span class="font-semibold">{{ project.status }}</span>
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          @if (project.driveFolderUrl || project.driveFolderId) {
            <a [href]="project.driveFolderUrl" target="_blank" rel="noopener"
               class="text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
              <mat-icon class="!text-[16px]">folder_shared</mat-icon> Drive
            </a>
          }
          <button type="button" (click)="edit.emit()"
                  class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1">
            <mat-icon class="!text-[16px]">edit</mat-icon> Edit
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Contract</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(revisedContract) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Billed</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(project.billedToDate) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Cost to Date</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(totals.costToDate) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Total Hours</p>
          <p class="text-sm font-bold text-slate-900">{{ hoursLabel }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Materials</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(totals.materialCost) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Changes</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(totals.approvedChangeAmount) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Profit to Date</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(profit.profitToDate) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Projected Profit</p>
          <p class="text-sm font-bold text-slate-900">{{ fmt(profit.projectedProfit) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Projected Margin</p>
          <p class="text-sm font-bold text-slate-900">{{ formatPercent(profit.projectedMargin) }}</p>
        </div>
        <div class="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
          <p class="text-[10px] font-bold uppercase text-slate-500">Billed %</p>
          <p class="text-sm font-bold text-slate-900">{{ formatPercent(profit.billedPercent) }}</p>
        </div>
      </div>

      @if (profit.costVariance != null) {
        <p class="text-xs text-slate-600">
          Cost {{ profit.costAheadOfBilling ? 'ahead of' : 'behind' }} billing by {{ fmt(Math.abs(profit.costVariance)) }}
          at current billed progress.
        </p>
      }
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordHeaderComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) totals!: JobRecordTotals;
  @Input({ required: true }) profit!: ProjectProfitMetrics;
  @Output() edit = new EventEmitter<void>();

  readonly formatPercent = formatPercent;
  readonly Math = Math;

  get profileLabel(): string {
    return projectProfileLabel(this.project.projectProfile);
  }

  get revisedContract(): number {
    return this.project.revisedContractAmount
      ?? ((this.project.originalContractAmount ?? 0) + this.totals.approvedChangeAmount);
  }

  get hoursLabel(): string {
    const h = this.totals.totalHours || this.project.totalLaborHours;
    if (h == null || !Number.isFinite(h)) return '—';
    return h.toFixed(1);
  }

  fmt(value: number | null | undefined): string {
    return formatMoney(value);
  }
}
