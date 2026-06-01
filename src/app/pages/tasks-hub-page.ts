import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { TASKS_HUB_LINKS } from '../config/global-nav.config';
import { PageHeaderComponent } from '../components/ui/page-header';
import { NavHubCardComponent } from '../components/ui/nav-hub-card';
import { GlobalNeedsService } from '../services/global-needs.service';

@Component({
  selector: 'app-tasks-hub-page',
  standalone: true,
  imports: [PageHeaderComponent, NavHubCardComponent],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-5xl mx-auto">
      <app-page-header
        title="Tasks"
        subtitle="Open work items and changes that need action." />

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        @for (link of links; track link.title) {
          <app-nav-hub-card [link]="link" />
        }
      </div>

      @if (urgentSummary(); as summary) {
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          {{ summary }}
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksHubPage {
  private globalNeeds = inject(GlobalNeedsService);

  readonly links = TASKS_HUB_LINKS;

  urgentSummary = computed(() => {
    const input = this.globalNeeds.needsInput();
    const parts: string[] = [];
    if (input.overdueTaskCount > 0) {
      parts.push(`${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? '' : 's'}`);
    }
    if (input.changesNeedingActionCount > 0) {
      parts.push(`${input.changesNeedingActionCount} change${input.changesNeedingActionCount === 1 ? '' : 's'} needing action`);
    }
    if (!parts.length) return null;
    return parts.join(' · ') + '.';
  });
}
