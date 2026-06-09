import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, ProjectTask } from '@app/models/types';
import { PROJECT_TASK_GROUPS } from '@app/models/project-controls.types';
import { DataService } from '@core/services/data.service';
import { ListRowComponent } from '@app/components/ui/list-row';
import { filterTasksBySegment, TaskFilterSegment } from '@features/projects/utils/project-work.compute';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

@Component({
  selector: 'app-tasks-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, ListRowComponent],
  template: `
    <div class="space-y-4">
      @if (!simplified) {
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Open tasks</p>
          <p class="text-2xl font-bold text-slate-900 font-numeric">{{ openTasks().length }}</p>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Overdue</p>
          <p class="text-2xl font-bold font-numeric" [class.text-rose-600]="overdueCount() > 0" [class.text-slate-900]="overdueCount() === 0">{{ overdueCount() }}</p>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Complete</p>
          <p class="text-2xl font-bold text-emerald-600 font-numeric">{{ completeTasks().length }}</p>
        </div>
      </div>
      }

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 class="text-sm font-semibold text-slate-900">{{ simplified ? 'Tasks' : 'Task Board' }}</h3>
          <button (click)="openNew()"
                  class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-800 transition-colors">
            <mat-icon class="!text-[16px]">add</mat-icon> Add Task
          </button>
        </div>

        @if (saveError()) {
          <div class="mx-4 mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            {{ saveError() }}
          </div>
        }

        @if (showForm()) {
          <div class="p-4 border-b border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-slate-600 mb-1">Title</label>
              <input [(ngModel)]="draft.title" placeholder="Task title"
                     class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Group</label>
              <select [(ngModel)]="draft.taskGroup"
                      class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                @for (g of taskGroups; track g) { <option [value]="g">{{ g }}</option> }
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Assigned To</label>
              <input [(ngModel)]="draft.assignedTo" placeholder="Name"
                     class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input type="date" [(ngModel)]="draft.dueDate"
                     class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Priority</label>
              <select [(ngModel)]="draft.priority"
                      class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select [(ngModel)]="draft.status"
                      class="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Waiting">Waiting</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
            <div class="col-span-full flex justify-end gap-2">
              <button (click)="cancel()"
                      class="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button (click)="save()" [disabled]="saving()"
                      class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {{ saving() ? 'Saving…' : 'Save Task' }}
              </button>
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
            <div class="px-4 py-6 text-center text-slate-400 text-sm italic">No tasks match this filter</div>
          }
        } @else {
          @for (group of groupedTasks(); track group.name) {
            <div class="border-b border-slate-100 last:border-0">
              <div class="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500">
                {{ group.name }} <span class="text-slate-400">({{ group.tasks.length }})</span>
              </div>
              @for (task of group.tasks; track task.id) {
                <div class="px-4 py-3 flex items-center justify-between hover:bg-slate-50/80 border-b border-slate-50 last:border-0">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-slate-900">{{ task.title }}</div>
                    <div class="text-xs text-slate-500 mt-0.5">
                      {{ task.assignedTo || 'Unassigned' }}
                      @if (task.dueDate) {
                        · Due <span [class.text-rose-600]="isOverdue(task)">{{ task.dueDate }}</span>
                      }
                    </div>
                  </div>
                  <div class="flex items-center gap-3 ml-3 shrink-0">
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium"
                          [class.text-amber-700]="task.status !== 'Complete'"
                          [class.text-emerald-700]="task.status === 'Complete'">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0"
                            [class.bg-amber-400]="task.status !== 'Complete'"
                            [class.bg-emerald-500]="task.status === 'Complete'"></span>
                      {{ task.status }}
                    </span>
                    @if (task.status !== 'Complete') {
                      <button (click)="complete(task)"
                              class="text-xs font-semibold text-slate-500 hover:text-emerald-700 transition-colors px-2 py-1 rounded hover:bg-emerald-50">
                        Done
                      </button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="px-4 py-3 text-sm text-slate-400 italic">No tasks in this group</div>
              }
            </div>
          }
          @if (groupedTasks().length === 0 && !showForm()) {
            <div class="px-4 py-10 text-center text-slate-400 text-sm italic">No open tasks — add one above</div>
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
  saving = signal(false);
  saveError = signal<string | null>(null);
  editingId: string | null = null;
  draft: Partial<ProjectTask> = this.reset();

  reset(): Partial<ProjectTask> {
    return { status: 'Not Started', priority: 'Medium', taskGroup: 'Field Operations', source: 'manual' };
  }

  openNew() {
    this.draft = { ...this.reset(), projectId: this.project.id };
    this.editingId = null;
    this.saveError.set(null);
    this.showForm.set(true);
  }

  cancel() {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  async save() {
    if (!this.draft.title?.trim()) {
      this.saveError.set('Task title is required.');
      return;
    }
    const payload = { ...this.draft, projectId: this.project.id, source: 'manual' as const };
    this.saving.set(true);
    this.saveError.set(null);
    try {
      if (this.editingId) {
        await firstValueFrom(this.data.updateProjectTask(this.editingId, payload));
      } else {
        await firstValueFrom(this.data.createProjectTask(payload));
      }
      this.cancel();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Failed to save task. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async complete(task: ProjectTask) {
    try {
      await firstValueFrom(this.data.updateProjectTask(task.id, {
        status: 'Complete',
        completedAt: new Date().toISOString(),
      }));
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Failed to update task.');
    }
  }

  isOverdue(task: ProjectTask): boolean {
    return !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  }
}
