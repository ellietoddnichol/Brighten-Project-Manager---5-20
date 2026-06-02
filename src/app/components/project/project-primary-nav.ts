import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectPrimarySection } from './project-detail.types';

interface PrimaryNavItem {
  id: ProjectPrimarySection;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-project-primary-nav',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <nav class="px-6 py-4 bg-slate-50/80 border-b border-slate-200">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl">
        @for (item of items; track item.id) {
          <button type="button"
                  (click)="sectionChange.emit(item.id)"
                  [class.ring-2]="active === item.id"
                  [class.ring-slate-900]="active === item.id"
                  [class.bg-white]="active === item.id"
                  [class.shadow-sm]="active === item.id"
                  [class.bg-white/60]="active !== item.id"
                  class="text-left rounded-xl border border-slate-200 p-4 transition-all hover:bg-white hover:shadow-sm">
            <div class="flex items-center gap-2 mb-1">
              <mat-icon class="!text-[20px] text-slate-500">{{ item.icon }}</mat-icon>
              <span class="font-bold text-slate-900 text-sm">{{ item.label }}</span>
            </div>
            <p class="text-xs text-slate-500 leading-snug">{{ item.description }}</p>
          </button>
        }
      </div>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPrimaryNavComponent {
  @Input({ required: true }) active!: ProjectPrimarySection;
  @Output() sectionChange = new EventEmitter<ProjectPrimarySection>();

  readonly items: PrimaryNavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard', description: 'Status, margin, next action' },
    { id: 'workflows', label: 'Work', icon: 'construction', description: 'Tasks, changes, field work' },
    { id: 'financials', label: 'Money', icon: 'account_balance', description: 'Budget, billing, purchase orders' },
    { id: 'documents', label: 'Files', icon: 'folder_open', description: 'Documents and Drive' },
  ];
}
