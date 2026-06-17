import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '@app/models/types';
import { NewItemAction, UtilityView } from './project-detail.types';
import { ProjectMoreMenuComponent } from './project-more-menu';

@Component({
  selector: 'app-project-header',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, ProjectMoreMenuComponent],
  template: `
    <header class="bg-slate-950 text-white px-5 py-4 shadow-sm">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-1.5">
            <a routerLink="/projects"
               class="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest">
              <mat-icon class="!text-[14px]">arrow_back</mat-icon> Back
            </a>
            <span class="text-slate-600">·</span>
            <span class="text-xs font-mono font-bold text-slate-400 tracking-widest">#{{ project?.projectNumber }}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white/10 text-slate-100 border border-white/10">
              {{ project?.status }}
            </span>
          </div>
          <h1 class="text-xl font-bold text-white tracking-tight">{{ project?.projectName }}</h1>
          <p class="text-xs text-slate-300 mt-0.5">
            {{ project?.customer }}
            @if (project?.address) {
              <span class="text-slate-600 mx-1">·</span>{{ project?.address }}
            }
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          @if (project?.driveFolderUrl || project?.driveFolderId) {
            <a [href]="project?.driveFolderUrl" target="_blank" rel="noopener"
               class="bg-white/10 text-slate-100 border border-white/10 px-3 py-1.5 rounded-lg font-semibold hover:bg-white/15 transition-colors text-xs flex items-center gap-1.5">
              <mat-icon class="!text-[16px]">folder_shared</mat-icon> Drive
            </a>
          }
          <button type="button" (click)="edit.emit()"
                  class="bg-white text-slate-900 px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-100 transition-colors text-xs flex items-center gap-1.5">
            <mat-icon class="!text-[16px]">edit</mat-icon> Edit
          </button>
          <div class="relative">
            <button type="button" (click)="newMenuOpen.set(!newMenuOpen())"
                    class="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold shadow-sm hover:bg-slate-800 transition-colors text-xs flex items-center gap-1.5">
              <mat-icon class="!text-[16px]">add</mat-icon> New Item
              <mat-icon class="!text-[16px]">{{ newMenuOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
            @if (newMenuOpen()) {
              <div class="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-30 py-1">
                @for (item of newItems; track item.id) {
                  <button type="button" (click)="selectNewItem(item)"
                          class="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2">
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
    { id: 'labor', label: 'Labor Entry', icon: 'schedule', section: 'labor' },
    { id: 'material', label: 'Material Entry', icon: 'inventory', section: 'materials' },
    { id: 'change', label: 'Change', icon: 'sync_alt', section: 'changes' },
    { id: 'todo', label: 'Todo', icon: 'task_alt', section: 'todos' },
    { id: 'upload-doc', label: 'Document Link', icon: 'upload_file', section: 'documents' },
    { id: 'activity', label: 'Activity', icon: 'history', section: 'activities' },
  ];

  selectNewItem(item: NewItemAction): void {
    this.newMenuOpen.set(false);
    this.newItem.emit(item);
  }
}
