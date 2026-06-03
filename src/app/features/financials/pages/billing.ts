import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ProjectDataService } from '@features/projects/services/project-data.service';
import { resolveProjectByReference, resolveProjectLabel } from '@shared/utils/project';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { ListRowComponent } from '@app/components/ui/list-row';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { isApprovedUnbilledCo } from '@features/projects/utils/change-management';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    RouterModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusChipComponent,
    ListRowComponent,
    EmptyStateComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
        {{ projectData.statusMessage() }}
      </div>

      <app-page-header title="Billing" subtitle="Who needs billed, who owes money, and what's next." [hasActions]="true">
        <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ projectData.loading() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          Refresh
        </button>
        <a routerLink="/reports" class="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Billing trends & charts <mat-icon class="!text-[16px] w-4 h-4">arrow_forward</mat-icon>
        </a>
      </app-page-header>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card label="Total Billed" [value]="fmt(metrics()?.billedToDate ?? 0)" icon="receipt_long" />
        <app-stat-card label="Open AR" [value]="fmt(metrics()?.openAR ?? 0)" icon="account_balance_wallet" />
        <app-stat-card label="Left to Bill" [value]="fmt(metrics()?.leftToBill ?? 0)" icon="pending_actions" />
        <app-stat-card label="Next Actions" [value]="actionCount()" icon="playlist_add_check" />
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h2 class="text-sm font-bold text-slate-900">Next billing actions</h2>
          <p class="text-xs text-slate-500 mt-0.5">Jobs needing billed, approved COs, draft pay apps, and open invoices</p>
        </div>
        @for (action of billingActions(); track action.id) {
          <app-list-row
            [title]="action.title"
            [subtitle]="action.subtitle"
            [nextAction]="action.actionLabel"
            (rowClick)="null" />
        } @empty {
          <app-empty-state title="No billing actions right now." message="All caught up on billing queue." />
        }
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 bg-slate-50">
          <h2 class="text-sm font-bold text-slate-900">Invoices / Pay Applications</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                <th class="px-5 py-3">Invoice #</th>
                <th class="px-5 py-3">Project</th>
                <th class="px-5 py-3">Period</th>
                <th class="px-5 py-3 text-right">Billed</th>
                <th class="px-5 py-3 text-right">Paid</th>
                <th class="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of invoiceRows(); track row.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 font-medium text-blue-600">
                    <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ tab: 'billing' }">{{ row.payAppNumber || '—' }}</a>
                  </td>
                  <td class="px-5 py-3 text-slate-700">{{ row.projectLabel }}</td>
                  <td class="px-5 py-3 text-slate-500">{{ row.billingPeriod || '—' }}</td>
                  <td class="px-5 py-3 text-right font-mono text-xs">{{ row.totalBilledToDate | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-3 text-right font-mono text-xs">{{ row.amountPaid | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="billingTone(row.status)">{{ row.status }}</app-status-chip>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-5 py-10 text-center text-slate-400 italic">No invoices on sheet</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Billing {
  projectData = inject(ProjectDataService);
  private currency = inject(CurrencyPipe);

  metrics = computed(() => this.projectData.metrics());

  invoiceRows = computed(() => {
    const projects = this.projectData.projects();
    return this.projectData.billings()
      .map(b => {
        const project = resolveProjectByReference(projects, {
          projectId: b.projectId,
          payAppNumber: b.payAppNumber,
        });
        return {
          ...b,
          projectId: project?.id ?? b.projectId,
          projectLabel: resolveProjectLabel(projects, {
            projectId: b.projectId,
            payAppNumber: b.payAppNumber,
          }),
        };
      })
      .sort((a, b) => (b.billingPeriod || '').localeCompare(a.billingPeriod || ''));
  });

  billingActions = computed(() => {
    const projects = this.projectData.projects();
    const fmt = (value: number) =>
      this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
    const actions: { id: string; title: string; subtitle: string; actionLabel: string }[] = [];

    for (const p of projects) {
      const left = p.wipLeftToBill ?? 0;
      if (left > 5000) {
        actions.push({
          id: `bill-${p.id}`,
          title: `${p.projectNumber} · ${p.projectName}`,
          subtitle: `${fmt(left)} left to bill`,
          actionLabel: 'Create pay app',
        });
      }
      if ((p.currentAR ?? 0) > 0) {
        actions.push({
          id: `ar-${p.id}`,
          title: `${p.projectNumber} · ${p.projectName}`,
          subtitle: `${fmt(p.currentAR ?? 0)} open AR`,
          actionLabel: 'Follow up collections',
        });
      }
    }

    for (const co of this.projectData.changeOrders()) {
      if (!isApprovedUnbilledCo(co)) continue;
      const project = projects.find(p => p.id === co.projectId);
      actions.push({
        id: `co-${co.id}`,
        title: `${project?.projectNumber ?? '—'} · Approved CO`,
        subtitle: co.title ?? co.coNumber ?? 'Change order',
        actionLabel: 'Bill approved CO',
      });
    }

    for (const b of this.projectData.billings()) {
      if (!['Draft', 'Submitted'].includes(b.status ?? '')) continue;
      actions.push({
        id: `pa-${b.id}`,
        title: resolveProjectLabel(projects, { projectId: b.projectId }),
        subtitle: `Pay app ${b.payAppNumber ?? '—'} · ${b.status}`,
        actionLabel: b.status === 'Draft' ? 'Submit pay app' : 'Invoice pay app',
      });
    }

    return actions.slice(0, 40);
  });

  actionCount = computed(() => String(this.billingActions().length));

  fmt(value: number): string {
    return this.currency.transform(value, 'USD', 'symbol', '1.0-0') ?? '$0';
  }

  refreshWorkbook(): void {
    void this.projectData.refreshOptionalWorkbook();
  }

  billingTone(status: string): StatusTone {
    if (status === 'Paid' || status === 'Approved') return 'green';
    if (status === 'Submitted' || status === 'Past Due') return 'amber';
    return 'slate';
  }
}
