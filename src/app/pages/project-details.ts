import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { PO } from '../models/types';
import { DriveService, DriveFile } from '../services/drive.service';
import { getProjectFinancialSummary, getProjectExceptions } from '../utils/financial';
import { BudgetTabComponent } from './budget-tab';
import { CoTabComponent } from './co-tab';
import { BillingTabComponent } from './billing-tab';
import { DocumentsTabComponent } from './documents-tab';
import { IssuesTasksTabComponent } from './issues-tasks-tab';
import { DailyLogsTabComponent } from './daily-logs-tab';
import { ScheduleTabComponent } from './schedule-tab';
import { getNextMilestone, getDaysSinceLastDailyLog, buildProjectActivityFeed } from '../utils/field';

@Component({
  selector: 'app-project-details',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule, FormsModule, BudgetTabComponent, CoTabComponent, BillingTabComponent, DocumentsTabComponent, IssuesTasksTabComponent, DailyLogsTabComponent, ScheduleTabComponent],
  template: `
    <div class="h-full flex flex-col">
      <header class="bg-white border-b border-slate-200 px-6 py-4 flex flex-col gap-4">
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <a routerLink="/projects" class="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest"><mat-icon class="!text-[14px] w-[14px] h-[14px]">arrow_back</mat-icon> Back</a>
              <span class="text-slate-300">/</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">#{{ project()?.projectNumber || '...' }}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200 ml-2">{{ project()?.status }}</span>
            </div>
            <h1 class="text-2xl font-bold text-slate-900">{{ project()?.projectName || 'Project Details' }}</h1>
          </div>
          <div class="flex gap-2">
            @if (project()?.driveFolderUrl || project()?.driveFolderId) {
              <a [href]="project()?.driveFolderUrl" target="_blank" class="bg-blue-50 text-blue-700 px-3 py-2 rounded-md font-bold hover:bg-blue-100 transition-all text-sm flex items-center gap-2">
                <mat-icon class="!text-[18px]">folder_shared</mat-icon> Drive
              </a>
            }
            <button class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px] w-4 h-4">edit</mat-icon> Edit
            </button>
          </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-9 gap-4 bg-slate-50 border border-slate-200 p-4 rounded-lg items-center divide-x divide-slate-200">
          <div class="px-2 flex flex-col justify-center">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Orig Contract</span>
            <span class="font-bold text-slate-900 text-sm whitespace-nowrap">{{ financialSummary().originalContract | currency }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Rev Contract</span>
            <span class="font-bold text-slate-900 text-sm whitespace-nowrap">{{ financialSummary().revisedContract | currency }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-0.5">Billed</span>
            <span class="font-bold text-indigo-700 text-sm whitespace-nowrap">{{ financialSummary().billedToDate | currency }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-0.5">Left to Bill</span>
            <span class="font-bold text-amber-700 text-sm whitespace-nowrap">{{ financialSummary().leftToBill | currency }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Actual Cost</span>
            <span class="font-bold text-red-700 text-sm whitespace-nowrap">{{ financialSummary().actualCost | currency }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l relative">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Left in Budget</span>
            <span class="font-bold text-sm whitespace-nowrap" [class.text-slate-900]="financialSummary().leftInBudget >= 0" [class.text-red-600]="financialSummary().leftInBudget < 0">
              {{ financialSummary().leftInBudget | currency }}
            </span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Open COs</span>
            <span class="font-bold text-orange-600 text-sm whitespace-nowrap">{{ projectCOs().length }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Next Milestone</span>
            <span class="font-bold text-slate-900 text-sm whitespace-nowrap truncate">{{ nextMilestone()?.title || 'TBD' }}</span>
          </div>
          <div class="px-4 flex flex-col justify-center border-l" [class.bg-red-50]="missingDocsCount() > 0">
            <span class="text-[10px] font-bold uppercase tracking-wider mb-0.5" [class.text-red-500]="missingDocsCount() > 0" [class.text-slate-500]="missingDocsCount() === 0">Missing Docs</span>
            <span class="font-bold text-sm whitespace-nowrap" [class.text-red-700]="missingDocsCount() > 0" [class.text-slate-900]="missingDocsCount() === 0">{{ missingDocsCount() }}</span>
          </div>
        </div>
      </header>

      <nav class="bg-white border-b border-slate-200 px-8 flex overflow-x-auto gap-6 shrink-0">
        @for (tab of tabs; track tab.id) {
          <button (click)="activeTab.set(tab.id)"
                  [class.text-orange-600]="activeTab() === tab.id"
                  [class.border-orange-600]="activeTab() === tab.id"
                  [class.text-slate-500]="activeTab() !== tab.id"
                  [class.border-transparent]="activeTab() !== tab.id"
                  class="whitespace-nowrap py-4 px-1 border-b-2 font-bold text-sm tracking-wide transition-colors flex items-center gap-2">
            <mat-icon class="!text-[18px] w-[18px] h-[18px]">{{ tab.icon }}</mat-icon>
            {{ tab.label }}
          </button>
        }
      </nav>

      <div class="flex-1 overflow-y-auto p-8">
        @if (activeTab() === 'overview') {
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Feed/Action Items -->
            <div class="lg:col-span-2 space-y-6">
              <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
                <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 class="text-sm font-bold text-slate-900">Action Items & Missing Info</h3>
                  @if (projectExceptions().length > 0) {
                    <span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{{ projectExceptions().length }} OPEN</span>
                  }
                </div>
                <div class="p-0">
                   @for (ex of projectExceptions(); track ex.id) {
                     <div class="p-4 border-b border-slate-100 flex gap-4 hover:bg-slate-50 transition-colors cursor-pointer">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                             [ngClass]="ex.severity === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'">
                          <mat-icon class="!text-[18px]">error_outline</mat-icon>
                        </div>
                        <div>
                          <h4 class="font-bold text-sm text-slate-900">{{ ex.title }}</h4>
                          <p class="text-xs text-slate-500 mt-0.5">{{ ex.description }}</p>
                        </div>
                     </div>
                   } @empty {
                     <div class="p-8 text-center flex flex-col items-center justify-center">
                       <div class="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
                         <mat-icon class="!text-[20px]">check</mat-icon>
                       </div>
                       <p class="text-sm font-medium text-slate-600">All caught up! No action items.</p>
                     </div>
                   }
                </div>
              </div>
              
              <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
                <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                  <h3 class="text-sm font-bold text-slate-900">Recent Activity Feed</h3>
                </div>
                <div class="p-5 pb-2 border-l-2 border-slate-200 ml-5 space-y-6">
                  @for (item of activityFeed().slice(0, 5); track item.id) {
                    <div class="relative">
                      <div class="absolute -left-[27px] w-6 h-6 rounded-full flex items-center justify-center border"
                           [ngClass]="{
                             'bg-slate-100 border-slate-300 text-slate-500': item.activityType === 'Daily Log',
                             'bg-orange-100 border-orange-300 text-orange-600': item.activityType === 'Change Order Updated',
                             'bg-emerald-100 border-emerald-300 text-emerald-600': item.activityType === 'Task Completed',
                             'bg-blue-100 border-blue-300 text-blue-600': item.activityType === 'File Added',
                             'bg-amber-100 border-amber-300 text-amber-600': item.activityType === 'Billing Updated' || item.activityType === 'Issue Created' || item.activityType === 'Milestone Updated' || item.activityType === 'Document Status Updated'
                           }">
                         <mat-icon class="!text-[12px]">
                           {{ item.activityType === 'Daily Log' ? 'history_edu' : '' }}
                           {{ item.activityType === 'Change Order Updated' ? 'sync_alt' : '' }}
                           {{ item.activityType === 'Task Completed' ? 'check_circle' : '' }}
                           {{ item.activityType === 'File Added' ? 'description' : '' }}
                           {{ item.activityType === 'Billing Updated' ? 'request_quote' : '' }}
                           {{ item.activityType === 'Issue Created' ? 'error_outline' : '' }}
                           {{ item.activityType === 'Milestone Updated' ? 'calendar_month' : '' }}
                           {{ item.activityType === 'Document Status Updated' ? 'task' : '' }}
                         </mat-icon>
                      </div>
                      <p class="text-xs text-slate-400 font-medium mb-1">{{ item.createdAt | date:'short' }}</p>
                      <p class="text-sm font-medium text-slate-900">{{ item.title }}</p>
                      <p class="text-xs text-slate-500 mt-0.5">{{ item.description }}</p>
                    </div>
                  } @empty {
                    <div class="text-sm text-slate-400 italic">No activity recorded yet.</div>
                  }
                </div>
              </div>

            </div>

            <!-- Side Widgets -->
            <div class="space-y-6">
              <div class="bg-white rounded-md shadow-sm border border-slate-200 p-5">
                <div class="flex justify-between items-center mb-4">
                   <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Photos</h3>
                   <button (click)="activeTab.set('files')" class="text-xs font-bold text-blue-600 hover:underline">View All</button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                   @for (p of recentPhotos(); track p.id) {
                     <a [href]="p.fileUrl" target="_blank" class="block aspect-square bg-slate-100 rounded overflow-hidden relative group">
                        @if (p.fileUrl) {
                          <img [src]="p.fileUrl" class="w-full h-full object-cover">
                        } @else {
                          <div class="w-full h-full flex items-center justify-center"><mat-icon class="text-slate-300">image</mat-icon></div>
                        }
                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 cursor-pointer">
                           <p class="text-[10px] font-bold text-white truncate">{{ p.fileName }}</p>
                           <p class="text-[9px] text-slate-300">{{ p.uploadedAt?.toDate() | date:'shortDate' }}</p>
                        </div>
                     </a>
                   } @empty {
                     <div class="col-span-2 py-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded">
                        <mat-icon class="text-slate-300 !text-[24px] w-6 h-6 mb-1">add_a_photo</mat-icon>
                        <p class="text-xs text-slate-500 font-medium tracking-wide">No photos added</p>
                     </div>
                   }
                </div>
              </div>

              <!-- Quick Links -->
              <div class="bg-white rounded-md shadow-sm border border-slate-200 p-5">
                <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick Links</h3>
                <div class="space-y-2">
                  @if (project()?.driveFolderUrl || project()?.driveFolderId) {
                    <a [href]="project()?.driveFolderUrl" target="_blank" class="flex items-center gap-3 p-2 rounded hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium">
                      <mat-icon class="text-blue-500">folder_shared</mat-icon> Project Drive Folder
                    </a>
                  }
                  @if (project()?.googleSheetUrl || project()?.googleSheetId) {
                    <a [href]="project()?.googleSheetUrl" target="_blank" class="flex items-center gap-3 p-2 rounded hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium">
                      <mat-icon class="text-emerald-500">table_chart</mat-icon> Google Sheet Budget
                    </a>
                  } @else {
                    <button (click)="activeTab.set('setup')" class="w-full text-left flex items-center gap-3 p-2 rounded hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium">
                      <mat-icon class="text-slate-400">add_link</mat-icon> Link Budget Sheet
                    </button>
                  }
                  @if (project()?.address) {
                    <a [href]="'https://www.google.com/maps/search/?api=1&query=' + project()?.address" target="_blank" class="flex items-center gap-3 p-2 rounded hover:bg-slate-50 text-slate-700 transition-colors text-sm font-medium">
                      <mat-icon class="text-orange-500">map</mat-icon> Map Directions
                    </a>
                  }
                </div>
              </div>

              <!-- Key Contacts -->
              <div class="bg-white rounded-md shadow-sm border border-slate-200 p-5">
                <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Key Contacts</h3>
                <div class="space-y-4">
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">PM</div>
                    <div>
                      <p class="text-sm font-bold text-slate-900">{{ project()?.projectManager || 'Unassigned' }}</p>
                      <p class="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Project Manager</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">SUP</div>
                    <div>
                      <p class="text-sm font-bold text-slate-900">{{ project()?.superintendent || 'Unassigned' }}</p>
                      <p class="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Superintendent</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
        @if (activeTab() === 'setup') {
          <div class="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Setup Tab Content -->
            <div class="bg-white p-6 rounded-md shadow-sm border border-slate-200">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Core Details</h3>
                <button class="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded text-xs font-bold transition-colors">Edit</button>
              </div>
              <dl class="space-y-4 text-sm">
                <div>
                  <dt class="text-slate-500 font-medium">Customer</dt>
                  <dd class="font-bold text-slate-900">{{ project()?.customer }}</dd>
                </div>
                <div>
                  <dt class="text-slate-500 font-medium">Site Address</dt>
                  <dd class="font-bold text-slate-900">{{ project()?.address || 'N/A' }}</dd>
                </div>
                <div>
                  <dt class="text-slate-500 font-medium">Project Manager</dt>
                  <dd class="font-bold text-slate-900">{{ project()?.projectManager || 'Unassigned' }}</dd>
                </div>
              </dl>
            </div>
            
            <div class="bg-white p-6 rounded-md shadow-sm border border-slate-200">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Billing & Contract</h3>
                <button class="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded text-xs font-bold transition-colors">Edit</button>
              </div>
              <dl class="space-y-4 text-sm">
                <div>
                  <dt class="text-slate-500 font-medium">Contract Amount</dt>
                  <dd class="font-bold text-slate-900">{{ project()?.originalContractAmount | currency:'USD' }}</dd>
                </div>
                <div>
                  <dt class="text-slate-500 font-medium">Billing Type</dt>
                  <dd class="font-bold text-slate-900">{{ project()?.billingTerms || 'Lump Sum' }}</dd>
                </div>
              </dl>
            </div>

            <div class="bg-white p-6 rounded-md shadow-sm border border-slate-200 md:col-span-2">
              <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Integrations & Sync</h3>
              
              <div class="flex flex-col gap-4">
                <div>
                  <label for="driveId" class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Google Drive Folder ID</label>
                  <div class="flex gap-2">
                    <input id="driveId" type="text" [(ngModel)]="tempDriveId" (ngModelChange)="driveIdDirty.set(true)" class="flex-1 px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 text-sm text-slate-700 placeholder:text-slate-400" placeholder="e.g. 1A2b3C4d5E6f7G8h9I0j...">
                    <button (click)="saveDriveId()" [disabled]="!driveIdDirty()" class="bg-slate-800 text-white px-5 py-2 rounded font-bold shadow-sm hover:bg-slate-900 transition-all text-sm whitespace-nowrap disabled:opacity-50">
                      Save ID
                    </button>
                  </div>
                  <p class="text-xs text-slate-500 mt-2">Paste the Drive Folder ID here to link project documents.</p>
                </div>
                
                <div class="pt-4 mt-2 border-t border-slate-100">
                  <label for="sheetId" class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Google Sheet ID (Estimating / Budget)</label>
                  <div class="flex gap-2">
                    <input id="sheetId" type="text" [(ngModel)]="tempSheetId" (ngModelChange)="sheetIdDirty.set(true)" class="flex-1 px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-700 placeholder:text-slate-400" placeholder="e.g. 1BvO... ">
                    <button (click)="saveSheetId()" [disabled]="!sheetIdDirty()" class="bg-emerald-600 text-white px-5 py-2 rounded font-bold shadow-sm hover:bg-emerald-700 transition-all text-sm whitespace-nowrap disabled:opacity-50">
                      Save Sheet
                    </button>
                  </div>
                  <p class="text-xs text-slate-500 mt-2">Link the project's main financial Google Sheet.</p>
                </div>
                
                <div class="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 class="font-bold text-slate-800 text-sm">Sync with Google Drive</h4>
                    <p class="text-xs text-slate-500 mt-1">Trigger a manual webhook sync to pull in the latest documents and updates from Drive.</p>
                  </div>
                  <button (click)="activeTab.set('files')" class="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded font-bold shadow-sm hover:bg-slate-50 transition-colors text-sm flex items-center gap-2">
                    <mat-icon class="!text-[18px] w-[18px] h-[18px] text-slate-500">folder</mat-icon> View Files
                  </button>
                </div>
              </div>
            </div>

          </div>
        }
        @if (activeTab() === 'budget') {
          <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-6 border-b border-slate-200 bg-slate-50">
              <h3 class="text-lg font-bold text-slate-900">Job Cost & WIP</h3>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                <!-- Sample WIP Metrics -->
                <div>
                  <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Contract Value</p>
                  <p class="text-3xl font-black text-slate-800">{{ project()?.originalContractAmount || 0 | currency:'USD' }}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Committed Cost</p>
                  <p class="text-3xl font-black text-slate-800">{{ 0 | currency:'USD' }}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Over/Under Billed</p>
                  <p class="text-3xl font-black text-slate-800">{{ 0 | currency:'USD' }}</p>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">Margin %</p>
                  <p class="text-3xl font-black text-slate-800">0%</p>
                </div>
              </div>
            </div>
          </div>
        }
        @if (activeTab() === 'pos') {
          <div class="space-y-6">
            @if (showNewPO()) {
              <div class="bg-white p-6 rounded-md shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-300">
                <div class="flex justify-between items-center mb-6">
                  <h3 class="text-lg font-bold text-slate-900">Add New Purchase Order</h3>
                  <button (click)="showNewPO.set(false)" class="text-slate-400 hover:text-slate-600 transition-colors"><mat-icon>close</mat-icon></button>
                </div>
                <form (ngSubmit)="savePO()" class="space-y-6">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label for="poNum" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">PO Number</label>
                      <input id="poNum" type="text" [(ngModel)]="newPO.poNumber" name="poNum" required class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm">
                    </div>
                    <div class="md:col-span-2">
                      <label for="vendor" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Vendor / Supplier</label>
                      <input id="vendor" type="text" [(ngModel)]="newPO.vendor" name="vendor" required class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm">
                    </div>
                  </div>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label for="amount" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Amount</label>
                      <input id="amount" type="number" [(ngModel)]="newPO.originalAmount" name="amount" required class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-bold font-mono text-sm">
                    </div>
                    <div>
                      <label for="poDate" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Date</label>
                      <input id="poDate" type="date" [(ngModel)]="newPO.date" name="poDate" class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-slate-700 text-sm">
                    </div>
                    <div>
                      <label for="poStatus" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Status</label>
                      <select id="poStatus" [(ngModel)]="newPO.status" name="status" class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-bold text-sm">
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Approved">Approved</option>
                        <option value="Partially Invoiced">Partially Invoiced</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label for="items" class="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Items Purchased / Notes</label>
                    <textarea id="items" [(ngModel)]="newPO.itemsPurchased" name="items" rows="3" class="w-full px-4 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-orange-500 font-medium text-slate-700 placeholder:text-slate-400 text-sm" placeholder="List items or describe purchase..."></textarea>
                  </div>
                  <div class="flex justify-end gap-3 pt-2">
                    <button type="button" (click)="showNewPO.set(false)" class="px-6 py-2 rounded font-bold text-slate-600 hover:bg-slate-100 transition-colors border border-transparent text-sm">Cancel</button>
                    <button type="submit" class="bg-orange-500 text-white px-6 py-2 rounded font-bold shadow-sm hover:bg-orange-600 transition-all flex items-center gap-2 text-sm">
                      <mat-icon class="!text-[18px] w-[18px] h-[18px]">check</mat-icon> Save PO
                    </button>
                  </div>
                </form>
              </div>
            }

            <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
              <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 class="text-lg font-bold text-slate-900">Purchase Orders</h3>
                <button (click)="showNewPO.set(true)" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded font-bold shadow-sm hover:bg-slate-50 transition-colors text-sm flex items-center gap-2">
                  <mat-icon class="!text-lg">add</mat-icon> New PO
                </button>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr class="bg-white border-b border-slate-200">
                      <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Number / Date</th>
                      <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Vendor / Items</th>
                      <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                      <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (po of projectPOs(); track po.id) {
                      <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4">
                          <div class="font-bold text-slate-900 flex flex-col">
                            <span>{{ po.poNumber || 'Draft' }}</span>
                            <span class="text-xs text-slate-500 font-medium">{{ (po.date || po.createdAt) | date:'shortDate' }}</span>
                          </div>
                        </td>
                        <td class="px-6 py-4">
                          <div class="flex flex-col">
                            <span class="font-bold text-slate-900">{{ po.vendor }}</span>
                            <span class="text-xs text-slate-500 font-medium truncate max-w-[300px]" [title]="po.itemsPurchased || ''">{{ po.itemsPurchased || 'No description provided' }}</span>
                          </div>
                        </td>
                        <td class="px-6 py-4">
                          <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                            [ngClass]="{
                              'bg-slate-100 text-slate-600': po.status === 'Draft',
                              'bg-amber-100 text-amber-700': po.status === 'Sent',
                              'bg-blue-100 text-blue-700': po.status === 'Approved' || po.status === 'Partially Invoiced',
                              'bg-emerald-100 text-emerald-700': po.status === 'Closed'
                            }">
                            {{ po.status }}
                          </span>
                        </td>
                        <td class="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {{ po.originalAmount | currency:'USD' }}
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="4" class="px-6 py-12 text-center text-slate-400 italic">No purchase orders found for this project</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        }
        @if (activeTab() === 'budget') {
          <app-budget-tab [project]="project()!" [summary]="financialSummary()!"></app-budget-tab>
        }
        @if (activeTab() === 'co') {
          <app-co-tab [project]="project()!"></app-co-tab>
        }
        @if (activeTab() === 'billing') {
          <app-billing-tab [project]="project()!" [summary]="financialSummary()!"></app-billing-tab>
        }
        @if (activeTab() === 'documents') {
          <app-documents-tab [project]="project()!"></app-documents-tab>
        }
        @if (activeTab() === 'issues') {
          <app-issues-tasks-tab [project]="project()!"></app-issues-tasks-tab>
        }
        @if (activeTab() === 'logs') {
          <app-daily-logs-tab [project]="project()!"></app-daily-logs-tab>
        }
        @if (activeTab() === 'schedule') {
          <app-schedule-tab [project]="project()!"></app-schedule-tab>
        }
        @if (activeTab() === 'files') {
          <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
            <div class="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 class="text-lg font-bold text-slate-900">Project Documents</h3>
              <button (click)="loadDriveFiles()" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded font-bold shadow-sm hover:bg-slate-50 transition-colors text-sm flex items-center gap-2">
                <mat-icon class="!text-[18px]">sync</mat-icon> Refresh
              </button>
            </div>
            
            <div class="p-0">
              @if (!project()?.driveFolderId) {
                <div class="py-16 text-center">
                  <mat-icon class="!text-3xl w-8 h-8 text-slate-300 mb-2">folder_off</mat-icon>
                  <h3 class="text-lg font-bold text-slate-900 mb-1">No Drive Folder Linked</h3>
                  <p class="text-slate-500 text-sm mb-4">Go to Setup to link a Google Drive folder ID.</p>
                  <button (click)="activeTab.set('setup')" class="bg-orange-500 text-white px-4 py-2 rounded font-bold shadow-sm hover:bg-orange-600 transition-colors text-sm">
                    Go to Setup
                  </button>
                </div>
              } @else if (loadingFiles()) {
                <div class="py-16 text-center text-slate-500 flex flex-col items-center justify-center">
                  <mat-icon class="animate-spin mb-2">refresh</mat-icon>
                  <p class="text-sm font-medium">Loading files from Google Drive...</p>
                </div>
              } @else if (driveError()) {
                <div class="py-16 text-center text-red-500 flex flex-col items-center justify-center">
                  <mat-icon class="mb-2">error_outline</mat-icon>
                  <p class="text-sm font-medium mb-4">{{ driveError() }}</p>
                  <button (click)="loadDriveFiles()" class="bg-slate-800 text-white px-4 py-2 rounded font-bold hover:bg-slate-900 text-sm">Retry</button>
                </div>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse">
                    <thead>
                      <tr class="bg-white border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
                        <th class="px-6 py-4 font-bold">Name</th>
                        <th class="px-6 py-4 font-bold">Last Modified</th>
                        <th class="px-6 py-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 text-sm">
                      @for (file of driveFiles(); track file.id) {
                        <tr class="hover:bg-slate-50 transition-colors group">
                          <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                              <img [src]="file.iconLink" class="w-4 h-4" alt="Icon">
                              <span class="font-medium text-slate-800">{{ file.name }}</span>
                            </div>
                          </td>
                          <td class="px-6 py-4 text-slate-500">
                            {{ file.modifiedTime | date:'medium' }}
                          </td>
                          <td class="px-6 py-4 text-right">
                            <a [href]="file.webViewLink" target="_blank" referrerpolicy="no-referrer" class="text-orange-600 hover:text-orange-700 font-medium inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              Open <mat-icon class="!text-[14px]">open_in_new</mat-icon>
                            </a>
                          </td>
                        </tr>
                      } @empty {
                        <tr><td colspan="3" class="px-6 py-12 text-center text-slate-400 italic">No files found in folder</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        }
        @if (activeTab() !== 'setup' && activeTab() !== 'budget' && activeTab() !== 'co' && activeTab() !== 'pos' && activeTab() !== 'files' && activeTab() !== 'billing' && activeTab() !== 'overview' && activeTab() !== 'documents' && activeTab() !== 'issues' && activeTab() !== 'logs' && activeTab() !== 'schedule') {
          <div class="py-16 text-center border-2 border-dashed border-slate-300 rounded-md bg-slate-50">
            <mat-icon class="!text-3xl w-8 h-8 text-slate-300 mb-2">construction</mat-icon>
            <h3 class="text-lg font-bold text-slate-900 mb-1">Under Construction</h3>
            <p class="text-slate-500 max-w-sm mx-auto text-sm">This tab is being built out to support field and office operations.</p>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetails {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  
  private driveService = inject(DriveService);
  
  projectId = this.route.snapshot.paramMap.get('id');
  projects = toSignal(this.dataService.getProjects(), { initialValue: [] });
  project = computed(() => (this.projects() || []).find(p => p.id === this.projectId));

  pos = toSignal(this.dataService.getPOs(), { initialValue: [] });
  projectPOs = computed(() => (this.pos() || []).filter(po => po.projectId === this.projectId));

  changeOrders = toSignal(this.dataService.getChangeOrders(), { initialValue: [] });
  projectCOs = computed(() => (this.changeOrders() || []).filter(co => co.projectId === this.projectId));

  billings = toSignal(this.dataService.getBillings(), { initialValue: [] });
  projectBillings = computed(() => (this.billings() || []).filter(b => b.projectId === this.projectId));

  files = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  projectFiles = computed(() => (this.files() || []).filter(f => f.projectId === this.projectId));

  reqDocs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });
  projectReqDocs = computed(() => (this.reqDocs() || []).filter(r => r.projectId === this.projectId));

  issues = toSignal(this.dataService.getProjectIssues(), { initialValue: [] });
  projectIssues = computed(() => (this.issues() || []).filter(i => i.projectId === this.projectId));

  tasks = toSignal(this.dataService.getProjectTasks(), { initialValue: [] });
  projectTasks = computed(() => (this.tasks() || []).filter(t => t.projectId === this.projectId));

  dailyLogs = toSignal(this.dataService.getDailyLogs(), { initialValue: [] });
  projectLogs = computed(() => (this.dailyLogs() || []).filter(l => l.projectId === this.projectId));

  milestones = toSignal(this.dataService.getMilestones(), { initialValue: [] });
  projectMilestones = computed(() => (this.milestones() || []).filter(m => m.projectId === this.projectId));

  activityFeed = computed(() => buildProjectActivityFeed(
    this.projectId!, 
    this.dailyLogs() || [],
    this.files() || [],
    this.issues() || [],
    this.tasks() || [],
    this.changeOrders() || [],
    this.billings() || [],
    this.milestones() || []
  ));

  recentPhotos = computed(() => (this.projectFiles()).filter(f => f.documentType === 'Photo' || f.mimeType?.startsWith('image')).slice(0, 4));

  financialSummary = computed(() => getProjectFinancialSummary(this.project() || null, this.projectCOs(), this.projectBillings()));
  
  missingDocsCount = computed(() => this.projectReqDocs().filter(r => r.status === 'Needed' || r.status === 'Requested').length);
  
  daysSinceLastLog = computed(() => getDaysSinceLastDailyLog(this.projectId!, this.projectLogs()));
  nextMilestone = computed(() => getNextMilestone(this.projectId!, this.projectMilestones()));

  projectExceptions = computed(() => {
    const p = this.project();
    if (!p) return [];
    return getProjectExceptions(p, this.financialSummary(), this.projectCOs(), this.projectBillings(), this.projectFiles(), this.projectReqDocs(), this.projectIssues(), this.projectTasks());
  });

  showNewPO = signal(false);
  newPO: Partial<PO> = { poNumber: '', vendor: '', originalAmount: 0, status: 'Draft', itemsPurchased: '', paymentMethod: '' };

  savePO() {
    if (!this.newPO.poNumber || !this.newPO.vendor || !this.projectId) return;
    this.newPO.projectId = this.projectId;
    this.dataService.createPO(this.newPO).subscribe(() => {
      this.showNewPO.set(false);
      this.newPO = { poNumber: '', vendor: '', originalAmount: 0, status: 'Draft', itemsPurchased: '', paymentMethod: '' };
      window.location.reload();
    });
  }

  activeTab = signal('overview');
  tempDriveId = '';
  driveIdDirty = signal(false);
  tempSheetId = '';
  sheetIdDirty = signal(false);

  constructor() {
    // initialize tempDriveId
    setTimeout(() => {
      const p = this.project();
      if (p && p.driveFolderId) {
        this.tempDriveId = p.driveFolderId;
      }
      if (p && p.googleSheetId) {
        this.tempSheetId = p.googleSheetId;
      }
    }, 100);

    // Watch active tab and load files if files tab is opened
    effect(() => {
      if (this.activeTab() === 'files' && this.project()?.driveFolderId) {
        this.loadDriveFiles();
      }
    });
  }

  saveDriveId() {
    if (!this.projectId) return;
    this.dataService.updateProject(this.projectId, { driveFolderId: this.tempDriveId }).subscribe(() => {
      this.driveIdDirty.set(false);
      // Optional: show a toast or success message
      alert('Google Drive Folder ID saved successfully!');
      if (this.activeTab() === 'files') {
        this.loadDriveFiles();
      }
    });
  }

  saveSheetId() {
    if (!this.projectId) return;
    this.dataService.updateProject(this.projectId, { 
      googleSheetId: this.tempSheetId,
      googleSheetUrl: this.tempSheetId ? `https://docs.google.com/spreadsheets/d/${this.tempSheetId}/edit` : undefined
    }).subscribe(() => {
      this.sheetIdDirty.set(false);
      alert('Google Sheet ID saved successfully!');
    });
  }

  driveFiles = signal<DriveFile[]>([]);
  loadingFiles = signal(false);
  driveError = signal<string | null>(null);

  async loadDriveFiles() {
    const p = this.project();
    if (!p || !p.driveFolderId) return;
    try {
      this.loadingFiles.set(true);
      this.driveError.set(null);
      const files = await this.driveService.listFiles(p.driveFolderId);
      this.driveFiles.set(files);
    } catch (e: any) {
      this.driveError.set(e.message || 'Error loading files');
    } finally {
      this.loadingFiles.set(false);
    }
  }

  tabs = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'setup', label: 'Setup', icon: 'settings' },
    { id: 'budget', label: 'Budget / WIP', icon: 'account_balance_wallet' },
    { id: 'co', label: 'Change Orders', icon: 'sync_alt' },
    { id: 'logs', label: 'Daily Logs', icon: 'history_edu' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar_month' },
    { id: 'billing', label: 'Billing', icon: 'request_quote' },
    { id: 'documents', label: 'Documents', icon: 'description' },
    { id: 'issues', label: 'Issues / Tasks', icon: 'assignment_late' },
    { id: 'files', label: 'Files', icon: 'folder' }
  ];
}
