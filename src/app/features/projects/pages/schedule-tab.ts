import { Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ScheduleMilestone } from '@app/models/types';
import { DataService } from '@core/services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { getNextMilestone, getOverdueMilestones, getUpcomingMilestones } from '@shared/utils/field';

@Component({
  selector: 'app-schedule-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Milestones</p>
          <p class="text-xl font-bold text-slate-900">{{ projectMilestones().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="overdueMilestones().length > 0">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [class.text-red-500]="overdueMilestones().length > 0" [class.text-slate-500]="overdueMilestones().length === 0">Overdue</p>
          <div class="flex items-end justify-between">
             <p class="text-xl font-bold" [class.text-red-600]="overdueMilestones().length > 0" [class.text-slate-900]="overdueMilestones().length === 0">{{ overdueMilestones().length }}</p>
             <mat-icon class="text-red-300" *ngIf="overdueMilestones().length > 0">warning</mat-icon>
          </div>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Due Next 7 Days</p>
          <p class="text-xl font-bold text-slate-900">{{ upcomingMilestones().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Next Milestone</p>
          <p class="text-sm font-bold text-slate-900 truncate mt-1">{{ nextMilestone()?.title || 'None' }}</p>
        </div>
      </div>

      <!-- List -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Schedule Milestones</h3>
          <button (click)="showNewMS = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> Add Milestone
          </button>
        </div>

        @if (showNewMS) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
             <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Milestone</h4>
             </div>
             
             <div class="lg:col-span-2">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Milestone Title</label>
               <input [(ngModel)]="newMS.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm" placeholder="e.g. Drywall Complete">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newMS.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Upcoming">Upcoming</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Delayed">Delayed</option>
                  <option value="Complete">Complete</option>
                  <option value="Canceled">Canceled</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Responsible Person</label>
               <input [(ngModel)]="newMS.responsiblePerson" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Planned Start</label>
               <input type="date" [(ngModel)]="newMS.plannedStartDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Planned End (Due)</label>
               <input type="date" [(ngModel)]="newMS.plannedEndDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-2">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</label>
               <input [(ngModel)]="newMS.notes" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>

             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelMS()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveMS()" class="bg-indigo-600 text-white px-4 py-2 rounded font-bold hover:bg-indigo-700 text-sm">Save Milestone</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
             <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Milestone</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Dates</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (m of sortedMilestones(); track m.id) {
                 <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4">
                      <div class="font-bold text-slate-900" [class.text-slate-400]="m.status === 'Complete' || m.status === 'Canceled'" [class.line-through]="m.status === 'Complete' || m.status === 'Canceled'">{{ m.title }}</div>
                      <div class="text-xs text-slate-500">{{ m.responsiblePerson || 'Unassigned' }}</div>
                    </td>
                    <td class="px-6 py-4">
                       <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                        [ngClass]="{
                          'bg-slate-100 text-slate-700': m.status === 'Upcoming' || m.status === 'Not Started',
                          'bg-blue-100 text-blue-700': m.status === 'In Progress',
                          'bg-red-100 text-red-700': m.status === 'Delayed',
                          'bg-emerald-100 text-emerald-700': m.status === 'Complete',
                          'bg-slate-50 text-slate-400': m.status === 'Canceled'
                        }">
                        {{ m.status }}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-slate-600 text-xs gap-1 flex flex-col">
                      @if (m.plannedStartDate) { <span>Start: {{ m.plannedStartDate | date:'shortDate' }}</span> }
                      @if (m.plannedEndDate) { <span [class.text-red-500]="isOverdue(m) && m.status !== 'Complete'">End: {{ m.plannedEndDate | date:'shortDate' }}</span> }
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                       @if (m.status !== 'Complete') {
                         <button (click)="markComplete(m)" class="text-emerald-500 hover:text-emerald-700 transition-colors opacity-0 group-hover:opacity-100 mr-2 font-medium text-xs">
                           MARK COMPLETE
                         </button>
                       }
                       <button (click)="editMS(m)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                          <mat-icon class="!text-[18px]">edit</mat-icon>
                       </button>
                    </td>
                 </tr>
              } @empty {
                 <tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No milestones defined.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class ScheduleTabComponent {
  @Input({ required: true }) project!: Project;

  private dataService = inject(DataService);
  
  allMS = toSignal(this.dataService.getMilestones(), { initialValue: [] });
  projectMilestones = computed(() => (this.allMS() || []).filter(m => m.projectId === this.project.id));
  
  overdueMilestones = computed(() => getOverdueMilestones(this.project.id, this.projectMilestones()));
  upcomingMilestones = computed(() => getUpcomingMilestones(this.project.id, this.projectMilestones()));
  nextMilestone = computed(() => getNextMilestone(this.project.id, this.projectMilestones()));

  sortedMilestones = computed(() => {
     return [...this.projectMilestones()].sort((a,b) => {
        const da = a.plannedEndDate ? new Date(a.plannedEndDate).getTime() : 9999999999999;
        const db = b.plannedEndDate ? new Date(b.plannedEndDate).getTime() : 9999999999999;
        return da - db;
     });
  });

  showNewMS = false;
  editingMSId: string | null = null;
  newMS: Partial<ScheduleMilestone> = this.resetMS();

  isOverdue(m: ScheduleMilestone): boolean {
    if (!m.plannedEndDate) return false;
    return new Date(m.plannedEndDate) < new Date();
  }

  resetMS(): Partial<ScheduleMilestone> {
    return { title: '', status: 'Upcoming', milestoneType: 'General' };
  }

  editMS(m: ScheduleMilestone) {
    this.editingMSId = m.id;
    this.newMS = { ...m };
    this.showNewMS = true;
  }

  cancelMS() {
    this.editingMSId = null;
    this.newMS = this.resetMS();
    this.showNewMS = false;
  }

  markComplete(m: ScheduleMilestone) {
     this.dataService.updateMilestone(m.id, { status: 'Complete', actualEndDate: new Date().toISOString().split('T')[0] }).subscribe();
  }

  saveMS() {
    if (!this.newMS.title) return;
    this.newMS.projectId = this.project.id;
    if (this.editingMSId) {
      this.dataService.updateMilestone(this.editingMSId, this.newMS).subscribe(() => this.cancelMS());
    } else {
      this.dataService.createMilestone(this.newMS).subscribe(() => this.cancelMS());
    }
  }
}
