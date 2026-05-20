import { Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ProjectIssue, ProjectTask } from '../models/types';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-issues-tasks-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="openIssues().length > 0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" [class.text-red-500]="openIssues().length > 0">Open Issues</p>
          <div class="flex items-end justify-between">
             <p class="text-xl font-bold text-slate-900" [class.text-red-600]="openIssues().length > 0">{{ openIssues().length }}</p>
             <mat-icon class="text-red-300" *ngIf="openIssues().length > 0">warning</mat-icon>
          </div>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Resolved Issues</p>
          <p class="text-xl font-bold text-emerald-600">{{ resolvedIssues().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-amber-50]="openTasks().length > 0">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" [class.text-amber-600]="openTasks().length > 0">Open Tasks</p>
          <div class="flex items-end justify-between">
             <p class="text-xl font-bold text-slate-900" [class.text-amber-700]="openTasks().length > 0">{{ openTasks().length }}</p>
             <mat-icon class="text-amber-300" *ngIf="openTasks().length > 0">checklist</mat-icon>
          </div>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Completed Tasks</p>
          <p class="text-xl font-bold text-slate-900">{{ completedTasks().length }}</p>
        </div>
      </div>

      <!-- Issues List -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Project Issues</h3>
          <button (click)="showNewIssue = true" class="bg-white border text-red-600 border-red-200 px-4 py-2 rounded-md font-bold shadow-sm hover:bg-red-50 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4 text-red-500">add</mat-icon> Log Issue
          </button>
        </div>
        
        @if (showNewIssue) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Log / Edit Issue</h4>
            </div>
             <div class="lg:col-span-2">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Issue Title</label>
               <input [(ngModel)]="newIssue.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm" placeholder="Brief description">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Category</label>
               <select [(ngModel)]="newIssue.category" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Schedule">Schedule</option>
                  <option value="Budget">Budget</option>
                  <option value="Change Order">Change Order</option>
                  <option value="Billing">Billing</option>
                  <option value="Document">Document</option>
                  <option value="Field">Field</option>
                  <option value="Safety">Safety</option>
                  <option value="Owner / GC">Owner / GC</option>
                  <option value="Internal">Internal</option>
                  <option value="Other">Other</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</label>
               <select [(ngModel)]="newIssue.priority" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newIssue.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Open">Open</option>
                  <option value="Waiting">Waiting</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due Person</label>
               <input [(ngModel)]="newIssue.responsiblePerson" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due Date</label>
               <input type="date" [(ngModel)]="newIssue.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelIssue()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveIssue()" class="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 text-sm">Save Issue</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[1000px]">
            <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Issue / Category</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Priority</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Responsible / Due</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (i of projectIssues(); track i.id) {
                <tr class="hover:bg-slate-50 transition-colors group">
                  <td class="px-6 py-4 flex flex-col">
                    <span class="font-bold text-slate-900">{{ i.title }}</span>
                    <span class="text-xs text-slate-500 font-medium">{{ i.category }}</span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                      [ngClass]="{
                        'bg-red-100 text-red-700': i.status === 'Open',
                        'bg-amber-100 text-amber-700': i.status === 'Waiting',
                        'bg-emerald-100 text-emerald-700': i.status === 'Resolved',
                        'bg-slate-100 text-slate-600': i.status === 'Closed'
                      }">
                      {{ i.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                     <span class="px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-transparent"
                      [ngClass]="{
                        'text-slate-600': i.priority === 'Low',
                        'text-blue-600': i.priority === 'Medium',
                        'text-orange-600': i.priority === 'High',
                        'bg-red-50 text-red-700 border-red-200': i.priority === 'Critical'
                      }">
                      {{ i.priority }}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                     <div class="flex flex-col text-xs text-slate-600 gap-1">
                        @if (i.responsiblePerson) { <span class="font-bold text-slate-800">{{ i.responsiblePerson }}</span> }
                        @if (i.dueDate) { <span>Due: {{ i.dueDate | date:'shortDate' }}</span> }
                     </div>
                  </td>
                  <td class="px-6 py-4 text-right space-x-2">
                     <button (click)="editIssue(i)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                        <mat-icon class="!text-[18px]">edit</mat-icon>
                     </button>
                  </td>
                </tr>
              } @empty {
                 <tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No issues logged for this project.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tasks List -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Project Tasks</h3>
          <button (click)="showNewTask = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add_task</mat-icon> Add Task
          </button>
        </div>
        
        @if (showNewTask) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Task</h4>
            </div>
             <div class="lg:col-span-2">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Task Title</label>
               <input [(ngModel)]="newTask.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newTask.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Waiting">Waiting</option>
                  <option value="Complete">Complete</option>
                  <option value="Canceled">Canceled</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</label>
               <select [(ngModel)]="newTask.priority" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Assigned To</label>
               <input [(ngModel)]="newTask.assignedTo" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Due Date</label>
               <input type="date" [(ngModel)]="newTask.dueDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelTask()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveTask()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save Task</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[900px]">
             <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Task</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Priority</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Assignment</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (t of projectTasks(); track t.id) {
                 <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4 font-bold text-slate-900" [class.line-through]="t.status === 'Complete' || t.status === 'Canceled'" [class.text-slate-400]="t.status === 'Complete' || t.status === 'Canceled'">
                       {{ t.title }}
                    </td>
                    <td class="px-6 py-4">
                       <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                        [ngClass]="{
                          'bg-slate-100 text-slate-600': t.status === 'Not Started',
                          'bg-blue-100 text-blue-700': t.status === 'In Progress' || t.status === 'Waiting',
                          'bg-emerald-100 text-emerald-700': t.status === 'Complete',
                          'bg-red-100 text-red-700': t.status === 'Canceled'
                        }">
                        {{ t.status }}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                       <span class="px-2.5 py-1 rounded text-[10px] font-bold tracking-wide border border-transparent"
                        [ngClass]="{
                          'text-slate-600': t.priority === 'Low',
                          'text-blue-600': t.priority === 'Medium',
                          'text-orange-600': t.priority === 'High',
                          'bg-red-50 text-red-700 border-red-200': t.priority === 'Critical'
                        }">
                        {{ t.priority }}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col text-xs gap-1" [class.text-slate-600]="t.status !== 'Complete'" [class.text-slate-400]="t.status === 'Complete'">
                        @if (t.assignedTo) { <span class="font-bold border-slate-800">{{ t.assignedTo }}</span> }
                        @if (t.dueDate) { <span [class.text-red-500]="isOverdue(t) && t.status !== 'Complete'">Due: {{ t.dueDate | date:'shortDate' }}</span> }
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                       <button (click)="editTask(t)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                          <mat-icon class="!text-[18px]">edit</mat-icon>
                       </button>
                    </td>
                 </tr>
              } @empty {
                 <tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No tasks listed for this project.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class IssuesTasksTabComponent {
  @Input({ required: true }) project!: Project;

  private dataService = inject(DataService);
  
  allIssues = toSignal(this.dataService.getProjectIssues(), { initialValue: [] });
  projectIssues = computed(() => (this.allIssues() || []).filter(i => i.projectId === this.project.id));
  
  allTasks = toSignal(this.dataService.getProjectTasks(), { initialValue: [] });
  projectTasks = computed(() => (this.allTasks() || []).filter(t => t.projectId === this.project.id));

  openIssues = computed(() => this.projectIssues().filter(i => i.status === 'Open' || i.status === 'Waiting'));
  resolvedIssues = computed(() => this.projectIssues().filter(i => i.status === 'Resolved' || i.status === 'Closed'));

  openTasks = computed(() => this.projectTasks().filter(t => t.status !== 'Complete' && t.status !== 'Canceled'));
  completedTasks = computed(() => this.projectTasks().filter(t => t.status === 'Complete' || t.status === 'Canceled'));

  showNewIssue = false;
  editingIssueId: string | null = null;
  newIssue: Partial<ProjectIssue> = this.resetIssue();

  showNewTask = false;
  editingTaskId: string | null = null;
  newTask: Partial<ProjectTask> = this.resetTask();

  isOverdue(task: ProjectTask): boolean {
    if (!task.dueDate) return false;
    return new Date(task.dueDate) < new Date();
  }

  resetIssue(): Partial<ProjectIssue> {
    return { title: '', category: 'Document', status: 'Open', priority: 'Medium' };
  }

  editIssue(i: ProjectIssue) {
    this.editingIssueId = i.id;
    this.newIssue = { ...i };
    this.showNewIssue = true;
  }

  cancelIssue() {
    this.editingIssueId = null;
    this.newIssue = this.resetIssue();
    this.showNewIssue = false;
  }

  saveIssue() {
    if (!this.newIssue.title) return;
    this.newIssue.projectId = this.project.id;
    if (this.editingIssueId) {
      this.dataService.updateProjectIssue(this.editingIssueId, this.newIssue).subscribe(() => this.cancelIssue());
    } else {
      this.dataService.createProjectIssue(this.newIssue).subscribe(() => this.cancelIssue());
    }
  }

  resetTask(): Partial<ProjectTask> {
    return { title: '', status: 'Not Started', priority: 'Medium' };
  }

  editTask(t: ProjectTask) {
    this.editingTaskId = t.id;
    this.newTask = { ...t };
    this.showNewTask = true;
  }

  cancelTask() {
    this.editingTaskId = null;
    this.newTask = this.resetTask();
    this.showNewTask = false;
  }

  saveTask() {
    if (!this.newTask.title) return;
    this.newTask.projectId = this.project.id;
    if (this.editingTaskId) {
      this.dataService.updateProjectTask(this.editingTaskId, this.newTask).subscribe(() => this.cancelTask());
    } else {
      this.dataService.createProjectTask(this.newTask).subscribe(() => this.cancelTask());
    }
  }
}
