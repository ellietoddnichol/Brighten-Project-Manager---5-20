import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '../models/types';
import { Submittal, SubmittalStatus } from '../models/project-controls.types';
import { DataService } from '../services/data.service';
import { ConstructionOperationsService } from '../services/construction-operations.service';
import { WorkflowDocumentsSectionComponent } from '../components/workflow-documents-section';
import { RelatedRecordsSectionComponent } from '../components/related-records-section';
import {
  computeConstructionOpsMetrics,
  isSubmittalOpen,
  isSubmittalOverdue,
} from '../utils/construction-operations';

type SubFilter = 'all' | 'open' | 'overdue' | 'closed';

@Component({
  selector: 'app-submittals-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, WorkflowDocumentsSectionComponent, RelatedRecordsSectionComponent],
  template: `
    <div class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open submittals</p>
          <p class="text-2xl font-bold text-slate-900">{{ metrics().openSubmittalCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Overdue</p>
          <p class="text-2xl font-bold text-amber-700">{{ metrics().overdueSubmittalCount }}</p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-3">
          <div class="flex flex-wrap gap-2">
            @for (f of filters; track f.key) {
              <button type="button" (click)="filter.set(f.key)" class="px-3 py-1.5 text-xs font-semibold rounded-lg"
                      [class.bg-slate-900]="filter() === f.key" [class.text-white]="filter() === f.key"
                      [class.text-slate-600]="filter() !== f.key">{{ f.label }}</button>
            }
          </div>
          <button type="button" (click)="openNew()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px]">add</mat-icon> New Submittal
          </button>
        </div>

        @if (showForm()) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Submittal #</label>
              <input [(ngModel)]="draft.submittalNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
              <input [(ngModel)]="draft.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Spec section</label>
              <input [(ngModel)]="draft.specSection" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
              <textarea [(ngModel)]="draft.description" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Vendor</label>
              <input [(ngModel)]="draft.vendor" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Subcontractor</label>
              <input [(ngModel)]="draft.subcontractor" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Package name</label>
              <input [(ngModel)]="draft.packageName" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
              <select [(ngModel)]="draft.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Required date</label>
              <input type="date" [(ngModel)]="draft.requiredDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due date</label>
              <input type="date" [(ngModel)]="draft.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Ball in court</label>
              <input [(ngModel)]="draft.ballInCourt" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Lead time (days)</label>
              <input type="number" [(ngModel)]="draft.leadTimeDays" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.materialReleaseRequired" id="matRel"><label for="matRel">Material release required</label></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.costImpact" id="subCost"><label for="subCost">Cost impact</label></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.scheduleImpact" id="subSched"><label for="subSched">Schedule impact</label></div>
            <div class="col-span-full flex justify-end gap-2">
              <button type="button" (click)="cancel()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button type="button" (click)="save()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Save</button>
            </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
              <th class="px-5 py-3 text-left">#</th><th class="px-5 py-3 text-left">Title</th>
              <th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-left">Due</th><th class="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (s of filteredSubs(); track s.id) {
                <tr class="hover:bg-slate-50" [class.bg-amber-50]="isOverdue(s)">
                  <td class="px-5 py-3 font-mono">{{ s.submittalNumber || '—' }}</td>
                  <td class="px-5 py-3 max-w-sm truncate">{{ s.title || s.description || '—' }}</td>
                  <td class="px-5 py-3">{{ s.status }}</td>
                  <td class="px-5 py-3">{{ s.dueDate || s.requiredDate || '—' }}</td>
                  <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1">
                    <button type="button" (click)="edit(s)" class="text-xs font-bold text-blue-600 hover:underline">Edit</button>
                    <button type="button" (click)="toggleDetail(s.id)" class="text-xs font-bold text-slate-600 hover:underline">Detail</button>
                    @if (s.status === 'Needed' || s.status === 'Draft') {
                      <button type="button" (click)="markSubmitted(s)" class="text-xs font-bold text-emerald-700 hover:underline">Submit</button>
                    }
                    @if (s.status === 'Submitted') {
                      <button type="button" (click)="setStatus(s, 'Approved')" class="text-xs font-bold text-emerald-700 hover:underline">Approve</button>
                      <button type="button" (click)="setStatus(s, 'Approved as Noted')" class="text-xs font-bold text-emerald-600 hover:underline">Appr. noted</button>
                      <button type="button" (click)="setStatus(s, 'Revise and Resubmit')" class="text-xs font-bold text-amber-700 hover:underline">Revise</button>
                      <button type="button" (click)="setStatus(s, 'Rejected')" class="text-xs font-bold text-rose-600 hover:underline">Reject</button>
                    }
                    @if ((s.status === 'Approved' || s.status === 'Approved as Noted') && s.materialReleaseRequired && !s.materialReleasedDate) {
                      <button type="button" (click)="releaseMaterial(s)" class="text-xs font-bold text-violet-700 hover:underline">Release material</button>
                    }
                    @if ((s.costImpact || s.scheduleImpact) && !s.linkedChangeRequestId) {
                      <button type="button" (click)="createCr(s)" class="text-xs font-bold text-orange-600 hover:underline">Create CR</button>
                    }
                  </td>
                </tr>
                @if (expandedId() === s.id) {
                  <tr><td colspan="5" class="px-5 py-4 bg-slate-50 space-y-4">
                    <app-workflow-documents-section [project]="project" workflowType="submittal" [sourceRecordId]="s.id" [canGenerateDoc]="true" />
                    <app-related-records-section [projectId]="project.id" [submittalId]="s.id" [changeRequestId]="s.linkedChangeRequestId"
                      sourceRecordType="Submittal" [sourceRecordId]="s.id" />
                  </td></tr>
                }
              } @empty {
                <tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic">No submittals match this filter</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class SubmittalsTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  ops = inject(ConstructionOperationsService);

  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  fieldIssues = toSignal(this.data.getFieldIssues(), { initialValue: [] });

  filter = signal<SubFilter>('open');
  showForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId: string | null = null;
  draft: Partial<Submittal> = { status: 'Needed' };

  readonly filters = [
    { key: 'open' as SubFilter, label: 'Open' },
    { key: 'overdue' as SubFilter, label: 'Overdue' },
    { key: 'closed' as SubFilter, label: 'Closed' },
    { key: 'all' as SubFilter, label: 'All' },
  ];
  readonly statuses: SubmittalStatus[] = [
    'Needed', 'Draft', 'Submitted', 'Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected', 'Closed', 'Void',
  ];

  projectSubs = computed(() =>
    this.submittals().filter(s => s.projectId === this.project.id).sort((a, b) => (b.submittalNumber ?? '').localeCompare(a.submittalNumber ?? '')),
  );

  metrics = computed(() =>
    computeConstructionOpsMetrics(this.project.id, this.rfis(), this.submittals(), this.logs(), this.fieldIssues()),
  );

  filteredSubs = computed(() => {
    const list = this.projectSubs();
    const f = this.filter();
    if (f === 'open') return list.filter(isSubmittalOpen);
    if (f === 'overdue') return list.filter(isSubmittalOverdue);
    if (f === 'closed') return list.filter(s => s.status === 'Closed' || s.status === 'Void');
    return list;
  });

  ngOnInit(): void { void this.ops.refreshProjectAutomation(this.project); }
  isOverdue = isSubmittalOverdue;

  openNew(): void {
    this.draft = { status: 'Needed', submittalNumber: this.ops.nextSubmittalNumber(this.project.id), projectId: this.project.id };
    this.editingId = null;
    this.showForm.set(true);
  }

  edit(s: Submittal): void {
    this.draft = { ...s, vendor: s.vendor ?? s.vendorSubcontractor };
    this.editingId = s.id;
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.draft = { status: 'Needed' }; }

  async save(): Promise<void> {
    await this.ops.saveSubmittal(this.project, this.draft, this.editingId);
    this.cancel();
  }

  async markSubmitted(s: Submittal): Promise<void> { await this.ops.markSubmittalSubmitted(s); }
  async setStatus(s: Submittal, status: SubmittalStatus): Promise<void> { await this.ops.updateSubmittalStatus(s, status); }
  async createCr(s: Submittal): Promise<void> { await this.ops.createChangeRequestFromSubmittal(s); }
  async releaseMaterial(s: Submittal): Promise<void> {
    await this.ops.saveSubmittal(this.project, {
      ...s,
      materialReleasedDate: new Date().toISOString().slice(0, 10),
    }, s.id);
  }
  toggleDetail(id: string): void { this.expandedId.set(this.expandedId() === id ? null : id); }
}
