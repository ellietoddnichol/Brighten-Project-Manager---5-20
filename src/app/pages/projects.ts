import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../services/data.service';
import { MatIconModule } from '@angular/material/icon';
// ...
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '../models/types';
import { RouterModule, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, RouterModule],
  template: `
    <div class="h-full flex flex-col p-6 w-full mx-auto md:max-w-none overflow-x-hidden">
      <header class="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">Active Projects</h1>
          <p class="text-slate-500 text-sm mt-1">Command center view of all active and upcoming jobs.</p>
        </div>
        <button (click)="showNewProject = true" class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-slate-800 transition-all flex items-center gap-2">
          <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> New Project
        </button>
      </header>

      <div class="bg-white p-2 rounded-md shadow-sm border border-slate-200 mb-4 flex flex-wrap gap-4 items-center shrink-0">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 !text-[18px] w-[18px] h-[18px]">search</mat-icon>
          <input type="text" [(ngModel)]="searchQuery" placeholder="Search projects or filter by status..." 
                 class="w-full pl-10 pr-4 py-2 bg-transparent border-none focus:ring-0 outline-none text-sm">
        </div>
      </div>

      <div class="flex-1 bg-white rounded-md shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col relative">
        <div class="overflow-x-auto overflow-y-auto flex-1">
          <table class="w-full text-left border-collapse whitespace-nowrap min-w-max">
            <thead class="sticky top-0 bg-slate-50 z-10 shadow-sm">
              <tr class="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-500">
                <th class="px-4 py-3 font-bold border-r border-slate-200 sticky left-0 bg-slate-50 z-20">Project Info</th>
                <th class="px-4 py-3 font-bold text-center">Status</th>
                <th class="px-4 py-3 font-bold text-right border-l border-slate-200">Contract</th>
                <th class="px-4 py-3 font-bold text-right text-emerald-700">Appr COs</th>
                <th class="px-4 py-3 font-bold text-right font-black">Rev Contract</th>
                <th class="px-4 py-3 font-bold text-right text-indigo-700">Billed</th>
                <th class="px-4 py-3 font-bold text-right text-amber-700">Left to Bill</th>
                <th class="px-4 py-3 font-bold text-right border-l border-slate-200 text-slate-800">Est Cost</th>
                <th class="px-4 py-3 font-bold text-right text-red-700">Actual Cost</th>
                <th class="px-4 py-3 font-bold text-right text-slate-800">Left in Budget</th>
                <th class="px-4 py-3 font-bold text-right border-l border-slate-200 text-emerald-800">Proj Profit</th>
                <th class="px-4 py-3 font-bold text-right text-emerald-800">Margin %</th>
                <th class="px-4 py-3 font-bold border-l border-slate-200">Action Items</th>
                <th class="px-4 py-3 font-bold text-center">Drive</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              @for (project of filteredProjects(); track project.id) {
                <tr class="hover:bg-slate-50 transition-colors group cursor-pointer" [routerLink]="['/projects', project.id]">
                  <td class="px-4 py-3 border-r border-slate-100 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors shadow-[1px_0_0_rgba(241,245,249,1)]">
                    <div class="flex flex-col">
                      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">#{{ project.projectNumber }}</span>
                      <span class="font-bold text-slate-900 group-hover:text-orange-600 transition-colors max-w-[200px] truncate" [title]="project.projectName">{{ project.projectName }}</span>
                      <span class="text-xs text-slate-500 max-w-[200px] truncate" [title]="project.customer">{{ project.customer }}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter shrink-0"
                          [ngClass]="{
                            'bg-slate-100 text-slate-700': project.status === 'Lead / Precon' || project.status === 'Setup Needed',
                            'bg-orange-100 text-orange-800': project.status === 'Active',
                            'bg-emerald-100 text-emerald-800': project.status === 'Awarded',
                            'bg-amber-100 text-amber-800': project.status === 'Closeout',
                            'bg-slate-200 text-slate-500': project.status === 'Closed'
                          }">
                      {{ project.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right font-medium text-slate-600 border-l border-slate-100">{{ (project.originalContractAmount || 0) | currency }}</td>
                  <td class="px-4 py-3 text-right font-medium text-emerald-600">{{ 0 | currency }}</td>
                  <td class="px-4 py-3 text-right font-bold text-slate-900">{{ (project.originalContractAmount || 0) | currency }}</td>
                  <td class="px-4 py-3 text-right font-medium text-indigo-600">{{ 0 | currency }}</td>
                  <td class="px-4 py-3 text-right font-medium text-amber-600">{{ (project.originalContractAmount || 0) | currency }}</td>
                  
                  <!-- Costs -->
                  <td class="px-4 py-3 text-right font-medium text-slate-600 border-l border-slate-100">{{ (project.estLaborCost || 0) | currency }}</td>
                  <td class="px-4 py-3 text-right font-medium text-red-600">{{ (project.actualCostToDate || 0) | currency }}</td>
                  <td class="px-4 py-3 text-right font-medium text-slate-800">{{ ((project.estLaborCost || 0) - (project.actualCostToDate || 0)) | currency }}</td>
                  
                  <!-- Profit -->
                  <td class="px-4 py-3 text-right font-bold text-emerald-700 border-l border-slate-100">
                    {{ ((project.originalContractAmount || 0) - (project.estLaborCost || 0)) | currency }}
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-emerald-700">
                     0%
                  </td>
                  
                  <!-- action items -->
                  <td class="px-4 py-3 border-l border-slate-100">
                    <div class="flex items-center gap-3">
                      <div class="flex items-center gap-1 text-red-500 font-bold text-xs" title="Open Issues">
                        <mat-icon class="!text-[14px]">error_outline</mat-icon> 2
                      </div>
                      <div class="flex items-center gap-1 text-amber-500 font-bold text-xs" title="Missing Documents">
                        <mat-icon class="!text-[14px]">insert_drive_file</mat-icon> 3
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-center">
                    @if (project.driveFolderId || project.driveFolderUrl) {
                      <a [href]="project.driveFolderUrl" target="_blank" (click)="$event.stopPropagation()" class="inline-flex w-7 h-7 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 items-center justify-center transition-colors">
                        <mat-icon class="!text-[16px]">folder_shared</mat-icon>
                      </a>
                    } @else {
                      <span class="inline-flex w-7 h-7 rounded text-slate-300 items-center justify-center">
                        <mat-icon class="!text-[16px]">folder_off</mat-icon>
                      </span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="14" class="px-6 py-16 text-center text-slate-400 italic font-medium">No projects found.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (showNewProject) {
        <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div class="bg-white w-full max-w-xl rounded-md shadow-xl overflow-hidden border border-slate-200">
            <div class="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 class="text-base font-bold text-slate-900 tracking-tight">Provision New Project</h2>
                <p class="text-slate-500 text-[11px] mt-0.5 uppercase tracking-widest font-semibold">Workspace Automation</p>
              </div>
              <button (click)="showNewProject = false" class="text-slate-400 hover:text-slate-600"><mat-icon>close</mat-icon></button>
            </div>
            <form (submit)="createProject()" class="p-6 space-y-6 block">
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label for="num" class="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-2">Project #</label>
                  <input id="num" type="text" [(ngModel)]="newProject.projectNumber" name="num" required class="w-full px-3 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                </div>
                <div>
                  <label for="name" class="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-2">Project Name</label>
                  <input id="name" type="text" [(ngModel)]="newProject.projectName" name="name" required class="w-full px-3 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                </div>
              </div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label for="cust" class="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-2">Customer / GC</label>
                  <input id="cust" type="text" [(ngModel)]="newProject.customer" name="cust" required class="w-full px-3 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                </div>
                <div>
                  <label for="status" class="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-2">Status</label>
                  <select id="status" [(ngModel)]="newProject.status" name="status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                    <option value="Lead / Precon">Lead / Precon</option>
                    <option value="Awarded">Awarded</option>
                    <option value="Setup Needed">Setup Needed</option>
                    <option value="Active">Active</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label for="amt" class="block text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-2">Original Contract ($)</label>
                  <input id="amt" type="number" [(ngModel)]="newProject.originalContractAmount" name="amt" class="w-full px-3 py-2 bg-white rounded border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900 text-sm">
                </div>
              </div>
              <div class="flex justify-end pt-2">
                <button type="submit" [disabled]="loading()" class="bg-slate-900 text-white px-6 py-2 rounded font-bold shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-all text-sm">
                  {{ loading() ? 'Provisioning...' : 'Initialize Project' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Projects implements OnInit {
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);

  searchQuery = '';
  showNewProject = false;
  loading = signal(false);
  projects = toSignal(this.dataService.getProjects(), { initialValue: [] });

  newProject: Partial<Project> = { projectNumber: '', projectName: '', customer: '', status: 'Lead / Precon' };

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['status']) {
        this.searchQuery = params['status'];
      }
    });
  }

  filteredProjects = () => (this.projects() || []).filter(p => 
    p.projectName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
    p.status.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
    p.customer.toLowerCase().includes(this.searchQuery.toLowerCase())
  );

  createProject() {
    if (!this.newProject.projectName || !this.newProject.projectNumber) return;
    this.loading.set(true);
    this.dataService.createProject(this.newProject).subscribe(() => {
      this.showNewProject = false;
      this.newProject = { projectNumber: '', projectName: '', customer: '', status: 'Lead / Precon' };
      this.loading.set(false);
      window.location.reload();
    });
  }
}
