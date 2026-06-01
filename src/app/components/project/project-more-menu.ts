import { Component, ChangeDetectionStrategy, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { UtilityView } from './project-detail.types';

interface MoreItem {
  id: UtilityView;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-project-more-menu',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="relative">
      <button type="button" (click)="open.set(!open())"
              class="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-lg font-semibold hover:bg-slate-50 transition-all text-sm flex items-center gap-2">
        <mat-icon class="!text-[18px]">more_horiz</mat-icon> More
      </button>
      @if (open()) {
        <div class="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-slate-200 shadow-xl z-40 py-2">
          <p class="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Admin &amp; Setup</p>
          @for (item of items; track item.id) {
            <button type="button" (click)="select(item.id)"
                    class="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
              <mat-icon class="!text-[18px] text-slate-400 mt-0.5">{{ item.icon }}</mat-icon>
              <div>
                <p class="text-sm font-semibold text-slate-900">{{ item.label }}</p>
                <p class="text-xs text-slate-500">{{ item.description }}</p>
              </div>
            </button>
          }
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectMoreMenuComponent {
  @Output() utilitySelect = new EventEmitter<UtilityView>();

  open = signal(false);

  readonly items: MoreItem[] = [
    { id: 'drive-mapping', label: 'Drive Mapping', icon: 'folder_special', description: 'Link workflow folders' },
    { id: 'setup', label: 'Project Setup', icon: 'settings', description: 'Details, integrations, sync' },
    { id: 'directory', label: 'Project Directory', icon: 'contacts', description: 'Key contacts & team' },
    { id: 'certified-payroll-setup', label: 'Certified Payroll Setup', icon: 'gavel', description: 'Compliance configuration' },
    { id: 'files', label: 'Browse Drive Files', icon: 'folder', description: 'Raw folder listing' },
    { id: 'schedule', label: 'Schedule', icon: 'calendar_month', description: 'Milestones & timeline' },
  ];

  select(id: UtilityView): void {
    this.open.set(false);
    this.utilitySelect.emit(id);
  }
}
