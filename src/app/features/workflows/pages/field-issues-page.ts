import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { ConstructionOperationsService } from '@features/projects/services/construction-operations.service';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { DetailDrawerComponent } from '@app/components/ui/detail-drawer';
import { FieldIssue, FieldIssueType } from '@app/models/project-controls.types';
import { Project } from '@app/models/types';
import { isFieldIssueOpen } from '@shared/utils/construction-operations';

const ISSUE_TYPES: FieldIssueType[] = [
  'Quality', 'Safety', 'Field Condition', 'Coordination', 'Delay', 'Damage', 'Other',
];

@Component({
  selector: 'app-field-issues-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, HiddenModuleBannerComponent,
    PageHeaderComponent, StatCardComponent, StatusChipComponent, DetailDrawerComponent,
  ],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-hidden-module-banner moduleId="field-issues" />

      <app-page-header
        title="Field Issues"
        subtitle="Quick-capture field issues across all active projects"
        primaryActionLabel="Add Issue"
        (primaryAction)="openNew()" />

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
          <button type="button" (click)="clearFilters()" class="text-sm text-slate-500 hover:text-slate-900 px-2 py-2">Clear filters</button>
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
              <tr class="hover:bg-slate-50 transition-colors cursor-pointer" (click)="openEdit(issue)">
                <td class="px-5 py-3" (click)="$event.stopPropagation()">
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

    <app-detail-drawer [open]="drawerOpen()" [title]="editingId() ? 'Edit Field Issue' : 'New Field Issue'" (close)="closeDrawer()">
      <div class="space-y-4">
        @if (saveError()) {
          <p class="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{{ saveError() }}</p>
        }
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Project</label>
          <select [(ngModel)]="draftProjectId" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="">Select project…</option>
            @for (p of activeProjects(); track p.id) {
              <option [value]="p.id">{{ p.projectNumber }} · {{ p.projectName }}</option>
            }
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Title</label>
          <input [(ngModel)]="draft.title" class="w-full px-3 py-2 border rounded-lg text-sm">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
          <textarea [(ngModel)]="draft.description" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
            <select [(ngModel)]="draft.issueType" class="w-full px-3 py-2 border rounded-lg text-sm">
              @for (t of issueTypeOptions; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Priority</label>
            <select [(ngModel)]="draft.priority" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
            <input [(ngModel)]="draft.location" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Reported by</label>
            <input [(ngModel)]="draft.reportedBy" class="w-full px-3 py-2 border rounded-lg text-sm">
          </div>
        </div>
        @if (editingId()) {
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
            <select [(ngModel)]="draft.status" class="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="Open">Open</option>
              <option value="In Review">In Review</option>
              <option value="Closed">Closed</option>
              <option value="Void">Void</option>
            </select>
          </div>
        }
        <div class="flex flex-wrap gap-2 pt-2">
          <button type="button" (click)="save()" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
          @if (editingId() && draft.status !== 'Void') {
            <button type="button" (click)="closeIssue()" class="border px-4 py-2 rounded-lg text-sm">Close issue</button>
            <button type="button" (click)="voidIssue()" class="border border-rose-200 text-rose-700 px-4 py-2 rounded-lg text-sm">Delete</button>
          }
          <button type="button" (click)="closeDrawer()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
        </div>
      </div>
    </app-detail-drawer>
  `,
})
export class FieldIssuesPage {
  private data = inject(DataService);
  private ops = inject(ConstructionOperationsService);

  issues = toSignal(this.data.getFieldIssues(), { initialValue: [] as FieldIssue[] });
  logs = toSignal(this.data.getDailyLogs(), { initialValue: [] });
  projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });

  priorityFilter = '';
  typeFilter = '';
  searchQuery = '';
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  draftProjectId = '';
  draft: Partial<FieldIssue> = {};
  readonly issueTypeOptions = ISSUE_TYPES;

  activeProjects = computed(() =>
    [...(this.projects() ?? [])]
      .filter(p => p.status !== 'Closed')
      .sort((a, b) => String(a.projectNumber).localeCompare(String(b.projectNumber), undefined, { numeric: true })),
  );

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

  openNew(): void {
    this.editingId.set(null);
    this.draft = { status: 'Open', priority: 'Normal', issueType: 'Other', reportedDate: new Date().toISOString().slice(0, 10) };
    this.draftProjectId = '';
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openEdit(issue: FieldIssue): void {
    this.editingId.set(issue.id);
    this.draft = { ...issue };
    this.draftProjectId = issue.projectId;
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.saveError.set(null);
  }

  async save(): Promise<void> {
    const project = (this.projects() ?? []).find(p => p.id === this.draftProjectId);
    if (!project) {
      this.saveError.set('Select a project.');
      return;
    }
    if (!this.draft.title?.trim()) {
      this.saveError.set('Enter a title.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.ops.saveFieldIssue(project, this.draft, this.editingId());
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save issue.');
    } finally {
      this.saving.set(false);
    }
  }

  async closeIssue(): Promise<void> {
    const issue = this.issues().find(i => i.id === this.editingId());
    if (!issue) return;
    this.saving.set(true);
    try {
      await this.ops.closeFieldIssue(issue);
      this.closeDrawer();
    } finally {
      this.saving.set(false);
    }
  }

  async voidIssue(): Promise<void> {
    const issue = this.issues().find(i => i.id === this.editingId());
    if (!issue || !confirm('Delete this field issue?')) return;
    this.saving.set(true);
    try {
      await this.ops.voidFieldIssue(issue);
      this.closeDrawer();
    } finally {
      this.saving.set(false);
    }
  }

  clearFilters(): void {
    this.priorityFilter = '';
    this.typeFilter = '';
    this.searchQuery = '';
  }

  priorityTone(priority: string | undefined): StatusTone {
    if (priority === 'High' || priority === 'Critical') return 'red';
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
