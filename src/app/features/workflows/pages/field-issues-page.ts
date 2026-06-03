import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { computeConstructionOpsMetrics, isFieldIssueOpen } from '@shared/utils/construction-operations';

@Component({
  selector: 'app-field-issues-page',
  standalone: true,
  imports: [CommonModule, RouterLink, HiddenModuleBannerComponent],
  template: `
    <div class="p-8 max-w-7xl mx-auto space-y-6">
      <app-hidden-module-banner moduleId="field-issues" />
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Field Issues</h1>
        <p class="text-slate-500 text-sm mt-1">Quick-capture field issues across all projects</p>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open issues</p>
          <p class="text-2xl font-bold">{{ portfolioMetrics().fieldIssuesOpenCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Potential changes</p>
          <p class="text-2xl font-bold text-orange-600">{{ portfolioMetrics().potentialChangesCount }}</p>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="text-[10px] uppercase text-slate-400 border-b">
            <th class="px-5 py-3 text-left">Project</th><th class="px-5 py-3 text-left">Title</th>
            <th class="px-5 py-3 text-left">Type</th><th class="px-5 py-3 text-left">Priority</th><th class="px-5 py-3 text-left">Status</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-100">
            @for (issue of openIssues(); track issue.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-5 py-3">
                  <a [routerLink]="['/projects', issue.projectId]" [queryParams]="{ tab: 'field-issues' }" class="text-blue-600 font-medium">
                    {{ issue.projectNumber || issue.projectName || issue.projectId }}
                  </a>
                </td>
                <td class="px-5 py-3">{{ issue.title }}</td>
                <td class="px-5 py-3">{{ issue.issueType || '—' }}</td>
                <td class="px-5 py-3">{{ issue.priority || 'Normal' }}</td>
                <td class="px-5 py-3">{{ issue.status }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-5 py-12 text-center text-slate-400 italic">No open field issues</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class FieldIssuesPage {
  private data = inject(DataService);

  issues = toSignal(this.data.getFieldIssues(), { initialValue: [] });
  rfis = toSignal(this.data.getRfis(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });

  openIssues = computed(() => this.issues().filter(isFieldIssueOpen));

  portfolioMetrics = computed(() => {
    let open = 0;
    let potential = 0;
    for (const issue of this.issues()) {
      if (isFieldIssueOpen(issue)) open++;
    }
    potential = this.logs().filter(l => l.potentialChange && !l.linkedChangeRequestId).length;
    return { fieldIssuesOpenCount: open, potentialChangesCount: potential };
  });
}
