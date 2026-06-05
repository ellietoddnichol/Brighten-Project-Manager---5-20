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
    <nav class="px-5 bg-white border-b border-slate-200 shadow-sm">
      <div class="flex flex-wrap gap-1">
        @for (item of items; track item.id) {
          <button type="button"
                  (click)="sectionChange.emit(item.id)"
                  [class.text-slate-950]="active === item.id"
                  [class.border-slate-950]="active === item.id"
                  [class.text-slate-500]="active !== item.id"
                  [class.border-transparent]="active !== item.id"
                  class="text-left border-b-2 px-3 py-2 transition-colors hover:text-slate-950">
            <div class="flex items-center gap-1.5">
              <mat-icon class="!text-[16px]">{{ item.icon }}</mat-icon>
              <span class="font-bold text-xs">{{ item.label }}</span>
            </div>
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
    { id: 'overview', label: 'Overview', icon: 'dashboard', description: 'Project profile and scope' },
    { id: 'workflows', label: 'Field Ops', icon: 'construction', description: 'Tasks, RFIs, submittals, and field work' },
    { id: 'financials', label: 'Financials', icon: 'account_balance', description: 'Budget, Pay Apps, A/R, and retainage' },
    { id: 'documents', label: 'Docs & Photos', icon: 'folder_open', description: 'Documents, photos, and Drive' },
  ];
}
