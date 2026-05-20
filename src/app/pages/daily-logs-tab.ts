import { Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, DailyLog } from '../models/types';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { getDaysSinceLastDailyLog } from '../utils/field';

@Component({
  selector: 'app-daily-logs-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Header stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Logs</p>
          <p class="text-xl font-bold text-slate-900">{{ projectLogs().length }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="daysSinceLastLog() > 3">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" [class.text-red-500]="daysSinceLastLog() > 3">Days Since Last Log</p>
          <div class="flex items-end justify-between">
             <p class="text-xl font-bold text-slate-900" [class.text-red-600]="daysSinceLastLog() > 3">{{ daysSinceLastLog() === 999 ? 'N/A' : daysSinceLastLog() }}</p>
             <mat-icon class="text-red-300" *ngIf="daysSinceLastLog() > 3">warning</mat-icon>
          </div>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Safety Issues</p>
          <p class="text-xl font-bold text-slate-900">{{ logsWithSafety() }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Delays Reported</p>
          <p class="text-xl font-bold text-slate-900">{{ logsWithDelay() }}</p>
        </div>
      </div>

      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Daily Logs</h3>
          <button (click)="showNewLog = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> New Daily Log
          </button>
        </div>

        @if (showNewLog) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-4">
             <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Daily Log</h4>
             </div>
             
             <!-- Basic required/core fields -->
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Log Date</label>
               <input type="date" [(ngModel)]="newLog.logDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Foreman / Supervisor</label>
               <input [(ngModel)]="newLog.foreman" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Workers Onsite</label>
               <input type="number" [(ngModel)]="newLog.workersOnsite" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Labor Hours</label>
               <input type="number" [(ngModel)]="newLog.totalLaborHours" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-full">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Work Performed</label>
               <textarea [(ngModel)]="newLog.workPerformed" rows="3" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm"></textarea>
             </div>

             <!-- Optional / Expanded fields -->
             <div class="col-span-full">
               <button (click)="expandOptional = !expandOptional" class="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1">
                 <mat-icon class="!text-[16px] w-4 h-4">{{ expandOptional ? 'expand_less' : 'expand_more' }}</mat-icon>
                 {{ expandOptional ? 'Hide Optional Fields' : 'Show Optional Fields' }}
               </button>
             </div>
             
             @if (expandOptional) {
               <div class="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                 <div>
                   <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Weather Summary</label>
                   <input [(ngModel)]="newLog.weatherSummary" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                 </div>
                 <div>
                   <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Materials Delivered</label>
                   <input [(ngModel)]="newLog.materialsDelivered" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                 </div>
                 <div>
                   <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Equipment Used</label>
                   <input [(ngModel)]="newLog.equipmentUsed" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                 </div>
                 <div>
                   <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Inspections / Visitors</label>
                   <input [(ngModel)]="newLog.inspections" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                 </div>
               </div>
             }

             <!-- Flags -->
             <div class="col-span-full border-t border-slate-200 pt-4 mt-2 flex flex-wrap gap-4">
                <label class="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" [(ngModel)]="newLog.safetyIssues" class="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900">
                  Safety Issue Check
                </label>
                <label class="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" [(ngModel)]="newLog.delays" class="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900">
                  Delay Encountered
                </label>
                <label class="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" [(ngModel)]="newLog.potentialChangeOrder" class="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900">
                  Potential Change Order
                </label>
             </div>
             
             @if (newLog.delays) {
               <div class="col-span-full">
                 <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Delay Reason</label>
                 <input [(ngModel)]="newLog.delayReason" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
               </div>
             }

             <div class="col-span-full flex justify-end gap-2 mt-4">
                <button (click)="cancelLog()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveLog()" class="bg-slate-900 text-white px-4 py-2 rounded font-bold hover:bg-slate-800 text-sm">Save Log</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[800px]">
             <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Date / Foreman</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Work Summary</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Labor Stats</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Flags</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (log of projectLogs(); track log.id) {
                 <tr class="hover:bg-slate-50 transition-colors group">
                    <td class="px-6 py-4">
                      <div class="font-bold text-slate-900">{{ log.logDate | date:'shortDate' }}</div>
                      <div class="text-xs text-slate-500">{{ log.foreman || 'Unknown Foreman' }}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-700 w-1/3 whitespace-normal align-top">
                       {{ (log.workPerformed || 'No work decription provided.') | slice:0:100 }}{{ log.workPerformed?.length! > 100 ? '...' : '' }}
                    </td>
                    <td class="px-6 py-4 text-slate-600 text-xs gap-1 flex flex-col">
                      <span>{{ log.workersOnsite || 0 }} workers</span>
                      <span>{{ log.totalLaborHours || 0 }} total hrs</span>
                    </td>
                    <td class="px-6 py-4 space-x-1 flex flex-wrap gap-1">
                      @if (log.safetyIssues) { 
                        <button (click)="createAction('Issue', log, 'Safety')" class="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] rounded uppercase font-bold tracking-wider hover:bg-red-200 transition-colors flex items-center gap-1 group/btn cursor-pointer">
                          Safety <mat-icon class="!text-[12px] opacity-0 group-hover/btn:opacity-100 transition-opacity w-3 h-3">add_circle</mat-icon>
                        </button>
                      }
                      @if (log.delays) {
                        <button (click)="createAction('Task', log, 'Delay')" class="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded uppercase font-bold tracking-wider hover:bg-amber-200 transition-colors flex items-center gap-1 group/btn cursor-pointer">
                          Delay <mat-icon class="!text-[12px] opacity-0 group-hover/btn:opacity-100 transition-opacity w-3 h-3">add_circle</mat-icon>
                        </button>
                      }
                      @if (log.potentialChangeOrder) { 
                        <button (click)="createAction('CO', log, 'PCO')" class="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded uppercase font-bold tracking-wider hover:bg-blue-200 transition-colors flex items-center gap-1 group/btn cursor-pointer">
                          PCO <mat-icon class="!text-[12px] opacity-0 group-hover/btn:opacity-100 transition-opacity w-3 h-3">add_circle</mat-icon>
                        </button>
                      }
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                       <button (click)="editLog(log)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                          <mat-icon class="!text-[18px]">edit</mat-icon>
                       </button>
                    </td>
                 </tr>
              } @empty {
                 <tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No daily logs created.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class DailyLogsTabComponent {
  @Input({ required: true }) project!: Project;

  private dataService = inject(DataService);
  
  allLogs = toSignal(this.dataService.getDailyLogs(), { initialValue: [] });
  projectLogs = computed(() => (this.allLogs() || [])
    .filter(l => l.projectId === this.project.id)
    .sort((a,b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
  );
  
  daysSinceLastLog = computed(() => getDaysSinceLastDailyLog(this.project.id, this.projectLogs()));
  logsWithSafety = computed(() => this.projectLogs().filter(l => l.safetyIssues).length);
  logsWithDelay = computed(() => this.projectLogs().filter(l => l.delays).length);

  showNewLog = false;
  expandOptional = false;
  editingLogId: string | null = null;
  newLog: Partial<DailyLog> = this.resetLog();

  resetLog(): Partial<DailyLog> {
    return { logDate: new Date().toISOString().split('T')[0], foreman: '', workersOnsite: 0, totalLaborHours: 0, workPerformed: '', status: 'Draft' };
  }

  editLog(l: DailyLog) {
    this.editingLogId = l.id;
    this.newLog = { ...l };
    this.showNewLog = true;
  }

  cancelLog() {
    this.editingLogId = null;
    this.newLog = this.resetLog();
    this.showNewLog = false;
    this.expandOptional = false;
  }

  saveLog() {
    if (!this.newLog.logDate) return;
    this.newLog.projectId = this.project.id;
    if (this.editingLogId) {
      this.dataService.updateDailyLog(this.editingLogId, this.newLog).subscribe(() => this.cancelLog());
    } else {
      this.dataService.createDailyLog(this.newLog).subscribe(() => this.cancelLog());
    }
  }

  createAction(actionType: string, log: DailyLog, context: string) {
    if (confirm(`Create a linked ${actionType} from this ${context}?`)) {
      if (actionType === 'Issue') {
         this.dataService.createProjectIssue({
           title: `Safety Issue from ${log.logDate}`,
           description: log.notes || 'Please review safety incident.',
           status: 'Open',
           priority: 'High',
           category: 'Safety',
           relatedRecordType: 'DailyLog',
           relatedRecordId: log.id,
           projectId: log.projectId
         }).subscribe(() => alert('Safety Issue created and linked! Check Issues tab.'));
      } else if (actionType === 'Task') {
         this.dataService.createProjectTask({
           title: `Follow-up Delay on ${log.logDate}`,
           description: `Delay Reason: ${log.delayReason}`,
           status: 'Not Started',
           priority: 'High',
           relatedRecordType: 'DailyLog',
           relatedRecordId: log.id,
           projectId: log.projectId
         }).subscribe(() => alert('Task created and linked! Check Tasks tab.'));
      } else if (actionType === 'CO') {
         this.dataService.createChangeOrder({
           coNumber: 'PCO-' + log.logDate,
           title: `Potential CO identified on ${log.logDate}`,
           description: log.notes || 'Identified in field.',
           status: 'Draft',
           type: 'Field Revision',
           projectId: log.projectId
         }).subscribe(() => alert('Draft CO created! Check Change Orders tab.'));
      }
    }
  }
}
