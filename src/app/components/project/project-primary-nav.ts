import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectPrimarySection } from './project-detail.types';

interface PrimaryNavItem {
  id: ProjectPrimarySection;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-project-primary-nav',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <nav class="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 pb-1">
      @for (item of visibleItems(); track item.id) {
        <button type="button"
                (click)="sectionChange.emit(item.id)"
                class="px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors shrink-0"
                [class.bg-slate-900]="active === item.id"
                [class.text-white]="active === item.id"
                [class.text-slate-500]="active !== item.id"
                [class.hover:text-slate-900]="active !== item.id"
                [class.hover:bg-slate-50]="active !== item.id">
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
  @Input() showSubs = false;
  @Output() sectionChange = new EventEmitter<ProjectPrimarySection>();

  private readonly baseItems: PrimaryNavItem[] = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'labor', label: 'Labor', icon: 'schedule' },
    { id: 'materials', label: 'Materials', icon: 'inventory_2' },
    { id: 'changes', label: 'Changes', icon: 'sync_alt' },
    { id: 'documents', label: 'Documents', icon: 'folder_open' },
    { id: 'todos', label: 'Todos', icon: 'checklist' },
    { id: 'activities', label: 'Activities', icon: 'history' },
    { id: 'financials', label: 'Financials', icon: 'payments' },
  ];

  visibleItems = computed(() =>
    this.showSubs
      ? [...this.baseItems, { id: 'subs' as const, label: 'Subs', icon: 'engineering' }]
      : this.baseItems,
  );
}
