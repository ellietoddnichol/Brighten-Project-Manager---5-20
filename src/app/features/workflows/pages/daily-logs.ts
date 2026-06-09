import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { DataService } from '@core/services/data.service';
import { resolveProjectLabel } from '@shared/utils/project';

@Component({
  selector: 'app-daily-logs',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderComponent, HiddenModuleBannerComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto">
      <app-hidden-module-banner moduleId="daily-logs" />
      <app-page-header title="Daily Logs" subtitle="Field reports and daily job history." />
      <div class="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
            <th class="px-5 py-3 text-left">Date</th><th class="px-5 py-3 text-left">Project</th>
            <th class="px-5 py-3 text-left">Foreman</th><th class="px-5 py-3 text-left">Work</th><th class="px-5 py-3 text-left">Change?</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            @for (log of sortedLogs(); track log.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-5 py-3"><a [routerLink]="['/projects', log.projectId]" [queryParams]="{ tab: 'daily-logs' }" class="text-blue-600 font-medium">{{ log.logDate }}</a></td>
                <td class="px-5 py-3">{{ projectLabel(log.projectId) }}</td>
                <td class="px-5 py-3">{{ log.foreman || log.submittedBy || '—' }}</td>
                <td class="px-5 py-3 max-w-md truncate">{{ log.workPerformed || '—' }}</td>
                <td class="px-5 py-3">{{ log.potentialChange ? 'Yes' : '—' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-5 py-12 text-center text-slate-400 italic">No daily logs yet</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DailyLogs {
  private data = inject(DataService);
  projects = toSignal(this.data.getProjects(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });

  sortedLogs = computed(() => [...this.logs()].sort((a, b) => b.logDate.localeCompare(a.logDate)));

  projectLabel(projectId: string): string {
    return resolveProjectLabel(this.projects(), { projectId });
  }
}
