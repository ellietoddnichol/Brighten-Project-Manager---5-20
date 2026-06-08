import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import { Rfi, RfiPriority, RfiStatus } from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ConstructionOperationsService } from '@features/projects/services/construction-operations.service';
import { WorkflowDocumentsSectionComponent } from '@app/components/workflow-documents-section';
import { RelatedRecordsSectionComponent } from '@app/components/related-records-section';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import {
  computeConstructionOpsMetrics,
  isRfiOpen,
  isRfiOverdue,
} from '@shared/utils/construction-operations';

type RfiFilter = 'all' | 'open' | 'overdue' | 'closed';

@Component({
  selector: 'app-rfis-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, WorkflowDocumentsSectionComponent, RelatedRecordsSectionComponent, StatusChipComponent],
  template: `
    <div class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open RFIs</p>
          <p class="text-2xl font-bold text-slate-900">{{ metrics().openRfiCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Overdue</p>
          <p class="text-2xl font-bold text-amber-700">{{ metrics().overdueRfiCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Cost impact</p>
          <p class="text-2xl font-bold text-orange-600">{{ metrics().recordsWithCostImpact }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-1">Schedule impact</p>
          <p class="text-2xl font-bold text-violet-700">{{ metrics().recordsWithScheduleImpact }}</p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
          <div class="flex flex-wrap gap-2">
            @for (f of filters; track f.key) {
              <button type="button" (click)="filter.set(f.key)"
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg"
                      [class.bg-slate-900]="filter() === f.key"
                      [class.text-white]="filter() === f.key"
                      [class.text-slate-600]="filter() !== f.key"
                      [class.hover:bg-slate-100]="filter() !== f.key">{{ f.label }}</button>
            }
          </div>
          <button type="button" (click)="openNew()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px]">add</mat-icon> New RFI
          </button>
        </div>

        @if (showForm()) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">RFI #</label>
                <input [(ngModel)]="draft.rfiNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
                <input [(ngModel)]="draft.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</label>
                <select [(ngModel)]="draft.priority" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
                </select></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Submitted date</label>
                <input type="date" [(ngModel)]="draft.submittedDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due date</label>
                <input type="date" [(ngModel)]="draft.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Submitted by</label>
                <input [(ngModel)]="draft.submittedBy" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Assigned to</label>
                <input [(ngModel)]="draft.assignedTo" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
                <select [(ngModel)]="draft.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
                </select></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Days added</label>
                <input type="number" [(ngModel)]="draft.daysAdded" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Question</label>
                <textarea [(ngModel)]="draft.question" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Reason</label>
                <input [(ngModel)]="draft.reason" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Location</label>
                <input [(ngModel)]="draft.location" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Drawing ref.</label>
                <input [(ngModel)]="draft.drawingReference" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Spec ref.</label>
                <input [(ngModel)]="draft.specReference" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
              <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Answer</label>
                <textarea [(ngModel)]="draft.answer" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea></div>
              <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.costImpact" id="rfiCost"><label for="rfiCost">Cost impact</label></div>
              <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.scheduleImpact" id="rfiSched"><label for="rfiSched">Schedule impact</label></div>
            </div>
            <div class="flex justify-end gap-2">
              <button type="button" (click)="cancel()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button type="button" (click)="save()" class="bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-lg text-sm font-semibold">Save RFI</button>
            </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
              <th class="px-5 py-3 text-left">RFI #</th><th class="px-5 py-3 text-left">Title / Question</th>
              <th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-left">Due</th><th class="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (rfi of filteredRfis(); track rfi.id) {
                <tr class="hover:bg-slate-50 transition-colors" [class.bg-amber-50]="isOverdue(rfi)">
                  <td class="px-5 py-3 font-mono font-medium">{{ rfi.rfiNumber || '—' }}</td>
                  <td class="px-5 py-3 max-w-sm truncate">{{ rfi.title || rfi.question || '—' }}</td>
                  <td class="px-5 py-3"><app-status-chip [tone]="rfiStatusTone(rfi.status)">{{ rfi.status }}</app-status-chip></td>
                  <td class="px-5 py-3">{{ rfi.dueDate || rfi.neededByDate || '—' }}</td>
                  <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1">
                    <button type="button" (click)="edit(rfi)" class="text-xs font-bold text-blue-600 hover:underline">Edit</button>
                    <button type="button" (click)="toggleDetail(rfi.id)" class="text-xs font-bold text-slate-600 hover:underline">Detail</button>
                    @if (rfi.status === 'Draft') {
                      <button type="button" (click)="submit(rfi)" class="text-xs font-bold text-emerald-700 hover:underline">Submit</button>
                    }
                    @if (rfi.status === 'Submitted') {
                      <button type="button" (click)="markAnswered(rfi)" class="text-xs font-bold text-indigo-700 hover:underline">Answer</button>
                    }
                    @if (rfi.status !== 'Closed' && rfi.status !== 'Void') {
                      <button type="button" (click)="close(rfi)" class="text-xs font-bold text-slate-700 hover:underline">Close</button>
                      <button type="button" (click)="voidRfi(rfi)" class="text-xs font-bold text-rose-600 hover:underline">Void</button>
                    }
                    @if ((rfi.costImpact || rfi.scheduleImpact) && !rfi.linkedChangeRequestId) {
                      <button type="button" (click)="createCr(rfi)" class="text-xs font-bold text-orange-600 hover:underline">Create CR</button>
                    }
                  </td>
                </tr>
                @if (expandedId() === rfi.id) {
                  <tr><td colspan="5" class="px-5 py-4 bg-slate-50 space-y-4">
                    <app-workflow-documents-section [project]="project" workflowType="rfi" [sourceRecordId]="rfi.id" [canGenerateDoc]="true" />
                    <app-related-records-section [projectId]="project.id" [rfiId]="rfi.id" [changeRequestId]="rfi.linkedChangeRequestId"
                      sourceRecordType="RFI" [sourceRecordId]="rfi.id" />
                  </td></tr>
                }
              } @empty {
                <tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic">No RFIs match this filter</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class RfisTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  ops = inject(ConstructionOperationsService);

  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  fieldIssues = toSignal(this.data.getFieldIssues(), { initialValue: [] });

  filter = signal<RfiFilter>('open');
  showForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId: string | null = null;
  draft: Partial<Rfi> = this.resetDraft();

  readonly filters = [
    { key: 'open' as RfiFilter, label: 'Open' },
    { key: 'overdue' as RfiFilter, label: 'Overdue' },
    { key: 'closed' as RfiFilter, label: 'Closed' },
    { key: 'all' as RfiFilter, label: 'All' },
  ];
  readonly statuses: RfiStatus[] = ['Draft', 'Submitted', 'Answered', 'Closed', 'Void'];
  readonly priorities: RfiPriority[] = ['Normal', 'High', 'Critical'];

  projectRfis = computed(() =>
    this.rfis().filter(r => r.projectId === this.project.id).sort((a, b) => (b.rfiNumber ?? '').localeCompare(a.rfiNumber ?? '')),
  );

  metrics = computed(() =>
    computeConstructionOpsMetrics(this.project.id, this.rfis(), this.submittals(), this.logs(), this.fieldIssues()),
  );

  filteredRfis = computed(() => {
    const list = this.projectRfis();
    const f = this.filter();
    if (f === 'open') return list.filter(isRfiOpen);
    if (f === 'overdue') return list.filter(isRfiOverdue);
    if (f === 'closed') return list.filter(r => r.status === 'Closed' || r.status === 'Void');
    return list;
  });

  ngOnInit(): void {
    void this.ops.refreshProjectAutomation(this.project);
  }

  isOverdue = isRfiOverdue;

  rfiStatusTone(status: RfiStatus): StatusTone {
    switch (status) {
      case 'Draft': return 'slate';
      case 'Submitted': return 'blue';
      case 'Answered': return 'green';
      case 'Closed': return 'slate';
      case 'Void': return 'red';
      default: return 'slate';
    }
  }

  resetDraft(): Partial<Rfi> {
    return { status: 'Draft', priority: 'Normal', submittedDate: new Date().toISOString().slice(0, 10), costImpact: false, scheduleImpact: false };
  }

  openNew(): void {
    this.draft = { ...this.resetDraft(), rfiNumber: this.ops.nextRfiNumber(this.project.id), projectId: this.project.id };
    this.editingId = null;
    this.showForm.set(true);
  }

  edit(rfi: Rfi): void {
    this.draft = {
      ...rfi,
      submittedDate: rfi.submittedDate ?? rfi.dateSubmitted,
      dueDate: rfi.dueDate ?? rfi.neededByDate,
      drawingReference: rfi.drawingReference ?? rfi.locationDrawingReference,
    };
    this.editingId = rfi.id;
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.draft = this.resetDraft(); }

  async save(): Promise<void> {
    await this.ops.saveRfi(this.project, this.draft, this.editingId);
    this.cancel();
  }

  async submit(rfi: Rfi): Promise<void> { await this.ops.submitRfi(rfi); }
  async markAnswered(rfi: Rfi): Promise<void> {
    const answer = rfi.answer ?? prompt('Enter RFI answer:') ?? '';
    if (!answer.trim()) return;
    await this.ops.answerRfi(rfi, answer.trim());
  }
  async close(rfi: Rfi): Promise<void> { await this.ops.closeRfi(rfi); }
  async voidRfi(rfi: Rfi): Promise<void> { await this.ops.voidRfi(rfi); }
  async createCr(rfi: Rfi): Promise<void> { await this.ops.createChangeRequestFromRfi(rfi); }
  toggleDetail(id: string): void { this.expandedId.set(this.expandedId() === id ? null : id); }
}
