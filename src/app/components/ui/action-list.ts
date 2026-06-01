import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface ActionListItem {
  id: string;
  title: string;
  description: string;
  projectName?: string;
  projectId?: string;
  severity: 'warning' | 'error';
}

@Component({
  selector: 'app-action-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  template: `
    <div class="divide-y divide-slate-100">
      @for (item of items; track item.id) {
        @if (item.projectId) {
          <a [routerLink]="['/projects', item.projectId]" class="block px-5 py-4 hover:bg-slate-50 transition-colors">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
          </a>
        } @else {
          <div class="px-5 py-4">
            <ng-container *ngTemplateOutlet="row; context: { $implicit: item }" />
          </div>
        }
      } @empty {
        <div class="px-5 py-10 text-center">
          <mat-icon class="text-emerald-500 mb-2">check_circle</mat-icon>
          <p class="text-sm font-medium text-slate-700">{{ emptyTitle }}</p>
          <p class="text-xs text-slate-500 mt-1">{{ emptySubtitle }}</p>
        </div>
      }
    </div>

    <ng-template #row let-item>
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
             [class.bg-rose-100]="item.severity === 'error'"
             [class.text-rose-600]="item.severity === 'error'"
             [class.bg-amber-100]="item.severity === 'warning'"
             [class.text-amber-600]="item.severity === 'warning'">
          <mat-icon class="!text-[18px]">{{ item.severity === 'error' ? 'error' : 'warning' }}</mat-icon>
        </div>
        <div class="min-w-0">
          <div class="font-bold text-sm text-slate-900">{{ item.title }}</div>
          <div class="text-xs text-slate-500 mt-0.5">{{ item.description }}</div>
          @if (item.projectName) {
            <div class="text-[10px] font-bold text-blue-600 mt-1 uppercase tracking-wide">{{ item.projectName }}</div>
          }
        </div>
      </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionListComponent {
  @Input({ required: true }) items: ActionListItem[] = [];
  @Input() emptyTitle = 'All caught up';
  @Input() emptySubtitle = 'No items need attention';
}
