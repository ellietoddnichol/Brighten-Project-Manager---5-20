import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { ProjectDataService } from '@features/projects/services/project-data.service';
import { DataService } from '@core/services/data.service';
import { resolveProjectByReference, resolveProjectLabel } from '@shared/utils/project';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { ListRowComponent } from '@app/components/ui/list-row';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { DetailDrawerComponent } from '@app/components/ui/detail-drawer';
import { isApprovedUnbilledCo } from '@features/projects/utils/change-management';
import { Billing as BillingRecord } from '@app/models/types';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    RouterModule,
    PageHeaderComponent,
    StatCardComponent,
    StatusChipComponent,
    ListRowComponent,
    EmptyStateComponent,
    DetailDrawerComponent,
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <div class="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
        {{ projectData.statusMessage() }}
      </div>

      <app-page-header title="Billing" subtitle="Who needs billed, who owes money, and what's next." [hasActions]="true"
                       primaryActionLabel="Create Invoice"
                       (primaryAction)="openCreateDrawer()">
        <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2">
          <mat-icon class="!text-[18px]">{{ projectData.loading() ? 'hourglass_empty' : 'sync' }}</mat-icon>
          Refresh
        </button>
        <a routerLink="/reports" class="text-sm font-semibold text-indigo-700 hover:text-indigo-800 flex items-center gap-1">
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

      @if (draftInvoices().length) {
        <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-amber-50 flex items-center gap-2">
            <h2 class="text-sm font-bold text-slate-900">Draft invoices</h2>
            <app-status-chip tone="amber" label="Draft" />
          </div>
          <div class="divide-y divide-slate-100">
            @for (row of draftInvoices(); track row.id) {
              <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors">
                <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ tab: 'billing' }"
                   class="text-xs font-numeric font-bold text-indigo-700 min-w-[80px]">{{ row.payAppNumber || '—' }}</a>
                <span class="text-sm font-semibold text-slate-900 flex-1 min-w-0 truncate">{{ row.projectLabel }}</span>
                <span class="text-xs font-numeric text-slate-700">{{ row.totalBilledToDate | currency:'USD':'symbol':'1.0-0' }}</span>
                <app-status-chip [tone]="billingTone(row.status)">{{ row.status }}</app-status-chip>
              </div>
            }
          </div>
        </section>
      }

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
                <th class="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of openInvoices(); track row.id) {
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-5 py-3">
                    <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ tab: 'billing' }"
                       class="text-xs font-numeric font-bold text-indigo-700">{{ row.payAppNumber || '—' }}</a>
                  </td>
                  <td class="px-5 py-3 text-slate-700">{{ row.projectLabel }}</td>
                  <td class="px-5 py-3 text-slate-500">{{ row.billingPeriod || '—' }}</td>
                  <td class="px-5 py-3 text-right text-xs font-numeric text-slate-700">{{ row.totalBilledToDate | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-3 text-right text-xs font-numeric text-slate-700">{{ row.amountPaid | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="billingTone(row.status)">{{ row.status }}</app-status-chip>
                  </td>
                  <td class="px-5 py-3 text-right">
                    @if (row.status === 'Submitted' || row.status === 'Past Due') {
                      <button type="button" (click)="resendInvoice(row)"
                              class="bg-white border border-slate-200 text-slate-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors">
                        Resend
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="px-5 py-10 text-center text-slate-400 italic">No open invoices on sheet</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (paidInvoices().length) {
        <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button type="button" (click)="paidExpanded.set(!paidExpanded())"
                  class="w-full px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-bold text-slate-900">Paid invoices</h2>
              <span class="text-xs text-slate-500">({{ paidInvoices().length }})</span>
            </div>
            <mat-icon class="!text-[20px] text-slate-500">{{ paidExpanded() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (paidExpanded()) {
            <div class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <tbody class="divide-y divide-slate-100">
                  @for (row of paidInvoices(); track row.id) {
                    <tr class="hover:bg-slate-50 transition-colors">
                      <td class="px-5 py-3">
                        <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ tab: 'billing' }"
                           class="text-xs font-numeric font-bold text-slate-700">{{ row.payAppNumber || '—' }}</a>
                      </td>
                      <td class="px-5 py-3 text-slate-700">{{ row.projectLabel }}</td>
                      <td class="px-5 py-3 text-right text-xs font-numeric text-slate-700">{{ row.amountPaid | currency:'USD':'symbol':'1.0-0' }}</td>
                      <td class="px-5 py-3">
                        <app-status-chip tone="green">{{ row.status }}</app-status-chip>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>

    <app-detail-drawer [open]="createDrawerOpen()" title="Create Invoice" (close)="closeCreateDrawer()">
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
          <select [(ngModel)]="invoiceDraft.projectId" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Select project…</option>
            @for (p of projectData.projects(); track p.id) {
              <option [value]="p.id">{{ p.projectNumber }} · {{ p.projectName }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Invoice #</label>
          <input [(ngModel)]="invoiceDraft.invoiceNumber" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Date</label>
          <input type="date" [(ngModel)]="invoiceDraft.date" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
          <input type="number" min="0" step="0.01" [(ngModel)]="invoiceDraft.amount"
                 class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-numeric">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
          <textarea [(ngModel)]="invoiceDraft.description" rows="3"
                    class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"></textarea>
        </div>
        <div class="flex gap-2 pt-2">
          <button type="button" (click)="saveInvoice()" [disabled]="saving()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50">
            Save
          </button>
          <button type="button" (click)="closeCreateDrawer()"
                  class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </app-detail-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Billing {
  projectData = inject(ProjectDataService);
  private data = inject(DataService);
  private currency = inject(CurrencyPipe);

  createDrawerOpen = signal(false);
  paidExpanded = signal(false);
  saving = signal(false);
  invoiceDraft = {
    projectId: '',
    invoiceNumber: '',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    description: '',
  };

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

  draftInvoices = computed(() => this.invoiceRows().filter(r => r.status === 'Draft'));
  openInvoices = computed(() => this.invoiceRows().filter(r => r.status !== 'Draft' && r.status !== 'Paid'));
  paidInvoices = computed(() => this.invoiceRows().filter(r => r.status === 'Paid'));

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
    if (status === 'Draft') return 'amber';
    return 'slate';
  }

  openCreateDrawer(): void {
    this.invoiceDraft = {
      projectId: '',
      invoiceNumber: '',
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      description: '',
    };
    this.createDrawerOpen.set(true);
  }

  closeCreateDrawer(): void {
    this.createDrawerOpen.set(false);
  }

  async saveInvoice(): Promise<void> {
    if (!this.invoiceDraft.projectId || !this.invoiceDraft.amount) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.data.createBilling({
        projectId: this.invoiceDraft.projectId,
        payAppNumber: this.invoiceDraft.invoiceNumber || `INV-${Date.now()}`,
        billingPeriod: this.invoiceDraft.date,
        status: 'Draft',
        totalBilledToDate: this.invoiceDraft.amount,
        currentApplication: this.invoiceDraft.amount,
        billingNotes: this.invoiceDraft.description,
      }));
      this.closeCreateDrawer();
      await this.projectData.refreshOptionalWorkbook();
    } finally {
      this.saving.set(false);
    }
  }

  resendInvoice(row: BillingRecord & { projectLabel: string }): void {
    void row;
    alert('Resend queued — invoice notification stub.');
  }
}
