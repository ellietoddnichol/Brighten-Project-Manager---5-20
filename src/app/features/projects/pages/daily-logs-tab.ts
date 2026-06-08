import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import { DailyLog, DailyLogStatus } from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ConstructionOperationsService } from '@features/projects/services/construction-operations.service';
import { WorkflowDocumentsSectionComponent } from '@app/components/workflow-documents-section';
import { RelatedRecordsSectionComponent } from '@app/components/related-records-section';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { computeConstructionOpsMetrics } from '@shared/utils/construction-operations';

type LogFilter = 'all' | 'draft' | 'submitted' | 'void';

@Component({
  selector: 'app-daily-logs-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, WorkflowDocumentsSectionComponent, RelatedRecordsSectionComponent, StatusChipComponent],
  template: `
    <div class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Log missing today</p>
          <p class="text-2xl font-bold text-amber-700">{{ metrics().dailyLogsMissingCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Potential changes</p>
          <p class="text-2xl font-bold text-orange-600">{{ metrics().potentialChangesCount }}</p>
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
            <mat-icon class="!text-[18px]">add</mat-icon> New Daily Log
          </button>
        </div>

        @if (showForm()) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Date</label>
              <input type="date" [(ngModel)]="draft.logDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Submitted by</label>
              <input [(ngModel)]="draft.submittedBy" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Foreman</label>
              <input [(ngModel)]="draft.foreman" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Weather</label>
              <input [(ngModel)]="draft.weather" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Temperature</label>
              <input [(ngModel)]="draft.temperature" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Crew count</label>
              <input type="number" [(ngModel)]="draft.crewCount" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Work performed</label>
              <textarea [(ngModel)]="draft.workPerformed" rows="2" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Areas worked</label>
              <input [(ngModel)]="draft.areasWorked" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Employees on site</label>
              <input [(ngModel)]="draft.employeesOnSite" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Subcontractors</label>
              <input [(ngModel)]="draft.subcontractorsOnSite" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Materials delivered</label>
              <input [(ngModel)]="draft.materialsDelivered" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Equipment used</label>
              <input [(ngModel)]="draft.equipmentUsed" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Delays</label>
              <input [(ngModel)]="draft.delays" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Safety issues</label>
              <input [(ngModel)]="draft.safetyIssues" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Inspections</label>
              <input [(ngModel)]="draft.inspections" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="col-span-full"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Visitors</label>
              <input [(ngModel)]="draft.visitors" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.potentialChange" id="potChange"><label for="potChange">Potential change</label></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.costImpact" id="logCost"><label for="logCost">Cost impact</label></div>
            <div class="flex items-center gap-2"><input type="checkbox" [(ngModel)]="draft.scheduleImpact" id="logSched"><label for="logSched">Schedule impact</label></div>
            @if (duplicateWarning()) {
              <div class="col-span-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                A log already exists for this date. Saving will create an additional log.
              </div>
            }
            <div class="col-span-full flex justify-end gap-2">
              <button type="button" (click)="cancel()" class="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button type="button" (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Save Log</button>
            </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
              <th class="px-5 py-3 text-left">Date</th><th class="px-5 py-3 text-left">Foreman</th>
              <th class="px-5 py-3 text-left">Work</th><th class="px-5 py-3 text-left">Status</th><th class="px-5 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (log of filteredLogs(); track log.id) {
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-5 py-3 text-xs font-mono font-bold text-slate-900">{{ log.logDate }}</td>
                  <td class="px-5 py-3">{{ log.foreman || log.submittedBy || '—' }}</td>
                  <td class="px-5 py-3 max-w-md truncate">{{ log.workPerformed || '—' }}</td>
                  <td class="px-5 py-3">
                    <app-status-chip [tone]="logTone(log.status)">{{ log.status || 'Draft' }}</app-status-chip>
                  </td>
                  <td class="px-5 py-3 text-right flex flex-wrap justify-end gap-1">
                    <button type="button" (click)="edit(log)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">Edit</button>
                    <button type="button" (click)="toggleDetail(log.id)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">Detail</button>
                    @if (log.status !== 'Submitted' && log.status !== 'Void') {
                      <button type="button" (click)="submit(log)" class="text-xs font-bold text-emerald-700 hover:underline">Submit</button>
                    }
                    @if ((log.potentialChange || log.costImpact || log.scheduleImpact) && !log.linkedChangeRequestId) {
                      <button type="button" (click)="createCr(log)" class="text-xs font-bold text-orange-600 hover:underline">Create CR</button>
                    }
                    @if (log.status !== 'Void') {
                      <button type="button" (click)="voidLog(log)" class="text-xs font-bold text-rose-600 hover:underline">Void</button>
                    }
                  </td>
                </tr>
                @if (expandedId() === log.id) {
                  <tr><td colspan="5" class="px-5 py-4 bg-slate-50 space-y-4">
                    <app-workflow-documents-section [project]="project" workflowType="daily_log" [sourceRecordId]="log.id"
                      [canGenerateDoc]="true" [photoUpload]="true" />
                    <app-related-records-section [projectId]="project.id" [dailyLogId]="log.id" [changeRequestId]="log.linkedChangeRequestId"
                      sourceRecordType="DailyLog" [sourceRecordId]="log.id" />
                  </td></tr>
                }
              } @empty {
                <tr><td colspan="5" class="px-5 py-10 text-center text-slate-400 italic">No daily logs match this filter</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class DailyLogsTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  ops = inject(ConstructionOperationsService);

  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  fieldIssues = toSignal(this.data.getFieldIssues(), { initialValue: [] });

  filter = signal<LogFilter>('all');
  showForm = signal(false);
  expandedId = signal<string | null>(null);
  editingId: string | null = null;
  draft: Partial<DailyLog> = this.resetDraft();

  readonly filters = [
    { key: 'all' as LogFilter, label: 'All' },
    { key: 'draft' as LogFilter, label: 'Draft' },
    { key: 'submitted' as LogFilter, label: 'Submitted' },
    { key: 'void' as LogFilter, label: 'Void' },
  ];

  projectLogs = computed(() =>
    this.logs().filter(l => l.projectId === this.project.id).sort((a, b) => b.logDate.localeCompare(a.logDate)),
  );

  metrics = computed(() =>
    computeConstructionOpsMetrics(this.project.id, this.rfis(), this.submittals(), this.logs(), this.fieldIssues(), true),
  );

  filteredLogs = computed(() => {
    const list = this.projectLogs();
    const f = this.filter();
    if (f === 'draft') return list.filter(l => !l.status || l.status === 'Draft');
    if (f === 'submitted') return list.filter(l => l.status === 'Submitted' || l.status === 'Approved');
    if (f === 'void') return list.filter(l => l.status === 'Void');
    return list;
  });

  duplicateWarning = computed(() => {
    const date = this.draft.logDate;
    if (!date || this.editingId) return false;
    return this.projectLogs().some(l => l.logDate === date && l.status !== 'Void');
  });

  ngOnInit(): void { void this.ops.refreshProjectAutomation(this.project); }

  resetDraft(): Partial<DailyLog> {
    return {
      logDate: new Date().toISOString().slice(0, 10),
      status: 'Draft',
      potentialChange: false,
      costImpact: false,
      scheduleImpact: false,
    };
  }

  openNew(): void {
    this.draft = { ...this.resetDraft(), projectId: this.project.id };
    this.editingId = null;
    this.showForm.set(true);
  }

  edit(log: DailyLog): void {
    this.draft = { ...log, employeesOnSite: log.employeesOnSite ?? log.crewOnSite };
    this.editingId = log.id;
    this.showForm.set(true);
  }

  cancel(): void { this.showForm.set(false); this.draft = this.resetDraft(); this.editingId = null; }

  async save(): Promise<void> {
    await this.ops.saveDailyLog(this.project, this.draft, this.editingId);
    this.cancel();
  }

  async submit(log: DailyLog): Promise<void> { await this.ops.submitDailyLog(log); }
  async createCr(log: DailyLog): Promise<void> { await this.ops.createChangeRequestFromDailyLog(log); }
  async voidLog(log: DailyLog): Promise<void> { await this.ops.voidDailyLog(log); }
  toggleDetail(id: string): void { this.expandedId.set(this.expandedId() === id ? null : id); }

  logTone(status?: DailyLogStatus | string): StatusTone {
    if (status === 'Submitted' || status === 'Approved') return 'green';
    if (status === 'Void') return 'red';
    return 'amber';
  }
}
