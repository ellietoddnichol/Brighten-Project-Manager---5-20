import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { ProjectLaborActualService } from '@features/labor/services/project-labor-actual.service';
import { LaborCodeMappingService } from '@features/labor/services/labor-code-mapping.service';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { downloadCsv } from '@shared/utils/csv-export';
import { groupHoursByLaborCode } from '@features/labor/utils/labor-hours-by-code.compute';
import {
  enrichLaborCodeHoursRow,
  filterLaborCodeRows,
  wipEligibleLaborActuals,
} from '@features/labor/utils/labor-code-mapping.compute';
import { LaborCodeFilter } from '@app/models/labor-code-mapping.types';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { HiddenModuleBannerComponent } from '@app/components/layout/hidden-module-banner';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { isWorkCompAuditEnabled, shouldShowWorkCompAudit } from '@app/config/feature-setup.config';

type LaborTab = 'project' | 'employee' | 'week' | 'laborCode' | 'exceptions';

interface LaborGroupRow {
  key: string;
  label: string;
  projectId?: string;
  totalHours: number;
  totalCost: number;
  rowCount: number;
  missingClassification: number;
  missingRate: number;
}

@Component({
  selector: 'app-labor-actuals-page',
  standalone: true,
  imports: [CommonModule, RouterLink, HiddenModuleBannerComponent, PageHeaderComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-hidden-module-banner moduleId="labor-actuals" />
      <app-page-header title="Labor Actuals" subtitle="Approved time logs rolled into project labor cost and budget actuals">
        <button type="button" (click)="exportCsv()" class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
          Export CSV
        </button>
        @if (showWorkCompAudit()) {
          <button type="button" (click)="exportWorkCompAudit()" class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
            Work Comp Audit CSV
          </button>
        }
      </app-page-header>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        @for (card of summaryCards(); track card.label) {
          <div class="bg-white p-4 rounded-xl border shadow-sm">
            <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
            <p class="text-xl font-bold">{{ card.value }}</p>
          </div>
        }
      </div>

      <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        @for (tab of tabs; track tab.id) {
          <button type="button" (click)="activeTab.set(tab.id)"
                  class="px-4 py-2 rounded-t-lg text-sm font-semibold transition-colors shrink-0"
                  [class.bg-slate-900]="activeTab() === tab.id"
                  [class.text-white]="activeTab() === tab.id"
                  [class.text-slate-500]="activeTab() !== tab.id"
                  [class.hover:text-slate-900]="activeTab() !== tab.id"
                  [class.hover:bg-slate-50]="activeTab() !== tab.id">
            {{ tab.label }}
            @if (tab.id === 'exceptions' && exceptionRows().length) {
              <span class="ml-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px]">{{ exceptionRows().length }}</span>
            }
          </button>
        }
      </div>

      @if (activeTab() === 'exceptions') {
        <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div class="px-5 py-3 border-b bg-slate-50 font-bold text-sm">Missing Classification / Rate</div>
          @if (exceptionRows().length) {
            <div class="overflow-x-auto">
              <table class="w-full text-sm min-w-[900px]">
                <thead>
                  <tr class="text-[10px] uppercase text-slate-400 border-b">
                    <th class="px-4 py-3 text-left">Project</th>
                    <th class="px-4 py-3 text-left">Employee</th>
                    <th class="px-4 py-3 text-left">Date</th>
                    <th class="px-4 py-3 text-left">Issue</th>
                    <th class="px-4 py-3 text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of exceptionRows(); track row.id) {
                    <tr class="border-b hover:bg-slate-50 transition-colors">
                      <td class="px-4 py-3">
                        <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'workflows', workflow: 'certified-payroll' }"
                           class="text-indigo-700 font-medium hover:underline">{{ row.projectName || row.jobNumber || '—' }}</a>
                      </td>
                      <td class="px-4 py-3">{{ row.employeeName || '—' }}</td>
                      <td class="px-4 py-3">{{ row.workDate }}</td>
                      <td class="px-4 py-3 text-rose-700">{{ row.issue }}</td>
                      <td class="px-4 py-3 text-right font-numeric">{{ row.totalHours | number:'1.1-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="px-5 py-8 text-sm text-slate-500">No labor actual exceptions.</p>
          }
        </div>
      } @else if (activeTab() === 'laborCode') {
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <label class="text-sm text-slate-600 font-semibold">Filter</label>
          <select [value]="laborCodeFilter()" (change)="onLaborCodeFilterChange($event)"
                  class="px-3 py-2 border border-slate-200 rounded-lg text-sm">
            @for (option of laborCodeFilterOptions; track option.id) {
              <option [value]="option.id">{{ option.label }}</option>
            }
          </select>
        </div>
        <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div class="px-5 py-3 border-b bg-slate-50">
            <div class="font-bold text-sm">Hours by Labor Code</div>
            <p class="text-xs text-slate-500 mt-1">Approved labor actuals with mapped category and WIP/bonus rules</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[1000px]">
              <thead>
                <tr class="text-[10px] uppercase text-slate-400 border-b">
                  <th class="px-4 py-3 text-left">Labor Code</th>
                  <th class="px-4 py-3 text-left">Category</th>
                  <th class="px-4 py-3 text-right">Regular</th>
                  <th class="px-4 py-3 text-right">OT</th>
                  <th class="px-4 py-3 text-right">DT</th>
                  <th class="px-4 py-3 text-right">Total Hrs</th>
                  <th class="px-4 py-3 text-right">Labor Cost</th>
                  <th class="px-4 py-3 text-right">Rows</th>
                </tr>
              </thead>
              <tbody>
                @for (row of laborCodeRows(); track row.laborCode) {
                  <tr class="border-b hover:bg-slate-50"
                      [class.bg-amber-50]="row.unassigned || row.unmapped">
                    <td class="px-4 py-3 font-numeric font-semibold">{{ row.laborCode }}</td>
                    <td class="px-4 py-3">{{ row.categoryLabel || 'Unmapped' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.regularHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.overtimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.doubleTimeHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric font-bold">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.totalCost | currency }}</td>
                    <td class="px-4 py-3 text-right text-slate-500">{{ row.rowCount }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="px-4 py-10 text-center text-slate-400 italic">No labor code breakdown available.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else {
        <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div class="px-5 py-3 border-b bg-slate-50 font-bold text-sm">{{ activeTabLabel() }}</div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[900px]">
              <thead>
                <tr class="text-[10px] uppercase text-slate-400 border-b">
                  <th class="px-4 py-3 text-left">Group</th>
                  <th class="px-4 py-3 text-right">Rows</th>
                  <th class="px-4 py-3 text-right">Hours</th>
                  <th class="px-4 py-3 text-right">Labor Cost</th>
                  <th class="px-4 py-3 text-right">Missing Class</th>
                  <th class="px-4 py-3 text-right">Missing Rate</th>
                </tr>
              </thead>
              <tbody>
                @for (row of groupedRows(); track row.key) {
                  <tr class="border-b hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3">
                      @if (row.projectId) {
                        <a [routerLink]="['/projects', row.projectId]" [queryParams]="{ section: 'financials', view: 'budget' }"
                           class="text-indigo-700 font-medium hover:underline">{{ row.label }}</a>
                      } @else {
                        {{ row.label }}
                      }
                    </td>
                    <td class="px-4 py-3 text-right">{{ row.rowCount }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.totalHours | number:'1.1-1' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ row.totalCost | currency }}</td>
                    <td class="px-4 py-3 text-right">{{ row.missingClassification }}</td>
                    <td class="px-4 py-3 text-right">{{ row.missingRate }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class LaborActualsPage {
  private data = inject(DataService);
  private laborActualsSvc = inject(ProjectLaborActualService);
  private laborCodeMapping = inject(LaborCodeMappingService);
  private globalNeeds = inject(GlobalNeedsService);

  showWorkCompAudit = computed(() => shouldShowWorkCompAudit({
    showAllTools: this.globalNeeds.showAllTools(),
    auditModeEnabled: isWorkCompAuditEnabled(),
  }));

  private projects = toSignal(this.data.getProjects(), { initialValue: [] });
  private firestoreActuals = toSignal(this.data.getProjectLaborActuals(), { initialValue: [] as ProjectLaborActual[] });
  private laborCodeMappings = toSignal(this.data.getLaborCodeMappings(), { initialValue: [] });

  activeTab = signal<LaborTab>('project');
  laborCodeFilter = signal<LaborCodeFilter>('all');

  laborCodeFilterOptions: { id: LaborCodeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'wipEligible', label: 'WIP eligible' },
    { id: 'bonusEligible', label: 'Bonus eligible' },
    { id: 'certifiedPayrollEligible', label: 'Certified payroll eligible' },
    { id: 'excluded', label: 'Excluded' },
    { id: 'unassigned', label: 'Unassigned' },
  ];

  readonly tabs: { id: LaborTab; label: string }[] = [
    { id: 'project', label: 'By Project' },
    { id: 'employee', label: 'By Employee' },
    { id: 'week', label: 'By Week' },
    { id: 'laborCode', label: 'By Labor Code' },
    { id: 'exceptions', label: 'Exceptions' },
  ];

  actuals = computed(() => {
    const cached = this.laborActualsSvc.snapshot();
    return cached.length ? cached : (this.firestoreActuals() ?? []);
  });

  approvedActuals = computed(() =>
    this.actuals().filter(a => a.approvalStatus === 'Approved'),
  );

  summaryCards = computed(() => {
    const rows = this.approvedActuals();
    const mappings = this.laborCodeMappings();
    const wipRows = wipEligibleLaborActuals(rows, mappings);
    const projects = new Set(rows.map(r => r.projectId));
    const totalCost = rows.reduce((s, r) => s + (r.totalLaborCost ?? 0), 0);
    const wipCost = wipRows.reduce((s, r) => s + (r.totalLaborCost ?? 0), 0);
    const totalHours = rows.reduce((s, r) => s + (r.totalHours ?? 0), 0);
    const exceptions = this.exceptionRows().length;
    return [
      { label: 'Approved Rows', value: String(rows.length) },
      { label: 'Projects', value: String(projects.size) },
      { label: 'Total Hours', value: totalHours.toFixed(1) },
      { label: 'WIP-Eligible Labor Cost', value: `$${Math.round(wipCost).toLocaleString()}` },
      { label: 'Total Labor Cost', value: `$${Math.round(totalCost).toLocaleString()}` },
      { label: 'Exceptions', value: String(exceptions) },
    ];
  });

  groupedRows = computed((): LaborGroupRow[] => {
    const tab = this.activeTab();
    if (tab === 'exceptions' || tab === 'laborCode') return [];

    const map = new Map<string, LaborGroupRow>();
    for (const row of this.approvedActuals()) {
      let key = '';
      let label = '';
      let projectId: string | undefined;

      if (tab === 'project') {
        key = row.projectId;
        label = row.projectName ?? row.jobNumber ?? row.projectId;
        projectId = row.projectId;
      } else if (tab === 'employee') {
        key = (row.employeeName ?? 'unknown').toLowerCase();
        label = row.employeeName ?? 'Unknown Employee';
      } else {
        key = `${row.projectId}_${row.weekEnd}`;
        label = `${row.projectName ?? row.jobNumber ?? row.projectId} · Week ending ${row.weekEnd}`;
        projectId = row.projectId;
      }

      const existing = map.get(key) ?? {
        key,
        label,
        projectId,
        totalHours: 0,
        totalCost: 0,
        rowCount: 0,
        missingClassification: 0,
        missingRate: 0,
      };

      existing.totalHours += row.totalHours ?? 0;
      existing.totalCost += row.totalLaborCost ?? 0;
      existing.rowCount += 1;
      if (!row.classification?.trim()) existing.missingClassification += 1;
      if (!row.baseRate && !row.totalLaborCost) existing.missingRate += 1;
      map.set(key, existing);
    }

    return [...map.values()].sort((a, b) => b.totalCost - a.totalCost);
  });

  laborCodeRows = computed(() => {
    const mappings = this.laborCodeMappings();
    const grouped = groupHoursByLaborCode(
      this.approvedActuals(),
      row => row.totalLaborCost ?? 0,
    );
    const enriched = grouped.map(row =>
      enrichLaborCodeHoursRow(row.laborCode, row, mappings),
    );
    return filterLaborCodeRows(enriched, this.laborCodeFilter(), mappings);
  });

  exceptionRows = computed(() =>
    this.approvedActuals()
      .flatMap(row => {
        const issues: string[] = [];
        if (!row.classification?.trim()) issues.push('Missing classification');
        if (!row.baseRate && !row.totalLaborCost) issues.push('Missing wage rate');
        return issues.map(issue => ({ ...row, issue }));
      }),
  );

  activeTabLabel = computed(() => this.tabs.find(t => t.id === this.activeTab())?.label ?? 'Labor Actuals');

  onLaborCodeFilterChange(event: Event): void {
    this.laborCodeFilter.set((event.target as HTMLSelectElement).value as LaborCodeFilter);
  }

  exportWorkCompAudit(): void {
    this.laborCodeMapping.exportWorkCompAuditCsv(this.approvedActuals());
  }

  exportCsv(): void {
    const rows = this.approvedActuals().map(a => [
      a.projectId,
      a.jobNumber ?? '',
      a.projectName ?? '',
      a.employeeName ?? '',
      a.workDate,
      a.weekEnd,
      a.classification ?? '',
      a.laborCode ?? '',
      a.regularHours,
      a.overtimeHours,
      a.doubleTimeHours,
      a.totalHours,
      a.baseRate ?? '',
      a.fringeRate ?? '',
      a.totalLaborCost,
      a.source,
    ]);
    downloadCsv(
      'labor-actuals.csv',
      [
        'Project ID', 'Job Number', 'Project Name', 'Employee', 'Work Date', 'Week End',
        'Classification', 'Labor Code', 'Reg Hours', 'OT Hours', 'DT Hours', 'Total Hours',
        'Base Rate', 'Fringe Rate', 'Labor Cost', 'Source',
      ],
      rows,
    );
  }
}
