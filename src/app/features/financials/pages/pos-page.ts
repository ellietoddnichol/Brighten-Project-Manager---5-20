import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { PO, Project } from '@app/models/types';
import { BudgetLineType } from '@app/models/financial.types';
import { resolveProjectLabel } from '@shared/utils/project';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { ListRowComponent } from '@app/components/ui/list-row';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { DetailDrawerComponent } from '@app/components/ui/detail-drawer';
import { PurchaseOrderService } from '@features/financials/services/purchase-order.service';

type PoFilter = 'all' | 'open' | 'notInQb' | 'missingProject' | 'overBudget' | 'needsReview';

interface EnrichedPo extends PO {
  jobLabel: string;
  nextAction: string;
  sourceLabel: string;
}

@Component({
  selector: 'app-pos-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    StatCardComponent,
    SegmentedControlComponent,
    ListRowComponent,
    EmptyStateComponent,
    DetailDrawerComponent,
  ],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header title="Purchase Orders" subtitle="Purchase orders, attachments, and subcontractor costs"
                       primaryActionLabel="Add PO"
                       (primaryAction)="openNew()" />

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card label="Total POs" [value]="poCount()" icon="receipt" />
        <app-stat-card label="Open" [value]="openCount()" icon="pending_actions" />
        <app-stat-card label="Needs Review" [value]="reviewCount()" icon="flag" />
        <app-stat-card label="Unmatched Project" [value]="unmatchedCount()" icon="link_off" />
      </div>

      <app-segmented-control
        [options]="filterOptions()"
        [value]="activeFilter()"
        (select)="activeFilter.set($event)" />

      <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
        @for (po of filtered(); track po.id) {
          <app-list-row
            [title]="po.poNumber + ' · ' + po.vendor"
            [subtitle]="po.jobLabel + ' · ' + po.status"
            [metrics]="[
              { label: 'Amount', value: fmt(po.originalAmount) },
              { label: 'Source', value: po.sourceLabel },
            ]"
            [nextAction]="po.nextAction"
            (rowClick)="openPo(po)" />
        } @empty {
          <app-empty-state title="No purchase orders match this filter." message="No purchase orders yet — add one using Add PO above." />
        }
      </div>
    </div>

    <app-detail-drawer [open]="drawerOpen()" [title]="editingId() ? 'Edit PO' : 'New Purchase Order'" (close)="closeDrawer()">
      <div class="space-y-4">
        @if (saveError()) {
          <p class="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{{ saveError() }}</p>
        }
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
          <select [(ngModel)]="draftProjectId" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">Select project…</option>
            @for (p of activeProjects(); track p.id) {
              <option [value]="p.id">{{ p.projectNumber }} · {{ p.projectName }}</option>
            }
          </select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">PO #</label>
            <input [(ngModel)]="draft.poNumber" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Auto-generated if blank">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor</label>
            <input [(ngModel)]="draft.vendor" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
            <select [(ngModel)]="draftType" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="Material">Material</option>
              <option value="Subcontractor">Subcontractor</option>
              <option value="Labor">Labor</option>
              <option value="Equipment">Equipment</option>
              <option value="GeneralConditions">General Conditions</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Cost code</label>
            <input [(ngModel)]="draft.costCode" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Committed amount</label>
          <input type="number" [(ngModel)]="draftAmount" class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Description / items</label>
          <textarea [(ngModel)]="draft.itemsPurchased" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
          <textarea [(ngModel)]="draft.notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
        </div>
        <div class="flex gap-2 pt-2">
          <button type="button" (click)="save()" [disabled]="saving()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save PO' }}
          </button>
          <button type="button" (click)="closeDrawer()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </app-detail-drawer>
  `,
})
export class PosPage {
  private data = inject(DataService);
  private router = inject(Router);
  private poSvc = inject(PurchaseOrderService);
  private pos = toSignal(this.data.getPOs(), { initialValue: [] as PO[] });
  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });

  activeFilter = signal<PoFilter>('all');
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  draftProjectId = '';
  draft: Partial<PO> = {};
  draftType: BudgetLineType = 'Material';
  draftAmount: number | null = null;

  activeProjects = computed(() =>
    [...(this.projects() ?? [])]
      .filter(p => p.status !== 'Closed')
      .sort((a, b) => String(a.projectNumber).localeCompare(String(b.projectNumber), undefined, { numeric: true })),
  );

  enriched = computed((): EnrichedPo[] => {
    const projects = this.projects() ?? [];
    return (this.pos() ?? []).map(po => {
      const label = po.projectName?.trim()
        || po.jobIdLabel?.trim()
        || resolveProjectLabel(projects, { projectId: po.projectId, projectNo: po.jobNumber });
      const unmatched = !po.projectId && (!po.projectName && !po.jobNumber || label.includes('—'));
      const jobLabel = unmatched ? 'Unmatched project' : label;
      const sourceLabel = po.missingPo ? 'Sheet' : 'QuickBooks';
      let nextAction = 'Review PO';
      if (unmatched) nextAction = 'Match project';
      else if (po.invoiceExceedsPo) nextAction = 'Invoice exceeds PO';
      else if (po.status === 'Open' || po.status === 'Issued') nextAction = 'Track PO';

      return { ...po, jobLabel, sourceLabel, nextAction };
    });
  });

  filtered = computed(() => this.enriched().filter(po => this.matchesFilter(po, this.activeFilter())));

  filterOptions = computed(() => {
    const count = (id: PoFilter) => (id === 'all' ? this.enriched().length : this.countFor(id));
    return [
      { id: 'all' as PoFilter, label: 'All', badge: count('all') || undefined },
      { id: 'open' as PoFilter, label: 'Open', badge: count('open') || undefined },
      { id: 'notInQb' as PoFilter, label: 'Not in QB', badge: count('notInQb') || undefined },
      { id: 'missingProject' as PoFilter, label: 'Missing Project', badge: count('missingProject') || undefined },
      { id: 'overBudget' as PoFilter, label: 'Over Budget', badge: count('overBudget') || undefined },
      { id: 'needsReview' as PoFilter, label: 'Needs Review', badge: count('needsReview') || undefined },
    ];
  });

  poCount = computed(() => String(this.enriched().length));
  openCount = computed(() => String(this.countFor('open')));
  reviewCount = computed(() => String(this.countFor('needsReview')));
  unmatchedCount = computed(() => String(this.countFor('missingProject')));

  countFor(filter: PoFilter): number {
    return this.enriched().filter(po => this.matchesFilter(po, filter)).length;
  }

  private matchesFilter(po: EnrichedPo, filter: PoFilter): boolean {
    switch (filter) {
      case 'open': return ['Open', 'Issued', 'Partial'].includes(po.status);
      case 'notInQb': return !!po.missingPo;
      case 'missingProject': return po.jobLabel === 'Unmatched project';
      case 'overBudget': return !!po.invoiceExceedsPo;
      case 'needsReview':
        return po.jobLabel === 'Unmatched project' || !!po.invoiceExceedsPo || !!po.missingPo;
      default: return true;
    }
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  openPo(po: EnrichedPo): void {
    if (po.projectId) {
      void this.router.navigate(['/projects', po.projectId], { queryParams: { tab: 'budget' } });
      return;
    }
    this.editingId.set(po.id);
    this.draft = { ...po };
    this.draftProjectId = po.projectId ?? '';
    this.draftType = po.type ?? 'Material';
    this.draftAmount = po.originalAmount ?? po.committedAmount ?? null;
    this.drawerOpen.set(true);
  }

  openNew(): void {
    this.editingId.set(null);
    this.draft = { status: 'Draft', source: 'manual' };
    this.draftProjectId = '';
    this.draftType = 'Material';
    this.draftAmount = null;
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    const project = (this.projects() ?? []).find(p => p.id === this.draftProjectId);
    if (!project) {
      this.saveError.set('Select a project for this PO.');
      return;
    }
    if (!this.draft.vendor?.trim()) {
      this.saveError.set('Enter a vendor name.');
      return;
    }
    if ((this.draftAmount ?? 0) <= 0) {
      this.saveError.set('Enter a committed amount.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.poSvc.savePo(project, {
        ...this.draft,
        type: this.draftType,
        originalAmount: this.draftAmount ?? 0,
        committedAmount: this.draftAmount ?? 0,
      }, this.editingId());
      this.closeDrawer();
      void this.router.navigate(['/projects', project.id], { queryParams: { tab: 'budget' } });
      void saved;
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save PO.');
    } finally {
      this.saving.set(false);
    }
  }
}
