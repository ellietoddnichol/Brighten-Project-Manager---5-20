import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectDataService } from '../services/project-data.service';
import { DataService } from '../services/data.service';
import { ChangeOrder } from '../models/types';
import { resolveProjectByReference, resolveProjectLabel } from '../utils/project';
import {
  coApprovedAmount,
  coNumber,
  coStatusMatches,
  coTotalAmount,
  computeChangeMetrics,
  crNumber,
  normalizeCoStatus,
} from '../utils/change-management';
import { PageHeaderComponent } from '../components/ui/page-header';
import { StatCardComponent } from '../components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '../components/ui/status-chip';

@Component({
  selector: 'app-changes',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusChipComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto">
      <div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
        {{ projectData.statusMessage() }}
      </div>

      <app-page-header title="Changes" subtitle="Change orders, proposals, and pending pricing." [hasActions]="true">
        <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ projectData.loading() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          Refresh
        </button>
      </app-page-header>

      <div class="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <app-stat-card label="Open CRs" [value]="'' + changeMetrics().openChangeRequests" icon="assignment" />
        <app-stat-card label="Needs Pricing" [value]="'' + changeMetrics().needsPricing" icon="hourglass_top" />
        <app-stat-card label="Awaiting Approval" [value]="'' + changeMetrics().awaitingApproval" icon="rate_review" />
        <app-stat-card label="Approved Unbilled" [value]="fmt(changeMetrics().approvedUnbilledAmount)" [subtext]="changeMetrics().approvedUnbilled + ' COs'" icon="payments" />
        <app-stat-card label="Approved CO $" [value]="fmt(changeMetrics().totalApprovedAmount)" icon="check_circle" />
        <app-stat-card label="Pending CO $" [value]="fmt(changeMetrics().pendingCoAmount)" icon="sync_alt" />
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h2 class="text-sm font-bold text-slate-900">Change Log / Proposals</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                <th class="px-5 py-3">CO #</th>
                <th class="px-5 py-3">Project</th>
                <th class="px-5 py-3">Description</th>
                <th class="px-5 py-3 text-right">Amount</th>
                <th class="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of changeOrderRows(); track row.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 font-medium text-blue-600">
                    <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ tab: 'changes' }">{{ row.coNumber || '—' }}</a>
                  </td>
                  <td class="px-5 py-3 text-slate-700">{{ row.projectLabel }}</td>
                  <td class="px-5 py-3 text-slate-600 max-w-[280px] truncate" [title]="row.title">{{ row.title }}</td>
                  <td class="px-5 py-3 text-right font-mono text-xs">{{ row.amount | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="coTone(row.status)">{{ normalizeCoStatus(row.status) }}</app-status-chip>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic">No change orders on sheet</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 class="text-sm font-bold text-slate-900 mb-4">Change Order Status</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          @for (bucket of coBuckets(); track bucket.label) {
            <div class="rounded-lg border border-slate-100 p-4">
              <div class="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{{ bucket.label }}</div>
              <div class="text-xl font-black text-slate-900">{{ bucket.value | currency:'USD':'symbol':'1.0-0' }}</div>
              <div class="text-xs text-slate-500 mt-1">{{ bucket.count }} item{{ bucket.count === 1 ? '' : 's' }}</div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Changes {
  projectData = inject(ProjectDataService);
  private data = inject(DataService);
  private currency = inject(CurrencyPipe);

  changeRequests = toSignal(this.data.getChangeRequests(), { initialValue: [] });
  changeOrdersFs = toSignal(this.data.getChangeOrders(), { initialValue: [] });

  allCos = computed(() => {
    const fromSheet = this.projectData.changeOrders();
    const fromFs = this.changeOrdersFs();
    return fromFs.length ? fromFs : fromSheet;
  });

  changeMetrics = computed(() => computeChangeMetrics(this.changeRequests(), this.allCos()));

  normalizeCoStatus = normalizeCoStatus;

  changeOrderRows = computed(() => {
    const projects = this.projectData.projects();
    return this.allCos()
      .map(co => {
        const project = resolveProjectByReference(projects, { projectId: co.projectId });
        return {
          id: co.id,
          projectId: project?.id ?? co.projectId,
          coNumber: coNumber(co),
          title: co.title,
          status: co.status,
          amount: coStatusMatches(co, 'Approved', 'Billed') ? coApprovedAmount(co) : coTotalAmount(co),
          projectLabel: resolveProjectLabel(projects, { projectId: co.projectId }),
        };
      })
      .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
  });

  coBuckets = computed(() => {
    const cos = this.allCos();
    const bucket = (label: string, match: (co: ChangeOrder) => boolean) => {
      const items = cos.filter(match);
      return {
        label,
        count: items.length,
        value: items.reduce((s, c) => s + coTotalAmount(c), 0),
      };
    };
    return [
      bucket('Approved', co => coStatusMatches(co, 'Approved', 'Billed')),
      bucket('Needs Pricing', co => coStatusMatches(co, 'Draft', 'Pricing', 'Needs Backup')),
      bucket('Awaiting Approval', co => coStatusMatches(co, 'Sent')),
      bucket('Rejected / Void', co => coStatusMatches(co, 'Rejected', 'Void')),
    ];
  });

  fmt(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  refreshWorkbook(): void {
    void this.projectData.refreshOptionalWorkbook();
  }

  coTone(status: string): StatusTone {
    const s = normalizeCoStatus(status);
    if (s === 'Approved' || s === 'Billed') return 'green';
    if (s === 'Sent') return 'amber';
    if (s === 'Pricing' || s === 'Needs Backup' || s === 'Draft') return 'violet';
    if (s === 'Rejected' || s === 'Void') return 'red';
    return 'slate';
  }
}
