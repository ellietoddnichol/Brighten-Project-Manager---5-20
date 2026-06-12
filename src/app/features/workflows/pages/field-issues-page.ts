import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { isFieldIssueOpen } from '@shared/utils/construction-operations';

@Component({
  selector: 'app-field-issues-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HiddenModuleBannerComponent, PageHeaderComponent, StatCardComponent, StatusChipComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-hidden-module-banner moduleId="field-issues" />

      <app-page-header
        title="Field Issues"
        subtitle="Quick-capture field issues across all active projects" />

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <app-stat-card label="Open Issues" [value]="metrics().open" icon="warning" />
        <app-stat-card label="High Priority" [value]="metrics().highPriority" icon="priority_high" />
        <app-stat-card label="Potential Changes" [value]="metrics().potentialChanges" icon="change_circle" />
        <app-stat-card label="Resolved This Month" [value]="metrics().resolvedThisMonth" icon="check_circle" />
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <select [(ngModel)]="priorityFilter" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All priorities</option>
          <option value="High">High</option>
          <option value="Normal">Normal</option>
          <option value="Low">Low</option>
        </select>
        <select [(ngModel)]="typeFilter" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
          <option value="">All types</option>
          @for (t of issueTypes(); track t) {
            <option [value]="t">{{ t }}</option>
          }
        </select>
        <input [(ngModel)]="searchQuery" placeholder="Search by project or title…"
               class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[220px]" />
        @if (priorityFilter || typeFilter || searchQuery) {
          <button type="button" (click)="clearFilters()"
                  class="text-sm text-slate-500 hover:text-slate-900 px-2 py-2">
            Clear filters
          </button>
        }
        <span class="ml-auto text-xs text-slate-400">{{ filteredIssues().length }} issue{{ filteredIssues().length === 1 ? '' : 's' }}</span>
      </div>

      <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase text-slate-400 border-b border-slate-200 bg-slate-50">
              <th class="px-5 py-3 text-left">Project</th>
              <th class="px-5 py-3 text-left">Title</th>
              <th class="px-5 py-3 text-left">Type</th>
              <th class="px-5 py-3 text-left">Priority</th>
              <th class="px-5 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (issue of filteredIssues(); track issue.id) {
              <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-5 py-3">
                  <a [routerLink]="['/projects', issue.projectId]" [queryParams]="{ tab: 'field-issues' }"
                     class="text-indigo-700 font-semibold hover:underline text-xs font-mono">
                    {{ issue.projectNumber || issue.projectName || issue.projectId }}
                  </a>
                </td>
                <td class="px-5 py-3 font-medium text-slate-900">{{ issue.title }}</td>
                <td class="px-5 py-3 text-slate-500">{{ issue.issueType || '—' }}</td>
                <td class="px-5 py-3">
                  <app-status-chip [tone]="priorityTone(issue.priority)" [label]="issue.priority || 'Normal'" />
                </td>
                <td class="px-5 py-3">
                  <app-status-chip [tone]="statusTone(issue.status)" [label]="issue.status" />
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="px-5 py-12 text-center text-slate-400 italic">
                  No open field issues{{ priorityFilter || typeFilter || searchQuery ? ' matching filters' : '' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export class FieldIssuesPage {
  private data = inject(DataService);

  issues = toSignal(this.data.getFieldIssues(), { initialValue: [] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });

  priorityFilter = '';
  typeFilter = '';
  searchQuery = '';

  openIssues = computed(() => this.issues().filter(isFieldIssueOpen));

  issueTypes = computed(() =>
    [...new Set(this.issues().map(i => i.issueType).filter(Boolean) as string[])].sort(),
  );

  filteredIssues = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    const pf = this.priorityFilter;
    const tf = this.typeFilter;
    return this.openIssues().filter(issue => {
      if (pf && (issue.priority || 'Normal') !== pf) return false;
      if (tf && issue.issueType !== tf) return false;
      if (q) {
        const hay = `${issue.projectNumber ?? ''} ${issue.projectName ?? ''} ${issue.title ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  });

  metrics = computed(() => {
    const open = this.openIssues();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const resolvedThisMonth = this.issues().filter(i => {
      if (isFieldIssueOpen(i)) return false;
      const updated = i.updatedAt ? new Date(i.updatedAt as string) : null;
      return updated && updated >= startOfMonth;
    }).length;
    return {
      open: open.length,
      highPriority: open.filter(i => i.priority === 'High').length,
      potentialChanges: this.logs().filter(l => l.potentialChange && !l.linkedChangeRequestId).length,
      resolvedThisMonth,
    };
  });

  clearFilters(): void {
    this.priorityFilter = '';
    this.typeFilter = '';
    this.searchQuery = '';
  }

  priorityTone(priority: string | undefined): StatusTone {
    if (priority === 'High') return 'red';
    if (priority === 'Low') return 'slate';
    return 'amber';
  }

  statusTone(status: string | undefined): StatusTone {
    if (!status) return 'slate';
    const s = status.toLowerCase();
    if (s.includes('resolv') || s.includes('closed') || s.includes('complete')) return 'green';
    if (s.includes('review') || s.includes('pending')) return 'amber';
    if (s.includes('open')) return 'orange';
    return 'slate';
  }
}
