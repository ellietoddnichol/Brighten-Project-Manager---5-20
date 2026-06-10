import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { PO } from '@app/models/types';
import { resolveProjectLabel } from '@shared/utils/project';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { ListRowComponent } from '@app/components/ui/list-row';
import { EmptyStateComponent } from '@app/components/ui/empty-state';

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
    PageHeaderComponent,
    StatCardComponent,
    SegmentedControlComponent,
    ListRowComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header title="Purchase Orders" subtitle="Purchase orders, attachments, and subcontractor costs" />

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
            (rowClick)="null" />
        } @empty {
          <app-empty-state title="No purchase orders match this filter." />
        }
      </div>
    </div>
  `,
})
export class PosPage {
  private data = inject(DataService);
  private pos = toSignal(this.data.getPOs(), { initialValue: [] as PO[] });
  private projects = toSignal(this.data.getProjects(), { initialValue: [] });

  activeFilter = signal<PoFilter>('all');

  enriched = computed((): EnrichedPo[] => {
    const projects = this.projects() ?? [];
    return (this.pos() ?? []).map(po => {
      const label = po.projectName?.trim()
        || po.jobIdLabel?.trim()
        || resolveProjectLabel(projects, { projectId: po.projectId, projectNo: po.jobNumber });
      const unmatched = !po.projectName && !po.jobNumber && label.includes('—');
      const jobLabel = unmatched || label === '—'
        ? 'Unmatched project'
        : label;
      const sourceLabel = po.missingPo ? 'Sheet' : 'QuickBooks';
      let nextAction = 'Review PO';
      if (unmatched) nextAction = 'Match project in Import Review';
      else if (po.invoiceExceedsPo) nextAction = 'Invoice exceeds PO';
      else if (po.status === 'Open' || po.status === 'Issued') nextAction = 'Track PO';

      return {
        ...po,
        jobLabel,
        sourceLabel,
        nextAction,
      };
    });
  });

  filtered = computed(() => {
    const filter = this.activeFilter();
    return this.enriched().filter(po => this.matchesFilter(po, filter));
  });

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
      case 'open':
        return ['Open', 'Issued', 'Partial'].includes(po.status);
      case 'notInQb':
        return !!po.missingPo;
      case 'missingProject':
        return po.jobLabel === 'Unmatched project';
      case 'overBudget':
        return !!po.invoiceExceedsPo;
      case 'needsReview':
        return po.jobLabel === 'Unmatched project' || !!po.invoiceExceedsPo || !!po.missingPo;
      default:
        return true;
    }
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }
}
