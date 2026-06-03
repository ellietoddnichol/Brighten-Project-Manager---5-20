import { Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { crNumber, coNumber } from '@features/projects/utils/change-management';

@Component({
  selector: 'app-related-records-section',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <h4 class="text-sm font-bold text-slate-900">Related Records</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Change Requests</p>
          @for (cr of linkedCrs(); track cr.id) {
            <a [routerLink]="['/projects', projectId]" [queryParams]="{ tab: 'changes' }"
               class="block text-blue-600 hover:underline">{{ crNumber(cr) }} — {{ cr.title || cr.description || 'CR' }}</a>
          } @empty { <p class="text-slate-400 italic text-xs">None</p> }
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Change Orders</p>
          @for (co of linkedCos(); track co.id) {
            <a [routerLink]="['/projects', projectId]" [queryParams]="{ tab: 'changes' }"
               class="block text-blue-600 hover:underline">{{ coNumber(co) }} — {{ co.title || 'CO' }}</a>
          } @empty { <p class="text-slate-400 italic text-xs">None</p> }
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Tasks</p>
          @for (t of linkedTasks(); track t.id) {
            <div class="text-slate-700">{{ t.title }} <span class="text-xs text-slate-400">({{ t.status }})</span></div>
          } @empty { <p class="text-slate-400 italic text-xs">None</p> }
        </div>
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Linked RFIs / Logs</p>
          @for (rfi of linkedRfis(); track rfi.id) {
            <a [routerLink]="['/projects', projectId]" [queryParams]="{ tab: 'rfis' }"
               class="block text-blue-600 hover:underline">{{ rfi.rfiNumber || 'RFI' }}</a>
          }
          @for (log of linkedLogs(); track log.id) {
            <a [routerLink]="['/projects', projectId]" [queryParams]="{ tab: 'daily-logs' }"
               class="block text-blue-600 hover:underline">Daily log {{ log.logDate }}</a>
          }
          @if (!linkedRfis().length && !linkedLogs().length) {
            <p class="text-slate-400 italic text-xs">None</p>
          }
        </div>
      </div>
    </div>
  `,
})
export class RelatedRecordsSectionComponent {
  @Input({ required: true }) projectId!: string;
  @Input() changeRequestId?: string;
  @Input() changeOrderId?: string;
  @Input() rfiId?: string;
  @Input() dailyLogId?: string;
  @Input() submittalId?: string;
  @Input() fieldIssueId?: string;
  @Input() sourceRecordType?: string;
  @Input() sourceRecordId?: string;

  private data = inject(DataService);

  crs = toSignal(this.data.getChangeRequests(), { initialValue: [] });
  cos = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });

  crNumber = crNumber;
  coNumber = coNumber;

  linkedCrs = computed(() => {
    const ids = new Set<string>();
    if (this.changeRequestId) ids.add(this.changeRequestId);
    return this.crs().filter(cr =>
      ids.has(cr.id)
      || (this.rfiId && cr.linkedRfiId === this.rfiId)
      || (this.dailyLogId && cr.linkedDailyLogId === this.dailyLogId)
      || (this.submittalId && cr.linkedSubmittalId === this.submittalId)
      || (this.fieldIssueId && cr.linkedFieldIssueId === this.fieldIssueId),
    );
  });

  linkedCos = computed(() => {
    const crIds = new Set(this.linkedCrs().map(c => c.linkedChangeOrderId).filter(Boolean) as string[]);
    if (this.changeOrderId) crIds.add(this.changeOrderId);
    return this.cos().filter(co =>
      crIds.has(co.id)
      || this.linkedCrs().some(cr => cr.linkedChangeOrderId === co.id),
    );
  });

  linkedTasks = computed(() => {
    const rid = this.sourceRecordId;
    const rtype = this.sourceRecordType;
    return this.tasks().filter(t =>
      t.projectId === this.projectId
      && (t.relatedRecordId === rid || t.relatedRecordId === this.rfiId || t.relatedRecordId === this.dailyLogId
        || t.relatedRecordId === this.submittalId || t.relatedRecordId === this.fieldIssueId)
      && (rtype ? !t.relatedRecordType || t.relatedRecordType === rtype : true),
    );
  });

  linkedRfis = computed(() => {
    if (!this.rfiId) return [];
    return this.rfis().filter(r => r.id === this.rfiId);
  });

  linkedLogs = computed(() => {
    if (!this.dailyLogId) return [];
    return this.logs().filter(l => l.id === this.dailyLogId);
  });
}
