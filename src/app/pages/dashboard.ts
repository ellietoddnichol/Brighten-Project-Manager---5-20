import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DataService } from '../services/data.service';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { getProjectFinancialSummary, getProjectExceptions, ProjectException, ProjectFinancialSummary } from '../utils/financial';
import { getDailyLogExceptions, getScheduleExceptions } from '../utils/field';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterModule],
  template: `
    <div class="p-8 flex-1 overflow-y-auto w-full max-w-7xl mx-auto">
      
      <header class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p class="text-slate-500 text-sm mt-1">Overview of project flow, actions, and recent updates.</p>
        </div>
        <div class="flex gap-3">
          <button class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
             <mat-icon class="!text-[18px] w-4 h-4 text-slate-400">refresh</mat-icon> Sync Now
          </button>
          <a routerLink="/projects" class="bg-orange-500 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-orange-600 transition-all flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> New Project
          </a>
        </div>
      </header>

      <!-- STATS ROW -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <a routerLink="/projects" [queryParams]="{status: 'In Progress'}" class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col hover:border-slate-300 transition-all cursor-pointer group">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Active Projects</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-2xl font-black text-slate-800">{{ stats().inProgress }}</div>
            <mat-icon class="text-slate-300 group-hover:text-orange-500 transition-colors">folder</mat-icon>
          </div>
        </a>
        
        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Rev Contract</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-slate-800">{{ dashboardFinancials().totalRevisedContract | currency:'USD':'symbol':'1.0-0' }}</div>
          </div>
        </div>
        
        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Billed</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-slate-800">{{ dashboardFinancials().totalBilled | currency:'USD':'symbol':'1.0-0' }}</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Left to Bill</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-slate-800">{{ dashboardFinancials().totalLeftToBill | currency:'USD':'symbol':'1.0-0' }}</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Open CO Value</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-orange-600">{{ dashboardFinancials().totalOpenCOValue | currency:'USD':'symbol':'1.0-0' }}</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Apprv CO Value</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-emerald-600">{{ dashboardFinancials().totalApprovedCOValue | currency:'USD':'symbol':'1.0-0' }}</div>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-slate-200 shadow-sm flex flex-col">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Action Items</div>
          <div class="flex items-end justify-between w-full mt-auto">
            <div class="text-xl font-black text-red-600">{{ attentionItems().length }}</div>
            <mat-icon class="text-red-300">warning</mat-icon>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- LEFT COLUMN (Span 2) -->
        <div class="lg:col-span-2 space-y-8">
          
          <!-- PROJECT PIPELINE -->
          <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div class="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 class="text-sm font-bold text-slate-900">Project Pipeline</h2>
              <a routerLink="/projects" class="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors">View all projects</a>
            </div>
            
            <div class="p-6">
              <div class="flex w-full divide-x divide-slate-100">
                
                <!-- Stage 1 -->
                <div class="flex-1 px-4 first:pl-0 last:pr-0">
                  <div class="bg-slate-100 text-center py-2 rounded-t-sm font-bold text-xs text-slate-600 border-b-4 border-slate-300">New / Pre-Con</div>
                  <div class="text-center py-4">
                    <div class="text-3xl font-black text-slate-800">{{ stats().new }}</div>
                  </div>
                  <div class="space-y-2 mt-2">
                    @for (p of newProjects() | slice:0:3; track p.id) {
                      <a [routerLink]="['/projects', p.id]" class="text-xs flex justify-between items-center text-slate-600 hover:text-orange-600 cursor-pointer transition-colors">
                        <span class="truncate pr-2 font-medium" [title]="p.projectName">● {{ p.projectName }}</span>
                      </a>
                    }
                  </div>
                </div>

                <!-- Stage 2 -->
                <div class="flex-1 px-4">
                  <div class="bg-slate-100 text-center py-2 rounded-t-sm font-bold text-xs text-slate-700 border-b-4 border-orange-400">In Progress</div>
                  <div class="text-center py-4">
                    <div class="text-3xl font-black text-slate-800">{{ stats().inProgress }}</div>
                  </div>
                  <div class="space-y-2 mt-2">
                    @for (p of inProgressProjects() | slice:0:3; track p.id) {
                      <a [routerLink]="['/projects', p.id]" class="text-xs flex justify-between items-center text-slate-600 hover:text-orange-600 cursor-pointer transition-colors">
                        <span class="truncate pr-2 font-medium" [title]="p.projectName">● {{ p.projectName }}</span>
                      </a>
                    }
                  </div>
                </div>

                <!-- Stage 3 -->
                <div class="flex-1 px-4">
                  <div class="bg-slate-100 text-center py-2 rounded-t-sm font-bold text-xs text-slate-700 border-b-4 border-amber-400">Waiting</div>
                  <div class="text-center py-4">
                    <div class="text-3xl font-black text-slate-800">{{ stats().waiting }}</div>
                  </div>
                  <div class="space-y-2 mt-2">
                    @for (p of waitingProjects() | slice:0:3; track p.id) {
                      <a [routerLink]="['/projects', p.id]" class="text-xs flex justify-between items-center text-slate-600 hover:text-orange-600 cursor-pointer transition-colors">
                        <span class="truncate pr-2 font-medium" [title]="p.projectName">● {{ p.projectName }}</span>
                      </a>
                    }
                  </div>
                </div>

                <!-- Stage 4 -->
                <div class="flex-1 px-4 border-r-0">
                  <div class="bg-slate-100 text-center py-2 rounded-t-sm font-bold text-xs text-slate-700 border-b-4 border-emerald-500">Ready to Bill</div>
                  <div class="text-center py-4">
                    <div class="text-3xl font-black text-slate-800">{{ stats().readyBill }}</div>
                  </div>
                  <div class="space-y-2 mt-2">
                    @for (p of readyBillProjects() | slice:0:3; track p.id) {
                      <a [routerLink]="['/projects', p.id]" class="text-xs flex justify-between items-center text-slate-600 hover:text-orange-600 cursor-pointer transition-colors">
                        <span class="truncate pr-2 font-medium" [title]="p.projectName">● {{ p.projectName }}</span>
                      </a>
                    }
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- ATTENTION QUEUE -->
          <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 class="text-sm font-bold text-slate-900">Projects Requiring Attention</h2>
            </div>
            
            <div class="p-0">
              @if (attentionItems().length > 0) {
                <table class="w-full text-left text-sm">
                  <thead>
                    <tr class="bg-white border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <th class="px-6 py-3">Project Name</th>
                      <th class="px-6 py-3">Issue</th>
                      <th class="px-6 py-3 text-right">Type</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (item of attentionItems(); track item.id) {
                      <tr class="hover:bg-slate-50/80 transition-colors">
                        <td class="px-6 py-4 font-bold text-orange-600">{{ item.projectName }}</td>
                        <td class="px-6 py-4">
                          <div class="flex items-center gap-2">
                            <div class="w-2 h-2 rounded-full bg-rose-500"></div>
                            <span class="font-medium text-slate-700">{{ item.title }} - {{ item.description }}</span>
                          </div>
                        </td>
                        <td class="px-6 py-4 text-right">
                          <span class="text-xs text-slate-500 font-medium">{{ item.type }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <div class="p-12 text-center flex flex-col items-center">
                  <div class="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3 border border-slate-200">
                    <mat-icon>check</mat-icon>
                  </div>
                  <h3 class="font-bold text-slate-900">All caught up!</h3>
                  <p class="text-sm text-slate-500 mt-1">No items require immediate attention.</p>
                </div>
              }
            </div>
          </div>
          
        </div>

        <!-- RIGHT COLUMN -->
        <div class="space-y-8">
          
          <!-- RECENT DAILY LOGS -->
          <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
            <div class="p-5 border-b border-slate-200 bg-slate-50">
              <h2 class="text-sm font-bold text-slate-900">Recent Logs</h2>
            </div>
            <div class="p-5 space-y-4">
               @for (log of recentLogs(); track log.id) {
                 <div class="flex flex-col gap-1 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <div class="flex justify-between items-center text-xs">
                      <span class="font-bold text-slate-900">{{ getProjectName(log.projectId) }}</span>
                      <span class="text-slate-400">{{ log.logDate | date:'shortDate' }}</span>
                    </div>
                    <div class="text-sm text-slate-600 line-clamp-2">{{ log.workPerformed || 'Log entry added by ' + log.ownerId }}</div>
                 </div>
               } @empty {
                 <div class="text-sm text-slate-500 text-center py-4">No recent logs</div>
               }
            </div>
          </div>

          <!-- FILE UPLOAD DROPZONE -->
          <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden p-6 flex flex-col items-center justify-center text-center border-dashed border-2 hover:bg-slate-50 transition-colors cursor-pointer group relative"
               (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)" [class.bg-slate-50]="isDragging">
            <div class="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <mat-icon>cloud_upload</mat-icon>
            </div>
            <h3 class="font-bold text-slate-900 mb-1">Upload Documents</h3>
            <p class="text-xs text-slate-500 mb-4 px-4 line-clamp-2">Drag and drop files here to automatically route them to project folders</p>
            <button (click)="fileInput.click()" class="bg-white border border-slate-200 shadow-sm text-sm font-bold text-slate-700 px-4 py-2 rounded-md hover:bg-slate-50 hover:border-slate-300 transition-colors">Browse Files</button>
            <input type="file" #fileInput class="hidden" multiple (change)="onFileSelected($event)">
          </div>
          
        </div>
      </div>
      
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private dataService = inject(DataService);
  projects = toSignal(this.dataService.getProjects(), { initialValue: [] });
  pos = toSignal(this.dataService.getPOs(), { initialValue: [] });
  changeOrders = toSignal(this.dataService.getChangeOrders(), { initialValue: [] });
  logs = toSignal(this.dataService.getDailyLogs(), { initialValue: [] });
  billings = toSignal(this.dataService.getBillings(), { initialValue: [] });
  files = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  reqDocs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });
  issues = toSignal(this.dataService.getProjectIssues(), { initialValue: [] });
  tasks = toSignal(this.dataService.getProjectTasks(), { initialValue: [] });
  milestones = toSignal(this.dataService.getMilestones(), { initialValue: [] });

  dashboardFinancials = computed(() => {
    let totalRevisedContract = 0;
    let totalBilled = 0;
    let totalLeftToBill = 0;
    let totalOpenCOValue = 0;
    let totalApprovedCOValue = 0;

    const projs = this.projects() || [];
    const cos = this.changeOrders() || [];
    const bills = this.billings() || [];

    projs.forEach(p => {
      const pCOs = cos.filter(c => c.projectId === p.id);
      const pBills = bills.filter(b => b.projectId === p.id);
      const summary = getProjectFinancialSummary(p, pCOs, pBills);
      
      totalRevisedContract += summary.revisedContract;
      totalBilled += summary.billedToDate;
      totalLeftToBill += summary.leftToBill;
    });

    cos.forEach(co => {
      if (co.status === 'Submitted' || co.status === 'Internal Review' || co.status === 'Draft' || co.status === 'Need Pricing') {
        totalOpenCOValue += (co.sellPrice || 0); // Draft value usually uses sellPrice
      }
      if (co.status === 'Approved') {
        totalApprovedCOValue += (co.approvedAmount || 0);
      }
    });

    return { totalRevisedContract, totalBilled, totalLeftToBill, totalOpenCOValue, totalApprovedCOValue };
  });

  newProjects = computed(() => (this.projects() || []).filter(p => p.status === 'Lead / Precon'));
  inProgressProjects = computed(() => (this.projects() || []).filter(p => p.status === 'Active'));
  waitingProjects = computed(() => (this.projects() || []).filter(p => p.status === 'Setup Needed'));
  readyBillProjects = computed(() => (this.projects() || []).filter(p => p.status === 'Closeout'));

  totalPOs = computed(() => (this.pos() || []).length);
  totalContractValue = computed(() => (this.projects() || []).reduce((acc, p) => acc + (p.originalContractAmount || 0), 0));
  pendingCOs = computed(() => (this.changeOrders() || []).filter(co => co.status === 'Submitted').length);
  pendingChangeOrdersList = computed(() => (this.changeOrders() || []).filter(co => co.status === 'Submitted'));

  showList = signal<'pos' | 'cos' | null>(null);

  isDragging = false;

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileSelected(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      this.handleFiles(Array.from(event.target.files));
    }
  }

  handleFiles(files: File[]) {
    // Process files and mock a webhook trigger
    alert(`Triggering webhook... Uploading ${files.length} file(s) to project Drive folders.`);
    // Here we'd map over files and call dataService.uploadFile
  }

  recentLogs = computed(() => {
    return [...(this.logs() || [])].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4);
  });

  getProjectName(id: string) {
    const p = (this.projects() || []).find(x => x.id === id);
    return p ? p.projectName : 'Unknown Project';
  }

  stats = computed(() => {
    const projs = this.projects() || [];
    return {
      new: this.newProjects().length,
      inProgress: this.inProgressProjects().length,
      waiting: this.waitingProjects().length,
      readyBill: this.readyBillProjects().length,
      closeout: projs.filter(p => p.status === 'Closeout').length,
      closed: projs.filter(p => p.status === 'Closed').length,
    };
  });


  attentionItems = computed(() => {
    const items: {id: string, title: string, description: string, type: string, projectName: string}[] = [];
    const projs = this.projects() || [];
    const cos = this.changeOrders() || [];
    const bills = this.billings() || [];
    const pos = this.pos() || [];
    const _files = this.files() || [];
    const _reqDocs = this.reqDocs() || [];
    const _issues = this.issues() || [];
    const _tasks = this.tasks() || [];
    const _logs = this.logs() || [];
    const _milestones = this.milestones() || [];
    const projectMap = new Map(projs.map(p => [p.id, p]));

    projs.forEach(p => {
      const pCOs = cos.filter(c => c.projectId === p.id);
      const pBills = bills.filter(b => b.projectId === p.id);
      const summary = getProjectFinancialSummary(p, pCOs, pBills);
      
      const pFiles = _files.filter(f => f.projectId === p.id);
      const pReqs = _reqDocs.filter(r => r.projectId === p.id);
      const pIssues = _issues.filter(i => i.projectId === p.id);
      const pTasks = _tasks.filter(t => t.projectId === p.id);

      const exceptions = getProjectExceptions(p, summary, pCOs, pBills, pFiles, pReqs, pIssues, pTasks);
      exceptions.forEach(ex => {
        items.push({ id: ex.id, title: ex.title, description: ex.description, type: ex.type, projectName: ex.projectName || 'Unknown' });
      });

      const fieldExceptions = getDailyLogExceptions(p, _logs);
      fieldExceptions.forEach(ex => {
         items.push({ id: ex.id, title: ex.title, description: ex.description, type: ex.type, projectName: ex.projectName || 'Unknown' });
      });

      const scheduleExceptions = getScheduleExceptions(p, _milestones);
      scheduleExceptions.forEach(ex => {
         items.push({ id: ex.id, title: ex.title, description: ex.description, type: ex.type, projectName: ex.projectName || 'Unknown' });
      });

      if (!p.address) items.push({ id: 'p1-' + p.id, title: 'Missing Address', description: p.projectName + ' requires a site address.', type: 'Project Info', projectName: p.projectName });
      if (!p.originalContractAmount && p.status === 'Active') items.push({ id: 'p2-' + p.id, title: 'No Contract Amount', description: p.projectName + ' is in progress but missing a contract amount.', type: 'Billing', projectName: p.projectName });
    });

    pos.forEach(po => {
      const proj = projectMap.get(po.projectId);
      if (!proj) return;
      if (po.invoiceExceedsPo) items.push({ id: 'po1-' + po.id, title: 'Invoice Exceeds PO', description: 'PO ' + po.poNumber + ' for ' + po.vendor + ' has an invoice greater than PO amount.', type: 'Cost', projectName: proj.projectName });
      if (po.missingPo) items.push({ id: 'po2-' + po.id, title: 'Missing PO', description: 'A quote or invoice exists without a matching PO for ' + po.vendor + '.', type: 'Action', projectName: proj.projectName });
    });

    return items;
  });
}
