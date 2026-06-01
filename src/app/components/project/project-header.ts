import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '../../models/types';
import { NewItemAction, UtilityView } from './project-detail.types';
import { ProjectMoreMenuComponent } from './project-more-menu';

@Component({
  selector: 'app-project-header',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ProjectMoreMenuComponent],
  template: `
    <header class="bg-white border-b border-slate-200 px-6 py-5">
      <div class="flex flex-wrap justify-between items-start gap-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <a routerLink="/projects"
               class="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest">
              <mat-icon class="!text-[14px]">arrow_back</mat-icon> Back
            </a>
            <span class="text-slate-300">·</span>
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">#{{ project?.projectNumber }}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
              {{ project?.status }}
            </span>
          </div>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">{{ project?.projectName }}</h1>
          <p class="text-sm text-slate-500 mt-1">
            {{ project?.customer }}
            @if (project?.address) {
              <span class="text-slate-300 mx-1">·</span>{{ project?.address }}
            }
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          @if (project?.driveFolderUrl || project?.driveFolderId) {
            <a [href]="project?.driveFolderUrl" target="_blank" rel="noopener"
               class="bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg font-semibold hover:bg-slate-100 transition-all text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px]">folder_shared</mat-icon> Drive
            </a>
          }
          <button type="button" (click)="edit.emit()"
                  class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-semibold hover:bg-slate-50 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px]">edit</mat-icon> Edit
          </button>
          <div class="relative">
            <button type="button" (click)="newMenuOpen.set(!newMenuOpen())"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
              <mat-icon class="!text-[18px]">add</mat-icon> New Item
              <mat-icon class="!text-[16px]">{{ newMenuOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
            @if (newMenuOpen()) {
              <div class="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-30 py-1">
                @for (item of newItems; track item.id) {
                  <button type="button" (click)="selectNewItem(item)"
                          class="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                    <mat-icon class="!text-[18px] text-slate-400">{{ item.icon }}</mat-icon>
                    {{ item.label }}
                  </button>
                }
              </div>
            }
          </div>
          <app-project-more-menu (utilitySelect)="moreSelect.emit($event)" />
        </div>
      </div>
    </header>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectHeaderComponent {
  @Input({ required: true }) project!: Project | undefined;
  @Output() edit = new EventEmitter<void>();
  @Output() newItem = new EventEmitter<NewItemAction>();
  @Output() moreSelect = new EventEmitter<UtilityView>();

  newMenuOpen = signal(false);

  readonly newItems: NewItemAction[] = [
    { id: 'change-request', label: 'Change Request', icon: 'sync_alt', section: 'workflows', view: 'changes' },
    { id: 'rfi', label: 'RFI', icon: 'help_outline', section: 'workflows', view: 'rfis' },
    { id: 'submittal', label: 'Submittal', icon: 'inventory_2', section: 'workflows', view: 'submittals' },
    { id: 'daily-log', label: 'Daily Log', icon: 'today', section: 'workflows', view: 'daily-logs' },
    { id: 'field-issue', label: 'Field Issue', icon: 'report_problem', section: 'workflows', view: 'field-issues' },
    { id: 'pay-app', label: 'Pay App', icon: 'request_quote', section: 'financials', view: 'billing' },
    { id: 'po', label: 'PO', icon: 'shopping_cart', section: 'financials', view: 'pos' },
    { id: 'cpr-week', label: 'Certified Payroll Week', icon: 'gavel', section: 'workflows', view: 'certified-payroll' },
    { id: 'upload-doc', label: 'Upload Document', icon: 'upload_file', section: 'documents' },
  ];

  selectNewItem(item: NewItemAction): void {
    this.newMenuOpen.set(false);
    this.newItem.emit(item);
  }
}
