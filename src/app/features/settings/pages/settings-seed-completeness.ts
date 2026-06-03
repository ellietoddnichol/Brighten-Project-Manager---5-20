import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { Project } from '@app/models/types';
import { SeedCompletenessStatus } from '@app/models/project-lifecycle.types';
import { downloadCsv } from '@shared/utils/csv-export';
import { isOverheadJob } from '@shared/utils/project';
import { setupStatusLabel } from '@shared/utils/settings-hub.compute';

@Component({
  selector: 'app-settings-seed-completeness',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section id="setup-completeness" class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-6">
      <span id="seed-completeness" class="sr-only"></span>
      <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 class="text-xl font-bold mb-2">Setup Completeness</h2>
          <p class="text-sm text-slate-500 font-medium">
            Review missing job setup fields from real project and source data. Informational — does not block app usage.
          </p>
        </div>
        <button type="button" (click)="exportCsv()"
                class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-semibold">
          Export CSV
        </button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        @for (card of summaryCards(); track card.label) {
          <div class="bg-slate-50 p-4 rounded-xl border">
            <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
            <p class="text-xl font-bold">{{ card.value }}</p>
          </div>
        }
      </div>

      <div class="flex flex-wrap gap-3 mb-4">
        <select [(ngModel)]="statusFilter" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All statuses</option>
          @for (status of statusOptions; track status) {
            <option [value]="status">{{ status }}</option>
          }
        </select>
        <select [(ngModel)]="groupFilter" class="px-3 py-2 border rounded-lg text-sm">
          <option value="">All lifecycle groups</option>
          @for (group of groupOptions; track group) {
            <option [value]="group">{{ group }}</option>
          }
        </select>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" [(ngModel)]="gapsOnly"> Missing fields only
        </label>
      </div>

      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-sm min-w-[1100px]">
          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 tracking-widest font-bold">
            <tr>
              <th class="px-4 py-3 text-left">Job</th>
              <th class="px-4 py-3 text-left">Customer</th>
              <th class="px-4 py-3 text-left">Lifecycle</th>
              <th class="px-4 py-3 text-left">Setup Status</th>
              <th class="px-4 py-3 text-left">Missing Fields</th>
              <th class="px-4 py-3 text-left">WIP</th>
              <th class="px-4 py-3 text-left">Drive</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (row of filteredRows(); track row.project.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-4 py-3">
                  <a [routerLink]="['/projects', row.project.id]" class="text-blue-600 font-semibold">
                    #{{ row.project.projectNumber }}
                  </a>
                  <div class="text-slate-600">{{ row.project.projectName }}</div>
                </td>
                <td class="px-4 py-3">{{ row.project.customer || '—' }}</td>
                <td class="px-4 py-3">{{ row.snapshot.projectLifecycleGroup }}</td>
                <td class="px-4 py-3">
                  <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
                        [class.bg-emerald-100]="row.snapshot.seedCompletenessStatus === 'Complete'"
                        [class.text-emerald-800]="row.snapshot.seedCompletenessStatus === 'Complete'"
                        [class.bg-amber-100]="row.snapshot.seedCompletenessStatus !== 'Complete'"
                        [class.text-amber-800]="row.snapshot.seedCompletenessStatus !== 'Complete'">
                    {{ setupStatusLabel(row.snapshot.seedCompletenessStatus) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-slate-600">
                  @if (row.snapshot.seedGaps.length) {
                    {{ gapLabels(row.snapshot.seedGaps) }}
                  } @else {
                    Complete
                  }
                </td>
                <td class="px-4 py-3">{{ row.snapshot.includeInActiveWip ? 'Active WIP' : 'Excluded' }}</td>
                <td class="px-4 py-3">
                  @if (row.project.driveFolderId || row.project.driveFolderUrl) {
                    Linked
                  } @else {
                    Not linked
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="px-4 py-10 text-center text-slate-400 italic">No projects match filters.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class SettingsSeedCompleteness {
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);

  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });

  statusFilter = '';
  groupFilter = '';
  gapsOnly = false;

  readonly setupStatusLabel = setupStatusLabel;

  statusOptions: SeedCompletenessStatus[] = [
    'Complete', 'MissingFinancials', 'MissingDrive', 'MissingStatus', 'MissingCustomer', 'NeedsReview',
  ];

  groupOptions = ['Active', 'Upcoming', 'Closeout', 'Closed2026', 'Archive', 'NeedsReview'];

  rows = computed(() =>
    (this.projects() ?? [])
      .filter(p => !isOverheadJob(p))
      .map(project => ({
        project,
        snapshot: this.lifecycle.forProject(project),
      })),
  );

  filteredRows = computed(() =>
    this.rows().filter(row => {
      if (this.statusFilter && row.snapshot.seedCompletenessStatus !== this.statusFilter) return false;
      if (this.groupFilter && row.snapshot.projectLifecycleGroup !== this.groupFilter) return false;
      if (this.gapsOnly && !row.snapshot.seedGaps.length) return false;
      return true;
    }),
  );

  summaryCards = computed(() => {
    const rows = this.rows();
    const complete = rows.filter(r => r.snapshot.seedCompletenessStatus === 'Complete').length;
    const missingDrive = rows.filter(r => r.snapshot.seedGaps.some(g => g.field === 'driveFolderId')).length;
    const missingFinancials = rows.filter(r => r.snapshot.seedCompletenessStatus === 'MissingFinancials').length;
    const needsReview = rows.filter(r => r.snapshot.projectLifecycleGroup === 'NeedsReview').length;
    return [
      { label: 'Projects', value: String(rows.length) },
      { label: 'Complete', value: String(complete) },
      { label: 'Missing Drive Link', value: String(missingDrive) },
      { label: 'Missing Financials', value: String(missingFinancials) },
      { label: 'Needs Review', value: String(needsReview) },
    ];
  });

  gapLabels(gaps: { label: string }[]): string {
    return gaps.length ? gaps.map(g => g.label).join(', ') : 'Complete';
  }

  exportCsv(): void {
    const rows = this.filteredRows().map(r => [
      r.project.projectNumber,
      r.project.projectName,
      r.project.customer ?? '',
      r.snapshot.projectLifecycleGroup,
      r.snapshot.seedCompletenessStatus,
      r.snapshot.seedGaps.map(g => g.label).join('; '),
      r.snapshot.includeInActiveWip ? 'Yes' : 'No',
      r.project.driveFolderId ? 'Linked' : 'Not linked',
    ]);
    downloadCsv(
      'setup-completeness.csv',
      ['Job', 'Project', 'Customer', 'Lifecycle Group', 'Setup Status', 'Missing Fields', 'WIP Included', 'Drive'],
      rows,
    );
  }
}
