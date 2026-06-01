import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '../../models/types';
import { UtilityView } from './project-detail.types';
import { DriveMappingTabComponent } from '../../pages/drive-mapping-tab';
import { ScheduleTabComponent } from '../../pages/schedule-tab';
import { IssuesTasksTabComponent } from '../../pages/issues-tasks-tab';
import { CertifiedPayrollTabComponent } from '../../pages/certified-payroll-tab';
import { DriveFile } from '../../services/drive.service';
import { formatProjectDate } from '../../utils/project';

@Component({
  selector: 'app-project-utility-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    DriveMappingTabComponent, ScheduleTabComponent, IssuesTasksTabComponent, CertifiedPayrollTabComponent,
  ],
  template: `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button type="button" (click)="close.emit()"
                class="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900">
          <mat-icon class="!text-[18px]">arrow_back</mat-icon> Back to project
        </button>
        <h2 class="text-lg font-bold text-slate-900">{{ title() }}</h2>
      </div>

      @if (view === 'setup') {
        <div class="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Core Details</h3>
              <button type="button" (click)="editProject.emit()" class="text-xs font-bold text-blue-600">Edit</button>
            </div>
            <dl class="space-y-3 text-sm">
              <div><dt class="text-slate-500">Job #</dt><dd class="font-bold">{{ project.projectNumber }}</dd></div>
              <div><dt class="text-slate-500">Customer</dt><dd class="font-bold">{{ project.customer }}</dd></div>
              <div><dt class="text-slate-500">Status</dt><dd class="font-bold">{{ project.status }}</dd></div>
              <div><dt class="text-slate-500">Address</dt><dd class="font-bold">{{ project.address || '—' }}</dd></div>
              <div><dt class="text-slate-500">PM</dt><dd class="font-bold">{{ project.projectManager || 'Unassigned' }}</dd></div>
            </dl>
          </div>
          <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm md:col-span-2">
            <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Integrations</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Google Drive Folder ID</label>
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="tempDriveId" (ngModelChange)="driveDirty.set(true)"
                         class="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <button type="button" (click)="saveDrive.emit(tempDriveId)" [disabled]="!driveDirty()"
                          class="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">Save</button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2">Google Sheet ID</label>
                <div class="flex gap-2">
                  <input type="text" [(ngModel)]="tempSheetId" (ngModelChange)="sheetDirty.set(true)"
                         class="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <button type="button" (click)="saveSheet.emit(tempSheetId)" [disabled]="!sheetDirty()"
                          class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50">Save</button>
                </div>
              </div>
              <button type="button" (click)="openUtility.emit('drive-mapping')"
                      class="text-sm font-semibold text-orange-600 hover:underline">Open Drive Mapping →</button>
            </div>
          </div>
        </div>
      }

      @if (view === 'drive-mapping') {
        <app-drive-mapping-tab [project]="project" />
      }

      @if (view === 'directory') {
        <div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-lg">
          <h3 class="text-sm font-bold text-slate-900 mb-4">Key Contacts</h3>
          <dl class="space-y-4 text-sm">
            <div><dt class="text-slate-500">Project Manager</dt><dd class="font-bold">{{ project.projectManager || 'Unassigned' }}</dd></div>
            <div><dt class="text-slate-500">Superintendent</dt><dd class="font-bold">{{ project.superintendent || 'Unassigned' }}</dd></div>
            <div><dt class="text-slate-500">Customer</dt><dd class="font-bold">{{ project.customer }}</dd></div>
          </dl>
        </div>
      }

      @if (view === 'certified-payroll-setup') {
        <app-certified-payroll-tab [project]="project" />
      }

      @if (view === 'schedule') {
        <app-schedule-tab [project]="project" />
      }

      @if (view === 'issues') {
        <app-issues-tasks-tab [project]="project" />
      }

      @if (view === 'files') {
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="font-bold text-slate-900">Drive Files</h3>
            <button type="button" (click)="refreshFiles.emit()" class="text-sm font-semibold text-slate-600">Refresh</button>
          </div>
          @if (loadingFiles) {
            <p class="p-8 text-center text-slate-500">Loading...</p>
          } @else if (driveError) {
            <p class="p-8 text-center text-red-600">{{ driveError }}</p>
          } @else if (!project.driveFolderId) {
            <p class="p-8 text-center text-slate-500">Link a Drive folder in Setup first.</p>
          } @else {
            <div class="divide-y divide-slate-100">
              @for (file of driveFiles; track file.id) {
                <a [href]="file.webViewLink" target="_blank" class="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 text-sm">
                  <img [src]="file.iconLink" class="w-4 h-4" alt="">
                  <span class="font-medium text-slate-800">{{ file.name }}</span>
                </a>
              } @empty {
                <p class="p-8 text-center text-slate-400 italic">No files found.</p>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectUtilityPanelComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) view!: UtilityView;
  @Input() driveFiles: DriveFile[] = [];
  @Input() loadingFiles = false;
  @Input() driveError: string | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() editProject = new EventEmitter<void>();
  @Output() saveDrive = new EventEmitter<string>();
  @Output() saveSheet = new EventEmitter<string>();
  @Output() openUtility = new EventEmitter<UtilityView>();
  @Output() refreshFiles = new EventEmitter<void>();

  tempDriveId = '';
  tempSheetId = '';
  driveDirty = signal(false);
  sheetDirty = signal(false);
  formatDate = formatProjectDate;

  title = computed(() => {
    const titles: Record<UtilityView, string> = {
      setup: 'Project Setup',
      'drive-mapping': 'Drive Mapping',
      directory: 'Project Directory',
      'certified-payroll-setup': 'Certified Payroll Setup',
      files: 'Browse Drive Files',
      schedule: 'Schedule',
      issues: 'Issues & Tasks',
    };
    return titles[this.view] ?? 'Utility';
  });
}
