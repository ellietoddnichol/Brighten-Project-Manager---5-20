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
    <nav class="flex gap-0 overflow-x-auto whitespace-nowrap border-b border-slate-200 bg-white sticky top-0 z-10">
      @for (item of items; track item.id) {
        <button type="button"
                (click)="sectionChange.emit(item.id)"
                class="px-4 py-2.5 text-sm font-semibold transition-colors shrink-0 border-b-2"
                [class.border-b-indigo-500]="active === item.id"
                [class.text-indigo-700]="active === item.id"
                [class.border-b-transparent]="active !== item.id"
                [class.text-slate-500]="active !== item.id"
                [class.hover:text-slate-900]="active !== item.id">
          <span class="flex items-center gap-1.5">
            <mat-icon class="!text-[16px]">{{ item.icon }}</mat-icon>
            {{ item.label }}
          </span>
        </button>
      }
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
