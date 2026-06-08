import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService } from '@core/services/data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { Project } from '@app/models/types';
import {
  REVIEW_CENTER_FILTERS,
  ReviewCenterFilterId,
  buildReviewCenterItems,
  countReviewCenterByFilter,
  filterReviewCenterItems,
} from '@shared/utils/review-center.compute';
import { SettingsSeedCompleteness } from './settings-seed-completeness';
import { SettingsImportReview } from './settings-import-review';

@Component({
  selector: 'app-settings-review-center',
  standalone: true,
  imports: [CommonModule, RouterLink, SettingsSeedCompleteness, SettingsImportReview],
  template: `
    <section id="review-center" class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Review Center</h2>
        <p class="text-sm text-slate-500 mt-1 max-w-3xl">
          One place for exceptions — missing setup, billing review, data conflicts, and compliance items for later.
          Wage orders and not-started billing jobs do not block completion.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        @for (f of filters; track f.id) {
          <button type="button" (click)="activeFilter.set(f.id)"
                  class="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
                  [class.bg-slate-900]="activeFilter() === f.id"
                  [class.text-white]="activeFilter() === f.id"
                  [class.border-slate-900]="activeFilter() === f.id"
                  [class.hover:bg-slate-800]="activeFilter() === f.id"
                  [class.bg-white]="activeFilter() !== f.id"
                  [class.text-slate-700]="activeFilter() !== f.id"
                  [class.border-slate-200]="activeFilter() !== f.id">
            {{ f.label }}
            @if (filterCounts()[f.id]; as count) {
              <span class="ml-1 opacity-80">({{ count }})</span>
            }
          </button>
        }
      </div>

      @if (filteredItems().length) {
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          @for (item of filteredItems(); track item.id) {
            <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  @if (item.jobNumber) {
                    <span class="text-xs font-mono font-bold text-slate-500">J{{ item.jobNumber }}</span>
                  }
                  <span class="text-sm font-semibold text-slate-900">{{ item.title }}</span>
                  <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                        [class.bg-rose-50]="item.severity === 'error'"
                        [class.text-rose-800]="item.severity === 'error'"
                        [class.bg-amber-50]="item.severity === 'warning'"
                        [class.text-amber-800]="item.severity === 'warning'"
                        [class.bg-slate-100]="item.severity === 'info'"
                        [class.text-slate-600]="item.severity === 'info'">
                    {{ item.severity }}
                  </span>
                </div>
                @if (item.projectName) {
                  <p class="text-xs text-slate-500">{{ item.projectName }}</p>
                }
                <p class="text-xs text-slate-600 mt-0.5">{{ item.detail }}</p>
              </div>
              @if (item.route) {
                <a [routerLink]="item.route" [queryParams]="item.queryParams"
                   class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">
                  Open
                </a>
              }
            </div>
          }
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-emerald-200 bg-emerald-50/50 px-5 py-8 text-center">
          <p class="text-sm font-semibold text-emerald-900">Nothing needs review in this filter.</p>
          <p class="text-xs text-emerald-800/80 mt-1">Job setup lives in the app — no bulk sync required for daily use.</p>
        </div>
      }

      @if (activeFilter() === 'missingSetup' || activeFilter() === 'all') {
        <details class="bg-white rounded-xl border border-slate-200 shadow-sm" [open]="activeFilter() === 'missingSetup'">
          <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">Setup completeness table</summary>
          <div class="px-2 pb-4">
            <app-settings-seed-completeness />
          </div>
        </details>
      }

      @if (activeFilter() === 'syncErrors' || activeFilter() === 'dataConflict' || activeFilter() === 'billingReview') {
        <details class="bg-white rounded-xl border border-slate-200 shadow-sm" [open]="true">
          <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">Import exceptions & run log</summary>
          <div class="px-2 pb-4">
            <app-settings-import-review [compactMode]="true" />
          </div>
        </details>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsReviewCenterComponent {
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private importReview = inject(ImportReviewService);

  readonly filters = REVIEW_CENTER_FILTERS;
  activeFilter = signal<ReviewCenterFilterId>('all');

  private projects = computed(() => this.data.projectsSnapshot());

  allItems = computed(() => buildReviewCenterItems({
    projects: this.projects(),
    lifecycleFor: (p: Project) => this.lifecycle.forProject(p),
    importExceptions: this.importReview.exceptions(),
  }));

  filteredItems = computed(() => filterReviewCenterItems(this.allItems(), this.activeFilter()));

  filterCounts = computed(() => countReviewCenterByFilter(this.allItems()));
}
