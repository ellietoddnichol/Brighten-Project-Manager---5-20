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
import { ProjectRecordPanelComponent } from './project-record-panel';
import { DriveFile } from '../../services/drive.service';
import { formatProjectDate } from '../../utils/project';

@Component({
  selector: 'app-project-utility-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    DriveMappingTabComponent, ScheduleTabComponent, IssuesTasksTabComponent, CertifiedPayrollTabComponent,
    ProjectRecordPanelComponent,
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
        <app-project-record-panel
          [project]="project"
          (saveDrive)="saveDrive.emit($event)"
          (saveSheet)="saveSheet.emit($event)"
          (openUtility)="openUtility.emit($event)" />
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
      setup: 'Job Record',
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
