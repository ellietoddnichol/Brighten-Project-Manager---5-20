import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { DetailDrawerComponent } from '@app/components/ui/detail-drawer';
import { DataService } from '@core/services/data.service';
import { PROJECT_TASK_GROUPS } from '@app/models/project-controls.types';
import { Project, ProjectTask } from '@app/models/types';
import { resolveProjectLabel } from '@shared/utils/project';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, PageHeaderComponent, DetailDrawerComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header title="Task Board" subtitle="Manually added tasks across active jobs."
                       primaryActionLabel="Add Task"
                       (primaryAction)="openNew()" />

      <div class="grid grid-cols-3 gap-4">
        <div class="bg-white p-4 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Open</p>
          <p class="text-2xl font-bold text-slate-900 font-numeric">{{ openTasks().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Overdue</p>
          <p class="text-2xl font-bold font-numeric" [class.text-rose-600]="overdue().length > 0" [class.text-slate-900]="overdue().length === 0">{{ overdue().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200">
          <p class="text-xs text-slate-500 mb-1">Groups</p>
          <p class="text-2xl font-bold text-slate-900 font-numeric">{{ taskGroups.length }}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th class="px-5 py-3 text-left font-medium">Task</th>
                <th class="px-5 py-3 text-left font-medium">Project</th>
                <th class="px-5 py-3 text-left font-medium">Group</th>
                <th class="px-5 py-3 text-left font-medium">Assigned</th>
                <th class="px-5 py-3 text-left font-medium">Due</th>
                <th class="px-5 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (task of openTasks(); track task.id) {
                <tr class="hover:bg-slate-50/80 cursor-pointer" (click)="openEdit(task)">
                  <td class="px-5 py-3 font-medium">
                    <a [routerLink]="['/projects', task.projectId]" [queryParams]="{ tab: 'tasks' }"
                       class="text-indigo-700 hover:underline" (click)="$event.stopPropagation()">{{ task.title }}</a>
                  </td>
                  <td class="px-5 py-3 text-slate-600">{{ projectLabel(task.projectId) }}</td>
                  <td class="px-5 py-3 text-slate-600">{{ task.taskGroup || '—' }}</td>
                  <td class="px-5 py-3 text-slate-600">{{ task.assignedTo || '—' }}</td>
                  <td class="px-5 py-3" [class.text-rose-600]="isOverdue(task)">{{ task.dueDate || '—' }}</td>
                  <td class="px-5 py-3">
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium"
                          [class.text-amber-700]="task.status !== 'Complete'"
                          [class.text-emerald-700]="task.status === 'Complete'">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0"
                            [class.bg-amber-400]="task.status !== 'Complete'"
                            [class.bg-emerald-500]="task.status === 'Complete'"></span>
                      {{ task.status }}
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-5 py-12 text-center text-slate-400 text-sm italic">
                    No open tasks — add one with <strong>Add Task</strong>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <app-detail-drawer [open]="drawerOpen()" [title]="editingId() ? 'Edit Task' : 'New Task'" (close)="closeDrawer()">
      <div class="space-y-4">
        @if (saveError()) {
          <p class="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{{ saveError() }}</p>
        }
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
          <select [(ngModel)]="draftProjectId" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">Select project…</option>
            @for (p of activeProjects(); track p.id) {
              <option [value]="p.id">{{ p.projectNumber }} · {{ p.projectName }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
          <input [(ngModel)]="draft.title" class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Group</label>
            <select [(ngModel)]="draft.taskGroup" class="w-full px-3 py-2 border rounded-lg text-sm">
              @for (g of taskGroups; track g) {
                <option [value]="g">{{ g }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Assigned to</label>
            <input [(ngModel)]="draft.assignedTo" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Due date</label>
            <input type="date" [(ngModel)]="draft.dueDate" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Priority</label>
            <select [(ngModel)]="draft.priority" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
          <select [(ngModel)]="draft.status" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Waiting">Waiting</option>
            <option value="Complete">Complete</option>
          </select>
        </div>
        <div class="flex flex-wrap gap-2 pt-2">
          <button type="button" (click)="save()" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" (click)="closeDrawer()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </app-detail-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tasks {
  private data = inject(DataService);
  projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });
  tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] as ProjectTask[] });

  readonly taskGroups = PROJECT_TASK_GROUPS;
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  draftProjectId = '';
  draft: Partial<ProjectTask> = {};

  activeProjects = computed(() =>
    [...(this.projects() ?? [])]
      .filter(p => p.status !== 'Closed')
      .sort((a, b) => String(a.projectNumber).localeCompare(String(b.projectNumber), undefined, { numeric: true })),
  );

  openTasks = computed(() =>
    this.tasks().filter(t => isManualProjectTask(t) && t.status !== 'Complete' && t.status !== 'Canceled')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')),
  );
  overdue = computed(() => this.openTasks().filter(t => this.isOverdue(t)));

  projectLabel(projectId: string): string {
    return resolveProjectLabel(this.projects(), { projectId });
  }

  isOverdue(task: { dueDate?: string }): boolean {
    return !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
  }

  openNew(): void {
    this.editingId.set(null);
    this.draft = {
      status: 'Not Started',
      priority: 'Medium',
      taskGroup: PROJECT_TASK_GROUPS[0],
      source: 'manual',
    };
    this.draftProjectId = '';
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(task: ProjectTask): void {
    this.editingId.set(task.id);
    this.draft = { ...task };
    this.draftProjectId = task.projectId;
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    const project = (this.projects() ?? []).find(p => p.id === this.draftProjectId);
    if (!project) {
      this.saveError.set('Select a project.');
      return;
    }
    if (!this.draft.title?.trim()) {
      this.saveError.set('Enter a task title.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const payload: Partial<ProjectTask> = {
        ...this.draft,
        projectId: project.id,
        source: 'manual',
      };
      if (this.editingId()) {
        await firstValueFrom(this.data.updateProjectTask(this.editingId()!, payload));
      } else {
        await firstValueFrom(this.data.createProjectTask(payload));
      }
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save task.');
    } finally {
      this.saving.set(false);
    }
  }
}
