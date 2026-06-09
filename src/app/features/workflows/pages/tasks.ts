import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { DataService } from '@core/services/data.service';
import { PROJECT_TASK_GROUPS } from '@app/models/project-controls.types';
import { resolveProjectLabel } from '@shared/utils/project';
import { isManualProjectTask } from '@features/projects/utils/project-task.util';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PageHeaderComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto">
      <app-page-header title="Task Board" subtitle="Manually added tasks across active jobs." />

      <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div class="bg-white p-4 rounded-xl border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open</p><p class="text-2xl font-black text-slate-900">{{ openTasks().length }}</p></div>
        <div class="bg-white p-4 rounded-xl border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Overdue</p><p class="stat-value text-rose-600">{{ overdue().length }}</p></div>
        <div class="bg-white p-4 rounded-xl border border-slate-200"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Groups</p><p class="text-2xl font-black text-slate-900">{{ taskGroups.length }}</p></div>
      </div>

      <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
              <th class="px-5 py-3 text-left">Task</th><th class="px-5 py-3 text-left">Project</th>
              <th class="px-5 py-3 text-left">Group</th><th class="px-5 py-3 text-left">Assigned</th>
              <th class="px-5 py-3 text-left">Due</th><th class="px-5 py-3 text-left">Status</th>
            </tr></thead>
            <tbody class="divide-y divide-slate-100">
              @for (task of openTasks(); track task.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 font-medium">
                    <a [routerLink]="['/projects', task.projectId]" [queryParams]="{ tab: 'tasks' }" class="text-blue-600 hover:underline">{{ task.title }}</a>
                  </td>
                  <td class="px-5 py-3">{{ projectLabel(task.projectId) }}</td>
                  <td class="px-5 py-3 text-slate-600">{{ task.taskGroup || '—' }}</td>
                  <td class="px-5 py-3">{{ task.assignedTo || '—' }}</td>
                  <td class="px-5 py-3" [class.text-rose-600]="isOverdue(task)">{{ task.dueDate || '—' }}</td>
                  <td class="px-5 py-3">{{ task.status }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="px-5 py-12 text-center text-slate-400 italic">No open tasks</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tasks {
  private data = inject(DataService);
  projects = toSignal(this.data.getProjects(), { initialValue: [] });
  tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });

  readonly taskGroups = PROJECT_TASK_GROUPS;

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
}
