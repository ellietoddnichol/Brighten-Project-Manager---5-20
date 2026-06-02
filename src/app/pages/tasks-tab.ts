import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, ProjectTask } from '../models/types';
import { PROJECT_TASK_GROUPS } from '../models/project-controls.types';
import { DataService } from '../services/data.service';
import { ListRowComponent } from '../components/ui/list-row';
import { filterTasksBySegment, TaskFilterSegment } from '../utils/project-work.compute';
import { isManualProjectTask } from '../utils/project-task.util';

@Component({
  selector: 'app-tasks-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ListRowComponent],
  template: `
    <div class="space-y-6">
      @if (!simplified) {
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open Tasks</p><p class="text-xl font-bold text-slate-900">{{ openTasks().length }}</p></div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Overdue</p><p class="stat-value text-rose-600">{{ overdueCount() }}</p></div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Complete</p><p class="stat-value text-emerald-600">{{ completeTasks().length }}</p></div>
      </div>
      }

      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">{{ simplified ? 'Tasks' : 'Task Board' }}</h3>
          <button (click)="openNew()" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px]">add</mat-icon> Add Task
          </button>
        </div>

        @if (showForm()) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <button (click)="save()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save Task</button>
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
            <div class="px-5 py-10 text-center text-slate-400 italic">No tasks match this filter</div>
          }
        } @else {
        @for (group of groupedTasks(); track group.name) {
          <div class="border-b border-slate-100 last:border-0">
            <div class="px-5 py-3 bg-slate-50 text-xs font-bold uppercase tracking-widest text-slate-500">{{ group.name }} ({{ group.tasks.length }})</div>
            @for (task of group.tasks; track task.id) {
              <div class="px-5 py-3 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50">
                <div>
                  <div class="font-medium text-slate-900">{{ task.title }}</div>
                  <div class="text-xs text-slate-500">
                    {{ task.assignedTo || 'Unassigned' }}
                    @if (task.dueDate) { · Due {{ task.dueDate }} }
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                        [class.bg-amber-100]="task.status !== 'Complete'"
                        [class.text-amber-700]="task.status !== 'Complete'"
                        [class.bg-emerald-100]="task.status === 'Complete'"
                        [class.text-emerald-700]="task.status === 'Complete'">{{ task.status }}</span>
                  @if (task.status !== 'Complete') {
                    <button (click)="complete(task)" class="text-xs font-bold text-emerald-600 hover:underline">Done</button>
                  }
                </div>
              </div>
            } @empty {
              <div class="px-5 py-4 text-sm text-slate-400 italic">No tasks in this group</div>
            }
          </div>
        }
        }
      </div>
    </div>
  `,
})
export class TasksTabComponent {
  @Input({ required: true }) project!: Project;
  @Input() simplified = false;
  @Input() filterSegment: TaskFilterSegment = 'all';
  private data = inject(DataService);

  tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });
  projectTasks = computed(() => this.tasks().filter(t => t.projectId === this.project.id && isManualProjectTask(t)));
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
    filterTasksBySegment(this.tasks(), this.project.id, this.filterSegment),
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
  editingId: string | null = null;
  draft: Partial<ProjectTask> = this.reset();

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
    const payload = { ...this.draft, projectId: this.project.id, source: 'manual' as const };
    if (this.editingId) {
      await firstValueFrom(this.data.updateProjectTask(this.editingId, payload));
    } else {
      await firstValueFrom(this.data.createProjectTask(payload));
    }
    this.cancel();
  }

  async complete(task: ProjectTask) {
    await firstValueFrom(this.data.updateProjectTask(task.id, {
      status: 'Complete',
      completedAt: new Date().toISOString(),
    }));
  }

  isOverdue(task: ProjectTask): boolean {
    return !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  }
}
