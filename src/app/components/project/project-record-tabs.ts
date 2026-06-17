import { Component, ChangeDetectionStrategy, Input, inject, signal, computed, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Project, ChangeOrder, ProjectTask } from '@app/models/types';
import { ProjectLaborEntry, ProjectMaterial } from '@app/models/job-record.types';
import { DataService } from '@core/services/data.service';
import { JobRecordService } from '@features/projects/services/job-record.service';
import { ActivityEventsService } from '@core/services/activity-events.service';
import { ActivityEvent } from '@app/models/activity-event.types';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { ChangesTabComponent } from '@features/projects/pages/changes-tab';
import { ProjectSubcontractorsTabComponent } from '@features/projects/pages/project-subcontractors-tab';
import { formatMoney } from '@features/projects/utils/project-profit.compute';
import { projectProfileLabel } from '@features/projects/utils/project-profile.compat';

type SaveState = 'idle' | 'saving' | 'saved';

@Component({
  selector: 'app-project-record-overview-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-slate-900">Job Overview</h2>
        <span class="text-xs text-slate-500">{{ saveState() === 'saving' ? 'Saving…' : saveState() === 'saved' ? 'Saved' : '' }}</span>
      </div>
      <div class="grid sm:grid-cols-2 gap-4 text-sm">
        <div>
          <label class="text-[10px] font-bold uppercase text-slate-500">Scope / Work Requested</label>
          <textarea [(ngModel)]="scope" rows="3" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                    (blur)="saveScope()"></textarea>
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-[10px] font-bold uppercase text-slate-500">Project Manager</label>
            <input [(ngModel)]="pm" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="savePm()" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase text-slate-500">Superintendent</label>
            <input [(ngModel)]="sup" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="saveSup()" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase text-slate-500">Address</label>
            <input [(ngModel)]="address" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="saveAddress()" />
          </div>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
        <div><span class="text-slate-500">Profile</span><p class="font-semibold">{{ profileLabel }}</p></div>
        <div><span class="text-slate-500">Start</span><p class="font-semibold">{{ project.startDate || '—' }}</p></div>
        <div><span class="text-slate-500">Target Finish</span><p class="font-semibold">{{ project.targetCompletionDate || '—' }}</p></div>
        <div><span class="text-slate-500">County</span><p class="font-semibold">{{ project.county || '—' }}</p></div>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordOverviewTabComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  saveState = signal<SaveState>('idle');
  scope = '';
  pm = '';
  sup = '';
  address = '';

  get profileLabel(): string {
    return projectProfileLabel(this.project.projectProfile);
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.scope = this.project.scopeSummary ?? '';
    this.pm = this.project.projectManager ?? '';
    this.sup = this.project.superintendent ?? '';
    this.address = this.project.address ?? '';
  }

  private async patch(fields: Partial<Project>): Promise<void> {
    this.saveState.set('saving');
    await this.jobRecord.saveProjectField(this.project, fields);
    Object.assign(this.project, fields);
    this.saveState.set('saved');
    setTimeout(() => this.saveState.set('idle'), 1500);
  }

  saveScope(): void { void this.patch({ scopeSummary: this.scope.trim() || undefined }); }
  savePm(): void { void this.patch({ projectManager: this.pm.trim() || undefined }); }
  saveSup(): void { void this.patch({ superintendent: this.sup.trim() || undefined }); }
  saveAddress(): void { void this.patch({ address: this.address.trim() || undefined }); }
}

@Component({
  selector: 'app-project-record-labor-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <div>
          <h2 class="text-sm font-bold">Labor</h2>
          <p class="text-xs text-slate-500">Total hours: {{ totalHours.toFixed(1) }} · Labor cost: {{ fmt(totalCost) }}</p>
        </div>
        <button type="button" (click)="showForm.set(true)" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Labor</button>
      </div>
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" [(ngModel)]="draft.workDate" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.employeeName" placeholder="Employee / crew" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.classification" placeholder="Classification" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.laborCode" placeholder="Labor code" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.regularHours" placeholder="Reg hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.overtimeHours" placeholder="OT hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.doubleTimeHours" placeholder="DT hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.costRate" placeholder="Cost rate" class="border rounded-lg px-3 py-2 text-sm" />
          <div class="sm:col-span-2 flex gap-2">
            <button type="button" (click)="saveLabor()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="showForm.set(false)" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
          <tr>
            <th class="px-4 py-2 text-left">Date</th>
            <th class="px-4 py-2 text-left">Employee</th>
            <th class="px-4 py-2 text-left">Code</th>
            <th class="px-4 py-2 text-right">Reg</th>
            <th class="px-4 py-2 text-right">OT</th>
            <th class="px-4 py-2 text-right">DT</th>
            <th class="px-4 py-2 text-right">Total</th>
            <th class="px-4 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          @for (row of entries(); track row.id) {
            <tr class="border-t border-slate-100">
              <td class="px-4 py-2">{{ row.workDate }}</td>
              <td class="px-4 py-2">{{ row.employeeName || '—' }}</td>
              <td class="px-4 py-2">{{ row.laborCode || row.classification || '—' }}</td>
              <td class="px-4 py-2 text-right">{{ row.regularHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.overtimeHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.doubleTimeHours }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ row.totalHours }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(row.laborCost) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8"><app-empty-state title="No labor entered yet" message="Add labor hours for this job." /></td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordLaborTabComponent {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  private data = inject(DataService);
  showForm = signal(false);
  draft: Partial<ProjectLaborEntry> = { workDate: new Date().toISOString().slice(0, 10), regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 };

  private allLabor = toSignal(this.data.getProjectLaborEntries(), { initialValue: [] as ProjectLaborEntry[] });
  entries = computed(() => this.allLabor().filter(e => e.projectId === this.project.id));

  get totalHours(): number {
    return this.entries().reduce((s, e) => s + (e.totalHours ?? 0), 0);
  }
  get totalCost(): number {
    return this.entries().reduce((s, e) => s + (e.laborCost ?? 0), 0);
  }

  fmt = formatMoney;

  async saveLabor(): Promise<void> {
    await this.jobRecord.createLaborEntry({ ...this.draft, projectId: this.project.id });
    this.showForm.set(false);
    this.draft = { workDate: new Date().toISOString().slice(0, 10), regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
  }
}

@Component({
  selector: 'app-project-record-materials-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <div>
          <h2 class="text-sm font-bold">Materials</h2>
          <p class="text-xs text-slate-500">Total material cost: {{ fmt(totalCost) }}</p>
        </div>
        <button type="button" (click)="showForm.set(true)" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Material</button>
      </div>
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" [(ngModel)]="draft.entryDate" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.vendor" placeholder="Vendor" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.description" placeholder="Description" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.category" placeholder="Category" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.quantity" placeholder="Qty" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.unitCost" placeholder="Unit cost" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.totalCost" placeholder="Total cost" class="border rounded-lg px-3 py-2 text-sm" />
          <div class="flex gap-2">
            <button type="button" (click)="saveMaterial()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="showForm.set(false)" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
          <tr>
            <th class="px-4 py-2 text-left">Date</th>
            <th class="px-4 py-2 text-left">Vendor</th>
            <th class="px-4 py-2 text-left">Description</th>
            <th class="px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          @for (row of entries(); track row.id) {
            <tr class="border-t border-slate-100">
              <td class="px-4 py-2">{{ row.entryDate }}</td>
              <td class="px-4 py-2">{{ row.vendor || '—' }}</td>
              <td class="px-4 py-2">{{ row.description }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ fmt(row.totalCost) }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4"><app-empty-state title="No materials entered yet" message="Add material costs for this job." /></td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordMaterialsTabComponent {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  private data = inject(DataService);
  showForm = signal(false);
  draft: Partial<ProjectMaterial> = { entryDate: new Date().toISOString().slice(0, 10), description: '', totalCost: 0 };

  private allMaterials = toSignal(this.data.getProjectMaterials(), { initialValue: [] as ProjectMaterial[] });
  entries = computed(() => this.allMaterials().filter(m => m.projectId === this.project.id));

  get totalCost(): number {
    return this.entries().reduce((s, m) => s + (m.totalCost ?? 0), 0);
  }

  fmt = formatMoney;

  async saveMaterial(): Promise<void> {
    if (!this.draft.description?.trim()) return;
    await this.jobRecord.createMaterial({ ...this.draft, projectId: this.project.id });
    this.showForm.set(false);
    this.draft = { entryDate: new Date().toISOString().slice(0, 10), description: '', totalCost: 0 };
  }
}

@Component({
  selector: 'app-project-record-changes-tab',
  standalone: true,
  imports: [ChangesTabComponent],
  template: `<app-changes-tab [project]="project" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordChangesTabComponent {
  @Input({ required: true }) project!: Project;
}

@Component({
  selector: 'app-project-record-todos-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <h2 class="text-sm font-bold">Todos</h2>
        <button type="button" (click)="showForm.set(true)" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Todo</button>
      </div>
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 space-y-2">
          <input [(ngModel)]="draft.title" placeholder="Todo title" class="w-full border rounded-lg px-3 py-2 text-sm" />
          <textarea [(ngModel)]="draft.description" placeholder="Description" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm"></textarea>
          <div class="flex gap-2">
            <button type="button" (click)="saveTodo()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="showForm.set(false)" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <ul class="divide-y divide-slate-100">
        @for (t of todos(); track t.id) {
          <li class="px-5 py-3 flex justify-between gap-3">
            <div>
              <p class="font-semibold text-sm">{{ t.title }}</p>
              @if (t.description) { <p class="text-xs text-slate-500">{{ t.description }}</p> }
            </div>
            <span class="text-xs text-slate-500 shrink-0">{{ t.status }}</span>
          </li>
        } @empty {
          <li class="p-4"><app-empty-state title="No todos yet" message="Add a todo for this job." /></li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordTodosTabComponent {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  showForm = signal(false);
  draft: Partial<ProjectTask> = { title: '', status: 'Not Started', source: 'manual' };

  private allTodos = toSignal(this.data.getProjectTasks(), { initialValue: [] as ProjectTask[] });
  todos = computed(() => this.allTodos().filter(t => t.projectId === this.project.id));

  async saveTodo(): Promise<void> {
    if (!this.draft.title?.trim()) return;
    await firstValueFrom(this.data.createProjectTask({ ...this.draft, projectId: this.project.id }));
    this.showForm.set(false);
    this.draft = { title: '', status: 'Not Started', source: 'manual' };
  }
}

@Component({
  selector: 'app-project-record-activities-tab',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b"><h2 class="text-sm font-bold">Activities</h2></div>
      <ul class="divide-y divide-slate-100">
        @for (a of events(); track a.id) {
          <li class="px-5 py-3">
            <p class="text-sm font-semibold">{{ a.title }}</p>
            @if (a.description) { <p class="text-xs text-slate-500">{{ a.description }}</p> }
          </li>
        } @empty {
          <li class="p-4"><app-empty-state title="No recent activity yet" message="Edits and additions will appear here." /></li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordActivitiesTabComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) project!: Project;
  private activitySvc = inject(ActivityEventsService);
  events = signal<ActivityEvent[]>([]);
  private sub?: { unsubscribe(): void };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project?.id) {
      this.sub?.unsubscribe();
      this.sub = this.activitySvc.getProjectEvents(this.project.id).subscribe(e => this.events.set(e));
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

@Component({
  selector: 'app-project-record-subs-tab',
  standalone: true,
  imports: [ProjectSubcontractorsTabComponent],
  template: `<app-project-subcontractors-tab [project]="project" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordSubsTabComponent {
  @Input({ required: true }) project!: Project;
}

@Component({
  selector: 'app-project-record-documents-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <h2 class="text-sm font-bold">Documents</h2>
        <button type="button" (click)="showForm.set(true)" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Document Link</button>
      </div>
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 gap-3">
          <input [(ngModel)]="draft.fileName" placeholder="Document name" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.fileUrl" placeholder="Drive or file URL" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.documentType" placeholder="Type (Contract, COI, etc.)" class="border rounded-lg px-3 py-2 text-sm" />
          <div class="flex gap-2">
            <button type="button" (click)="saveDoc()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="showForm.set(false)" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <ul class="divide-y divide-slate-100">
        @for (f of files(); track f.id) {
          <li class="px-5 py-3 flex justify-between gap-3">
            <div>
              <p class="font-semibold text-sm">{{ f.fileName }}</p>
              <p class="text-xs text-slate-500">{{ f.documentType }}</p>
            </div>
            @if (f.fileUrl) {
              <a [href]="f.fileUrl" target="_blank" rel="noopener" class="text-xs font-semibold text-indigo-700">Open</a>
            }
          </li>
        } @empty {
          <li class="p-4"><app-empty-state title="No documents linked yet" message="Add a Drive link or document reference." /></li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordDocumentsTabComponent {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  showForm = signal(false);
  draft = { fileName: '', fileUrl: '', documentType: 'Other' };

  private allFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  files = computed(() => this.allFiles().filter(f => f.projectId === this.project.id && !f.archived));

  async saveDoc(): Promise<void> {
    if (!this.draft.fileName.trim()) return;
    await firstValueFrom(this.data.createProjectFile({
      projectId: this.project.id,
      fileName: this.draft.fileName.trim(),
      fileUrl: this.draft.fileUrl.trim() || undefined,
      documentType: this.draft.documentType.trim() || 'Other',
      documentStatus: 'Linked',
      sourceType: 'manual',
    }));
    this.showForm.set(false);
    this.draft = { fileName: '', fileUrl: '', documentType: 'Other' };
  }
}
