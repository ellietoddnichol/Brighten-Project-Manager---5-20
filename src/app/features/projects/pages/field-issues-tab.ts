import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import {
  FieldIssue,
  FieldIssuePriority,
  FieldIssueStatus,
  FieldIssueType,
} from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ConstructionOperationsService } from '@features/projects/services/construction-operations.service';
import { RelatedRecordsSectionComponent } from '@app/components/related-records-section';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { computeConstructionOpsMetrics, isFieldIssueOpen } from '@shared/utils/construction-operations';

type IssueFilter = 'all' | 'open' | 'closed';

@Component({
  selector: 'app-field-issues-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, RelatedRecordsSectionComponent, StatusChipComponent],
  template: `
    <div class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open issues</p>
          <p class="text-2xl font-bold text-slate-900">{{ metrics().fieldIssuesOpenCount }}</p>
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
            <mat-icon class="!text-[18px]">add</mat-icon> New Field Issue
          </button>
        </div>

        @if (showForm()) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
              <input [(ngModel)]="draft.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
              <textarea [(ngModel)]="draft.description" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Location</label>
              <input [(ngModel)]="draft.location" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Reported by</label>
              <input [(ngModel)]="draft.reportedBy" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Reported date</label>
              <input type="date" [(ngModel)]="draft.reportedDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Issue type</label>
              <select [(ngModel)]="draft.issueType" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                @for (t of issueTypes; track t) { <option [value]="t">{{ t }}</option> }
              </select></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</label>
              <select [(ngModel)]="draft.priority" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
              </select></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Assigned to</label>
              <input [(ngModel)]="draft.assignedTo" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
              <select [(ngModel)]="draft.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.costImpact" id="fiCost"><label for="fiCost">Cost impact</label></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.scheduleImpact" id="fiSched"><label for="fiSched">Schedule impact</label></div>
            <div class="col-span-full flex justify-end gap-2">
              <button type="button" (click)="cancel()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button type="button" (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Save</button>
            </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
              <th class="px-5 py-3 text-left">#</th><th class="px-5 py-3 text-left">Title</th><th class="px-5 py-3 text-left">Type</th>
              <th class="px-5 py-3 text-left">Priority</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (issue of filteredIssues(); track issue.id) {
                <tr class="hover:bg-slate-50 transition-colors"
                    [class.bg-rose-50]="issue.priority === 'Critical'">
                  <td class="px-5 py-3 text-xs font-mono font-bold text-slate-900">#{{ issue.id.slice(0, 8) }}</td>
                  <td class="px-5 py-3 font-medium max-w-sm truncate">{{ issue.title }}</td>
                  <td class="px-5 py-3">{{ issue.issueType || '—' }}</td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="priorityTone(issue.priority)">{{ issue.priority || 'Normal' }}</app-status-chip>
                  </td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="issueStatusTone(issue.status)">{{ issue.status }}</app-status-chip>
                  </td>
                  <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1">
                    <button type="button" (click)="edit(issue)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">Edit</button>
                    <button type="button" (click)="toggleDetail(issue.id)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">Detail</button>
                    @if (issue.status === 'Open' || issue.status === 'In Review') {
                      <button type="button" (click)="convertRfi(issue)" class="text-xs font-bold text-indigo-700 hover:underline">→ RFI</button>
                      <button type="button" (click)="convertCr(issue)" class="text-xs font-bold text-orange-600 hover:underline">→ CR</button>
                      <button type="button" (click)="addToLog(issue)" class="text-xs font-bold text-emerald-700 hover:underline">→ Daily Log</button>
                      <button type="button" (click)="createTask(issue)" class="text-xs font-bold text-violet-700 hover:underline">Task</button>
                      <button type="button" (click)="close(issue)" class="text-xs font-bold text-slate-700 hover:underline">Close</button>
                      <button type="button" (click)="voidIssue(issue)" class="text-xs font-bold text-rose-600 hover:underline">Void</button>
                    }
                  </td>
                </tr>
                @if (expandedId() === issue.id) {
                  <tr><td colspan="6" class="px-5 py-4 bg-slate-50">
                    <app-related-records-section [projectId]="project.id" [fieldIssueId]="issue.id"
                      [rfiId]="issue.linkedRfiId" [dailyLogId]="issue.linkedDailyLogId" [changeRequestId]="issue.linkedChangeRequestId"
                      sourceRecordType="FieldIssue" [sourceRecordId]="issue.id" />
                  </td></tr>
                }
              } @empty {
                <tr><td colspan="6" class="px-5 py-10 text-center text-slate-400 italic">No field issues match this filter</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class FieldIssuesTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  ops = inject(ConstructionOperationsService);

  issues = toSignal(this.data.getFieldIssues(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });

  filter = signal<IssueFilter>('open');
  showForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId: string | null = null;
  draft: Partial<FieldIssue> = this.resetDraft();

  readonly filters = [
    { key: 'open' as IssueFilter, label: 'Open' },
    { key: 'closed' as IssueFilter, label: 'Closed' },
    { key: 'all' as IssueFilter, label: 'All' },
  ];
  readonly issueTypes: FieldIssueType[] = ['Quality', 'Safety', 'Field Condition', 'Coordination', 'Delay', 'Damage', 'Other'];
  readonly priorities: FieldIssuePriority[] = ['Low', 'Normal', 'High', 'Critical'];
  readonly statuses: FieldIssueStatus[] = ['Open', 'In Review', 'Converted', 'Closed', 'Void'];

  projectIssues = computed(() =>
    this.issues().filter(i => i.projectId === this.project.id).sort((a, b) => (b.reportedDate ?? '').localeCompare(a.reportedDate ?? '')),
  );

  metrics = computed(() =>
    computeConstructionOpsMetrics(this.project.id, this.rfis(), this.submittals(), this.logs(), this.issues()),
  );

  filteredIssues = computed(() => {
    const list = this.projectIssues();
    const f = this.filter();
    if (f === 'open') return list.filter(isFieldIssueOpen);
    if (f === 'closed') return list.filter(i => i.status === 'Closed' || i.status === 'Void' || i.status === 'Converted');
    return list;
  });

  ngOnInit(): void { void this.ops.refreshProjectAutomation(this.project); }

  resetDraft(): Partial<FieldIssue> {
    return {
      title: '',
      status: 'Open',
      priority: 'Normal',
      issueType: 'Field Condition',
      reportedDate: new Date().toISOString().slice(0, 10),
      costImpact: false,
      scheduleImpact: false,
    };
  }

  openNew(): void {
    this.draft = { ...this.resetDraft(), projectId: this.project.id };
    this.editingId = null;
    this.showForm.set(true);
  }

  edit(issue: FieldIssue): void { this.draft = { ...issue }; this.editingId = issue.id; this.showForm.set(true); }
  cancel(): void { this.showForm.set(false); this.draft = this.resetDraft(); this.editingId = null; }

  async save(): Promise<void> {
    await this.ops.saveFieldIssue(this.project, this.draft, this.editingId);
    this.cancel();
  }

  async convertRfi(issue: FieldIssue): Promise<void> { await this.ops.convertFieldIssueToRfi(issue); }
  async convertCr(issue: FieldIssue): Promise<void> { await this.ops.convertFieldIssueToChangeRequest(issue); }
  async addToLog(issue: FieldIssue): Promise<void> { await this.ops.addFieldIssueToDailyLog(issue); }
  async createTask(issue: FieldIssue): Promise<void> { await this.ops.createTaskFromFieldIssue(issue); }
  async close(issue: FieldIssue): Promise<void> { await this.ops.closeFieldIssue(issue); }
  async voidIssue(issue: FieldIssue): Promise<void> { await this.ops.voidFieldIssue(issue); }
  toggleDetail(id: string): void { this.expandedId.set(this.expandedId() === id ? null : id); }

  priorityTone(priority?: FieldIssuePriority | string): StatusTone {
    if (priority === 'Critical') return 'red';
    if (priority === 'High') return 'amber';
    return 'slate';
  }

  issueStatusTone(status: FieldIssueStatus | string): StatusTone {
    if (status === 'Closed' || status === 'Converted') return 'green';
    if (status === 'Void') return 'red';
    if (status === 'In Review') return 'amber';
    return 'blue';
  }
}
