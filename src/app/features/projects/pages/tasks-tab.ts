import { Component, Input, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, ProjectTask } from '@app/models/types';
import { PROJECT_TASK_GROUPS } from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ProjectApiService } from '@core/services/api/project-api.service';
import { ListRowComponent } from '@app/components/ui/list-row';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { filterTasksBySegment, TaskFilterSegment } from '@features/projects/utils/project-work.compute';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

@Component({
  selector: 'app-tasks-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ListRowComponent, StatusChipComponent],
  template: `
    <div class="space-y-4">
      @if (sqlReadOnly()) {
        <div class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          <mat-icon class="!text-[16px] text-indigo-600">cloud_done</mat-icon>
          Tasks loaded from Cloud SQL (read-only). Add and edit still use Firestore until task write routes ship.
        </div>
      } @else if (projectApi.tasksError()) {
        <div class="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          Could not load tasks from API — showing Firestore tasks. {{ projectApi.tasksError() }}
        </div>
      }
      @if (!simplified) {
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div class="bg-white p-3 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open Tasks</p><p class="text-lg font-bold text-slate-900">{{ openTasks().length }}</p></div>
        <div class="bg-white p-3 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Overdue</p><p class="stat-value text-rose-600">{{ overdueCount() }}</p></div>
        <div class="bg-white p-3 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Complete</p><p class="stat-value text-emerald-600">{{ completeTasks().length }}</p></div>
      </div>
      }

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center gap-3">
          <h3 class="text-sm font-bold text-slate-900">{{ simplified ? 'Tasks' : 'Task Board' }}</h3>
          <div class="flex items-center gap-2">
            @if (!simplified) {
              <div class="flex rounded-lg border border-slate-200 overflow-hidden">
                <button type="button" (click)="setViewMode('list')"
                        class="px-3 py-1.5 text-xs font-semibold transition-colors"
                        [class.bg-slate-900]="viewMode() === 'list'"
                        [class.text-white]="viewMode() === 'list'"
                        [class.text-slate-600]="viewMode() !== 'list'">List</button>
                <button type="button" (click)="setViewMode('kanban')"
                        class="px-3 py-1.5 text-xs font-semibold transition-colors"
                        [class.bg-slate-900]="viewMode() === 'kanban'"
                        [class.text-white]="viewMode() === 'kanban'"
                        [class.text-slate-600]="viewMode() !== 'kanban'">Kanban</button>
              </div>
            }
            <button (click)="openNew()" [disabled]="sqlReadOnly()"
                    class="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold text-xs flex items-center gap-1.5 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <mat-icon class="!text-[16px]">add</mat-icon> Add Task
            </button>
          </div>
        </div>

        @if (showForm()) {
          <div class="p-4 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2"><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label><input [(ngModel)]="draft.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Group</label>
              <select [(ngModel)]="draft.taskGroup" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                @for (g of taskGroups; track g) { <option [value]="g">{{ g }}</option> }
              </select>
            </div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Assigned To</label><input [(ngModel)]="draft.assignedTo" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due Date</label><input type="date" [(ngModel)]="draft.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</label>
              <select [(ngModel)]="draft.priority" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                <option value="Low">Low</option><option value="Medium">Medium</option>
                <option value="High">High</option><option value="Critical">Critical</option>
              </select>
            </div>
            <div><label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
              <select [(ngModel)]="draft.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                <option value="Not Started">Not Started</option><option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option><option value="Complete">Complete</option>
              </select>
            </div>
            <div class="col-span-full flex justify-end gap-2">
              <button (click)="cancel()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
              <button (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Save Task</button>
            </div>
          </div>
        }

        @if (simplified) {
          @for (task of filteredTasks(); track task.id) {
            <app-list-row
              [title]="task.title"
              [subtitle]="(task.assignedTo || 'Unassigned') + ' · ' + task.status"
              [metrics]="taskMetrics(task)"
              [chips]="taskChips(task)"
              [nextAction]="task.status !== 'Complete' ? 'Close completed task' : undefined"
              [health]="isOverdue(task) ? 'Red' : task.priority === 'High' || task.priority === 'Critical' ? 'Yellow' : 'Neutral'" />
          } @empty {
            <div class="px-4 py-6 text-center text-slate-400 italic">No tasks match this filter</div>
          }
        } @else if (viewMode() === 'kanban') {
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-3">
            @for (col of kanbanColumns(); track col.id) {
              <div class="rounded-lg border border-slate-200 bg-slate-50/50">
                <div class="px-3 py-2 border-b border-slate-200 text-xs font-bold uppercase tracking-widest text-slate-500">{{ col.label }} ({{ col.tasks.length }})</div>
                @for (task of col.tasks; track task.id) {
                  <div class="px-3 py-2 border-b border-slate-100 hover:bg-slate-50 transition-colors"
                       [class.bg-rose-50]="isOverdue(task)">
                    <div class="text-xs font-mono font-bold text-slate-500 mb-0.5">#{{ task.id.slice(0, 8) }}</div>
                    <div class="font-medium text-slate-900 text-sm">{{ task.title }}</div>
                    <div class="text-xs text-slate-500 mt-1">{{ task.assignedTo || 'Unassigned' }}</div>
                    <div class="flex flex-wrap gap-1 mt-2">
                      <app-status-chip [tone]="taskStatusTone(task)">{{ task.status }}</app-status-chip>
                      @if (task.priority) {
                        <app-status-chip [tone]="priorityTone(task.priority)">{{ task.priority }}</app-status-chip>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
        @for (group of groupedTasks(); track group.name) {
          <div class="border-b border-slate-100 last:border-0">
            <div class="px-3 py-2 bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-500">{{ group.name }} ({{ group.tasks.length }})</div>
            @for (task of group.tasks; track task.id) {
              <div class="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50"
                   [class.bg-rose-50]="isOverdue(task)">
                <div>
                  <div class="text-xs font-mono font-bold text-slate-500 mb-0.5">#{{ task.id.slice(0, 8) }}</div>
                  <div class="font-medium text-slate-900">{{ task.title }}</div>
                  <div class="text-xs text-slate-500">
                    {{ task.assignedTo || 'Unassigned' }}
                    @if (task.dueDate) {
                      · Due <span [class.text-rose-700]="isOverdue(task)">{{ task.dueDate }}</span>
                    }
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <app-status-chip [tone]="taskStatusTone(task)">{{ task.status }}</app-status-chip>
                  @if (task.status !== 'Complete' && !sqlReadOnly()) {
                    <button (click)="complete(task)" class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg transition-colors">Done</button>
                  }
                </div>
              </div>
            } @empty {
              <div class="px-3 py-3 text-sm text-slate-400 italic">No tasks in this group</div>
            }
          </div>
        }
        }
      </div>
    </div>
  `,
})
export class TasksTabComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  @Input() simplified = false;
  @Input() filterSegment: TaskFilterSegment = 'all';
  private data = inject(DataService);
  readonly projectApi = inject(ProjectApiService);

  private firestoreTasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });

  sqlReadOnly = computed(() =>
    this.projectApi.isEnabled()
    && this.projectApi.tasksActiveSource() === 'api'
    && this.matchesLoadedProject(this.projectApi.tasksProjectId()),
  );

  projectTasks = computed(() => {
    if (this.sqlReadOnly()) {
      return this.projectApi.tasks().filter(t => t.projectId === this.project.id);
    }
    return this.firestoreTasks().filter(t => t.projectId === this.project.id && isManualProjectTask(t));
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project) {
      void this.projectApi.loadProjectTasks(this.projectKey());
    }
  }

  private projectKey(): string {
    return this.project.projectNumber || this.project.id;
  }

  private matchesLoadedProject(loadedKey: string | null): boolean {
    if (!loadedKey) return false;
    const keys = [this.project.id, this.project.projectNumber].filter(Boolean);
    return keys.some(key => key === loadedKey || key?.replace(/^J/i, '') === loadedKey.replace(/^J/i, ''));
  }
  openTasks = computed(() => this.projectTasks().filter(t => t.status !== 'Complete' && t.status !== 'Canceled'));
  completeTasks = computed(() => this.projectTasks().filter(t => t.status === 'Complete'));
  overdueCount = computed(() => this.openTasks().filter(t => this.isOverdue(t)).length);

  readonly taskGroups = PROJECT_TASK_GROUPS;

  groupedTasks = computed(() =>
    PROJECT_TASK_GROUPS.map(name => ({
      name,
      tasks: this.projectTasks().filter(t => (t.taskGroup ?? 'Field Operations') === name && t.status !== 'Complete'),
    })).filter(g => g.tasks.length > 0),
  );

  filteredTasks = computed(() =>
    filterTasksBySegment(
      this.sqlReadOnly() ? this.projectApi.tasks() : this.firestoreTasks(),
      this.project.id,
      this.filterSegment,
    ),
  );

  taskMetrics(task: ProjectTask) {
    const metrics: { label: string; value: string; alert?: boolean }[] = [];
    if (task.dueDate) metrics.push({ label: 'Due', value: task.dueDate, alert: this.isOverdue(task) });
    if (task.taskGroup) metrics.push({ label: 'Group', value: task.taskGroup });
    return metrics;
  }

  taskChips(task: ProjectTask): string[] {
    const chips: string[] = [];
    if (this.isOverdue(task)) chips.push('Overdue');
    if (task.priority === 'Critical' || task.priority === 'High') chips.push('Urgent');
    return chips;
  }

  showForm = signal(false);
  viewMode = signal<'list' | 'kanban'>(loadTasksView());
  editingId: string | null = null;
  draft: Partial<ProjectTask> = this.reset();

  kanbanColumns = computed(() => {
    const tasks = this.projectTasks().filter(t => t.status !== 'Complete' && t.status !== 'Canceled');
    return [
      { id: 'todo', label: 'To Do', tasks: tasks.filter(t => t.status === 'Not Started') },
      { id: 'progress', label: 'In Progress', tasks: tasks.filter(t => t.status === 'In Progress') },
      { id: 'blocked', label: 'Blocked', tasks: tasks.filter(t => t.status === 'Waiting') },
      { id: 'done', label: 'Done', tasks: this.completeTasks() },
    ];
  });

  taskStatusTone(task: ProjectTask): StatusTone {
    if (task.status === 'Complete') return 'green';
    if (this.isOverdue(task)) return 'red';
    if (task.status === 'Waiting') return 'amber';
    return 'slate';
  }

  priorityTone(priority: string): StatusTone {
    if (priority === 'Critical' || priority === 'High') return 'red';
    if (priority === 'Medium') return 'amber';
    return 'slate';
  }

  setViewMode(mode: 'list' | 'kanban'): void {
    this.viewMode.set(mode);
    try { localStorage.setItem('brighten.tasksView', mode); } catch { /* ignore */ }
  }

  reset(): Partial<ProjectTask> {
    return { status: 'Not Started', priority: 'Medium', taskGroup: 'Field Operations', source: 'manual' };
  }

  openNew() {
    this.draft = { ...this.reset(), projectId: this.project.id };
    this.editingId = null;
    this.showForm.set(true);
  }

  cancel() { this.showForm.set(false); }

  async save() {
    if (this.sqlReadOnly()) return;
    const payload = { ...this.draft, projectId: this.project.id, source: 'manual' as const };
    if (this.editingId) {
      await firstValueFrom(this.data.updateProjectTask(this.editingId, payload));
    } else {
      await firstValueFrom(this.data.createProjectTask(payload));
    }
    this.cancel();
  }

  async complete(task: ProjectTask) {
    if (this.sqlReadOnly()) return;
    await firstValueFrom(this.data.updateProjectTask(task.id, {
      status: 'Complete',
      completedAt: new Date().toISOString(),
    }));
  }

  isOverdue(task: ProjectTask): boolean {
    return !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  }
}

function loadTasksView(): 'list' | 'kanban' {
  try {
    const v = localStorage.getItem('brighten.tasksView');
    return v === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
}
