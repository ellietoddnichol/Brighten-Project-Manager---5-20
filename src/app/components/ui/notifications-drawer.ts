import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GlobalNeedsService } from '@core/services/global-needs.service';

@Component({
  selector: 'app-notifications-drawer',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <!-- Overlay backdrop -->
    <div class="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
         [class.opacity-0]="!open"
         [class.pointer-events-none]="!open"
         [class.opacity-100]="open"
         (click)="close.emit()"></div>

    <!-- Drawer panel -->
    <aside class="fixed top-0 right-0 bottom-0 z-50 w-[380px] bg-white shadow-2xl flex flex-col transition-transform duration-200"
           [class.translate-x-full]="!open"
           [class.translate-x-0]="open">

      <!-- Header -->
      <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-2">
          <mat-icon class="!text-[20px] text-slate-700">notifications</mat-icon>
          <h2 class="text-base font-bold text-slate-900">Alerts &amp; Actions</h2>
          @if (needs().length) {
            <span class="text-xs font-bold text-white bg-rose-500 px-2 py-0.5 rounded-full">{{ needs().length }}</span>
          }
        </div>
        <button type="button" (click)="close.emit()"
                class="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100">
          <mat-icon class="!text-[20px]">close</mat-icon>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        @if (!needs().length) {
          <div class="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div class="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <mat-icon class="!text-[36px] text-emerald-500">check_circle</mat-icon>
            </div>
            <div>
              <div class="text-base font-semibold text-slate-900">All clear</div>
              <div class="text-sm text-slate-500 mt-1">No alerts or action items right now.</div>
            </div>
          </div>
        } @else {
          <div class="divide-y divide-slate-100">
            @for (item of needs(); track item.id) {
              <div class="px-5 py-4 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                <!-- Icon -->
                <div class="shrink-0 mt-0.5">
                  @if (item.severity === 'error') {
                    <mat-icon class="!text-[20px] text-rose-500">warning</mat-icon>
                  } @else {
                    <mat-icon class="!text-[20px] text-amber-500">info</mat-icon>
                  }
                </div>
                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-slate-900 leading-snug">
                    {{ item.projectName || item.issue || 'Action Required' }}
                  </div>
                  @if (item.projectName && item.issue) {
                    <div class="text-xs text-slate-500 mt-0.5 leading-snug">{{ item.issue }}</div>
                  }
                  @if (item.nextActionLabel) {
                    <div class="text-xs text-slate-400 mt-1">{{ item.nextActionLabel }}</div>
                  }
                </div>
                <!-- Go to button -->
                @if (item.route) {
                  <button type="button"
                          (click)="navigate(item)"
                          class="shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                    Go to
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsDrawerComponent {
  @Input() open = false;
  @Output() close = new EventEmitter<void>();

  private globalNeeds = inject(GlobalNeedsService);
  private router = inject(Router);

  needs = computed(() => {
    const rows = this.globalNeeds.active2026Rows();
    const items: Array<{
      id: string;
      severity: 'error' | 'warning';
      projectName?: string;
      issue: string;
      nextActionLabel?: string;
      route?: string;
      queryParams?: Record<string, string>;
      fragment?: string;
    }> = [];

    for (const row of rows) {
      if (row.arBalance > 0) {
        items.push({
          id: `ar-${row.projectId}`,
          severity: 'warning',
          projectName: row.projectName,
          issue: `Open A/R: $${row.arBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
          nextActionLabel: 'Collect outstanding invoice',
          route: '/ar',
        });
      }
      if (row.needsReview || row.missingItemCount > 0 || row.reviewFlags?.length > 0) {
        items.push({
          id: `review-${row.projectId}`,
          severity: 'error',
          projectName: row.projectName,
          issue: row.reviewFlags?.length ? row.reviewFlags[0] : 'Billing review needed',
          nextActionLabel: row.nextAction?.label,
          route: row.nextAction?.route ?? `/projects/${row.projectId}`,
          queryParams: row.nextAction?.queryParams as Record<string, string> | undefined,
          fragment: row.nextAction?.fragment,
        });
      }
    }

    return items.slice(0, 30);
  });

  navigate(item: { route?: string; queryParams?: Record<string, string>; fragment?: string }): void {
    if (!item.route) return;
    void this.router.navigate([item.route], {
      queryParams: item.queryParams,
      fragment: item.fragment,
    });
    this.close.emit();
  }
}
