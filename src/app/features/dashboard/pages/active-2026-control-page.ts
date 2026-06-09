import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { take } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '@core/services/data.service';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ForemanBonusService } from '@features/labor/services/foreman-bonus.service';
import { ImportDataService } from '@core/services/import-data.service';
import {
  Active2026ControlRow,
  ControlFilterId,
  ControlSegmentId,
  ControlSortKey,
} from '@app/models/active-2026-control.types';
import {
  buildActive2026ControlRows,
  CONTROL_FILTER_OPTIONS,
  matchesControlFilter,
  matchesControlSegment,
  rowWarningChips,
  sortControlRows,
  summarizeActive2026Control,
} from '@features/projects/utils/active-2026-control.compute';
import { downloadCsv } from '@shared/utils/csv-export';
import { BRIGHTEN_PROFIT_TARGET } from '@app/config/active-2026-jobs.config';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatCardComponent } from '@app/components/ui/stat-card';
import { CompactStatStripComponent } from '@app/components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '@app/components/ui/segmented-control';
import { StatusChipComponent } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent } from '@app/components/ui/detail-drawer';

const VALID_CONTROL_SEGMENTS = new Set<ControlSegmentId>([
  'activeJobs',
  'all',
  'criticalRisk',
  'setupNeeded',
  'reviewNeeded',
  'billing',
  'cpr',
  'subs',
]);

@Component({
  selector: 'app-active-2026-control-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatIconModule,
    PageHeaderComponent, StatCardComponent, CompactStatStripComponent,
    SegmentedControlComponent,
    DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent,
    EmptyStateComponent, StatusChipComponent,
  ],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-page-header
        title="Active Jobs"
        [subtitle]="'Office view · ' + summary().activeJobs + ' in-progress jobs · 20% profit target'">
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <input type="checkbox"
                   [checked]="globalNeeds.showAllTools()"
                   (change)="toggleShowAllTools($event)"
                   class="rounded border-slate-300" />
            Show all tools
          </label>
          <button type="button" (click)="filterDrawerOpen.set(true)"
                  class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
            Filter
            @if (activeFilters().size) {
              <span class="ml-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">{{ activeFilters().size }}</span>
            }
          </button>
          <select [(ngModel)]="sortKey" class="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-colors">
            @for (opt of sortOptions; track opt.id) {
              <option [value]="opt.id">{{ opt.label }}</option>
            }
          </select>
          <button type="button" (click)="exportCsv()"
                  class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0 hover:bg-slate-800 transition-colors">
            Export CSV
          </button>
        </div>
      </app-page-header>

      @if (loadError()) {
        <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <mat-icon class="!text-[16px] text-amber-500 shrink-0">warning</mat-icon>
          <span>{{ loadError() }}</span>
          <button type="button" (click)="retryLoad()"
                  class="ml-auto text-xs font-semibold underline hover:text-amber-900 transition-colors">Retry</button>
        </div>
      }

      @if (loading()) {
        <div class="animate-pulse space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            @for (i of skeletonSlots; track i) {
              <div class="rounded-xl border border-slate-200 bg-slate-100 h-24"></div>
            }
          </div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="rounded-xl border border-slate-200 bg-slate-100 h-12"></div>
          }
        </div>
      } @else {

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card label="Active Jobs" [value]="fmtCount(summary().activeJobs)" icon="work" />
        <app-stat-card label="Review Items" [value]="fmtCount(summary().jobsCriticalRisk)"
                       [subtext]="summary().jobsCriticalRisk ? 'True urgent items' : 'No urgent items'"
                       icon="warning" />
        <app-stat-card label="Open AR" [value]="fmtCurrency(summary().openArTotal)"
                       [subtext]="summary().openArTotal > 0 ? summary().jobsArPastDue + ' past due' : undefined"
                       icon="receipt_long" />
        <app-stat-card label="Left to Bill" [value]="fmtCurrency(summary().leftToBillTotal)" icon="payments" />
      </div>

      <app-compact-stat-strip [stats]="compactStats()" />

      <div class="flex flex-wrap items-center justify-between gap-3">
        <app-segmented-control
          [options]="segmentOptions()"
          [value]="activeSegment()"
          (select)="onSegmentSelect($event)" />
        @if (activeFilters().size) {
          <button type="button" (click)="clearFilters()" class="text-xs font-semibold text-slate-600 underline">
            Clear {{ activeFilters().size }} advanced filter(s)
          </button>
        }
      </div>

      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        @if (displayRows().length) {
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm min-w-[1120px]">
              <thead>
                <tr class="text-[10px] uppercase font-bold text-slate-400 tracking-wider border-b border-slate-100">
                  <th class="px-4 py-3">Job #</th>
                  <th class="px-4 py-3">Project</th>
                  <th class="px-4 py-3">Customer</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3">Billing</th>
                  <th class="px-4 py-3 text-right">Contract</th>
                  <th class="px-4 py-3 text-right">Billed</th>
                  <th class="px-4 py-3 text-right">Balance</th>
                  <th class="px-4 py-3">Foreman / PM</th>
                  <th class="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of displayRows(); track row.projectId) {
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-2.5 font-numeric text-xs font-bold text-slate-900">{{ row.jobNumber }}</td>
                    <td class="px-4 py-2.5">
                      <a [routerLink]="['/projects', row.projectId]" class="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate block max-w-[220px]">
                        {{ row.projectName }}
                      </a>
                    </td>
                    <td class="px-4 py-2.5 text-xs text-slate-600 truncate max-w-[180px]">{{ row.customer || 'Not available' }}</td>
                    <td class="px-4 py-2.5">
                      <app-status-chip [tone]="row.healthStatus === 'Red' ? 'red' : row.healthStatus === 'Yellow' ? 'amber' : 'green'">{{ row.status }}</app-status-chip>
                    </td>
                    <td class="px-4 py-2.5">
                      <app-status-chip tone="slate">{{ row.billingStatus || 'Pending' }}</app-status-chip>
                    </td>
                    <td class="px-4 py-2.5 text-right font-numeric text-xs">{{ fmtCurrency(row.currentContract) }}</td>
                    <td class="px-4 py-2.5 text-right font-numeric text-xs">{{ fmtCurrency(row.billedToDate) }}</td>
                    <td class="px-4 py-2.5 text-right font-numeric text-xs" [class.text-amber-700]="row.leftToBill > 0">{{ fmtCurrency(row.leftToBill) }}</td>
                    <td class="px-4 py-2.5 text-xs font-semibold text-slate-700 truncate max-w-[160px]">{{ foremanPmLabel(row) }}</td>
                    <td class="px-4 py-2.5">
                      <a [routerLink]="row.nextAction.route"
                         [queryParams]="row.nextAction.queryParams"
                         [fragment]="row.nextAction.fragment"
                         class="text-xs font-semibold text-indigo-700 hover:underline truncate block max-w-[180px]">
                        {{ row.nextAction.label }}
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <div class="p-5">
            <app-empty-state
              title="No jobs match the current filters."
              message="Try a different segment or clear advanced filters." />
          </div>
        }
      </div>
      }
    </div>

    @if (filterDrawerOpen()) {
      <div class="fixed inset-0 z-40 bg-black/30" (click)="filterDrawerOpen.set(false)"></div>
      <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-white shadow-xl overflow-y-auto flex flex-col">
        <div class="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h2 class="text-lg font-bold text-slate-900">Advanced Filters</h2>
          <button type="button" (click)="filterDrawerOpen.set(false)" class="text-slate-400 hover:text-slate-600">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <div class="p-5 space-y-2 flex-1">
          @for (f of filterOptions; track f.id) {
            <label class="flex items-center gap-3 py-2 cursor-pointer">
              <input type="checkbox"
                     [checked]="activeFilters().has(f.id)"
                     (change)="toggleFilter(f.id)"
                     class="rounded border-slate-300" />
              <span class="text-sm">{{ f.label }}</span>
            </label>
          }
        </div>
        <div class="sticky bottom-0 border-t bg-white p-4 flex gap-2">
          <button type="button" (click)="clearFilters()"
                  class="flex-1 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">Clear all</button>
          <button type="button" (click)="filterDrawerOpen.set(false)"
                  class="flex-1 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">Apply</button>
        </div>
      </aside>
    }

    <app-detail-drawer
      [open]="!!selectedRow()"
      [title]="selectedRow()?.jobNumber + ' · ' + selectedRow()?.projectName"
      [subtitle]="selectedRow()?.customer"
      [footerActionLabel]="selectedRow()?.nextAction?.label"
      (close)="selectedRow.set(null)"
      (footerAction)="navigateNextAction()">
      @if (selectedRow(); as row) {
        <app-drawer-section title="Summary">
          <app-drawer-field label="Status" [value]="row.status + ' · ' + row.lifecycleGroup" />
          <app-drawer-field label="Health" [value]="row.healthStatus" />
          <app-drawer-field label="PM" [value]="row.pm || '—'" />
          <app-drawer-field label="Foreman" [value]="row.foreman || '—'" />
          <app-drawer-field label="Drive" [value]="row.driveLinked ? 'Linked' : 'Missing'" [alert]="!row.driveLinked" />
          <app-drawer-field label="Setup" [value]="row.seedCompletenessStatus" />
        </app-drawer-section>

        <app-drawer-section title="Billing">
          <app-drawer-field label="Contract" [value]="fmtCurrency(row.currentContract)" [mono]="true" />
          <app-drawer-field label="Approved COs" [value]="fmtCurrency(row.approvedCos)" [mono]="true" />
          <app-drawer-field label="Pending COs" [value]="fmtCurrency(row.pendingCos)" [mono]="true" />
          <app-drawer-field label="Billed" [value]="fmtCurrency(row.billedToDate)" [mono]="true" />
          <app-drawer-field label="Left to Bill" [value]="fmtCurrency(row.leftToBill)" [mono]="true" />
          <app-drawer-field label="AR" [value]="fmtCurrency(row.arBalance)" [mono]="true" />
          <app-drawer-field label="AR Past Due" [value]="fmtCurrency(row.arPastDue)" [mono]="true" />
          <app-drawer-field label="Retainage" [value]="fmtCurrency(row.retainage)" [mono]="true" />
          <app-drawer-field label="Billing Status" [value]="row.billingStatus" />
          <app-drawer-field label="Over/Under" [value]="fmtCurrency(row.overUnderBilling)" [mono]="true" />
        </app-drawer-section>

        <app-drawer-section title="Labor">
          <app-drawer-field label="Budget Basis" [value]="budgetBasisLabel(row.budgetBasis)" />
          <app-drawer-field label="Budget" [value]="fmtCurrency(row.totalBudget)" [mono]="true" />
          <app-drawer-field label="Actual Cost" [value]="fmtCurrency(row.actualCostToDate)" [mono]="true" />
          <app-drawer-field label="Est Final" [value]="fmtCurrency(row.estimatedFinalCost)" [mono]="true" />
          <app-drawer-field label="Variance" [value]="fmtCurrency(row.budgetVariance)" [mono]="true" [alert]="row.budgetVariance < 0" />
          <app-drawer-field label="Proj Profit" [value]="fmtCurrency(row.projectedProfit)" [mono]="true" />
          <app-drawer-field label="Margin" [value]="row.projectedMarginPct.toFixed(1) + '%'"
                            [alert]="row.projectedMarginPct < profitTargetPct" />
          <app-drawer-field label="Labor Budget" [value]="fmtCurrency(row.laborBudget)" [mono]="true" />
          <app-drawer-field label="Labor Actual" [value]="fmtCurrency(row.laborActualCost)" [mono]="true" />
          <app-drawer-field label="Labor Var" [value]="fmtCurrency(row.laborVariance)" [mono]="true" [alert]="row.laborVariance < 0" />
          <app-drawer-field label="Bonus" [value]="row.bonusStatus" />
          <app-drawer-field label="WIP" [value]="row.wipStatus" />
        </app-drawer-section>

        <app-drawer-section title="Subs / Compliance">
          <app-drawer-field label="Sub Count" [value]="fmtCount(row.subcontractorCount)" />
          <app-drawer-field label="Sub Cost" [value]="fmtCurrency(row.subcontractorCostToDate)" [mono]="true" />
          <app-drawer-field label="Missing W-9" [value]="fmtCount(row.missingW9Count)" [alert]="row.missingW9Count > 0" />
          <app-drawer-field label="Missing COI" [value]="fmtCount(row.missingCoiCount)" [alert]="row.missingCoiCount > 0" />
          <app-drawer-field label="CPR" [value]="row.cprStatus" [alert]="row.cprRequired && row.cprStatus === 'Missing setup'" />
        </app-drawer-section>

        <app-drawer-section title="Setup / Docs">
          <a [routerLink]="['/projects', row.projectId]"
             class="text-sm font-semibold text-indigo-700 underline">Open project</a>
        </app-drawer-section>
      }
    </app-detail-drawer>
  `,
})
export class Active2026ControlPage {
  globalNeeds = inject(GlobalNeedsService);
  private data = inject(DataService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private financialSvc = inject(ProjectFinancialService);
  private lifecycleSvc = inject(ProjectLifecycleService);
  private foremanBonus = inject(ForemanBonusService);
  private importData = inject(ImportDataService);

  readonly profitTargetPct = BRIGHTEN_PROFIT_TARGET * 100;
  readonly filterOptions = CONTROL_FILTER_OPTIONS;
  readonly rowWarningChips = rowWarningChips;

  sortKey: ControlSortKey = 'jobNumber';
  activeFilters = signal<Set<ControlFilterId>>(new Set());
  activeSegment = signal<ControlSegmentId>('activeJobs');
  selectedRow = signal<Active2026ControlRow | null>(null);
  filterDrawerOpen = signal(false);
  loading = signal(true);
  loadError = signal<string | null>(null);
  readonly skeletonSlots = [1, 2, 3, 4];

  constructor() {
    this.data.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => {
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err instanceof Error ? err.message : 'Could not load project data. Check your connection.');
      },
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const seg = params.get('segment') as ControlSegmentId | null;
      if (seg && VALID_CONTROL_SEGMENTS.has(seg)) {
        this.activeSegment.set(seg);
      }
    });
  }

  private projects = toSignal(this.data.getProjects(), { initialValue: [] as ReturnType<DataService['projectsSnapshot']> });

  readonly sortOptions: { id: ControlSortKey; label: string }[] = [
    { id: 'jobNumber', label: 'Job number' },
    { id: 'highestAr', label: 'Highest AR' },
    { id: 'lowestMargin', label: 'Lowest margin' },
    { id: 'largestContract', label: 'Largest contract' },
    { id: 'largestCostOverrun', label: 'Largest cost overrun' },
    { id: 'mostMissing', label: 'Most missing items' },
    { id: 'nextBilling', label: 'Next billing action' },
    { id: 'projectName', label: 'Project name' },
  ];

  private allRows = computed(() => {
    const projects = this.projects() ?? [];
    const lifecycles = this.lifecycleSvc.snapshotMap();
    const financials = new Map(projects.map(p => [p.id, this.financialSvc.computeForProject(p)]));
    const wipRecords = this.financialSvc.computeWipRecords();
    const wipByProjectId = new Map(wipRecords.map(w => [w.projectId, w]));

    return buildActive2026ControlRows({
      projects,
      financialByProjectId: financials,
      lifecycleByProjectId: lifecycles,
      wipByProjectId,
      changeOrders: this.data.changeOrdersSnapshot(),
      arRecords: this.data.arRecordsSnapshot(),
      laborActuals: this.data.projectLaborActualsSnapshot(),
      budgetLines: this.data.budgetLinesSnapshot(),
      projectSubcontractors: this.data.projectSubcontractorsSnapshot(),
      subcontractors: this.data.subcontractorsSnapshot(),
      subDocuments: this.data.subcontractorDocumentsSnapshot(),
      foremanAssignments: this.foremanBonus.assignments(),
      foremanRecords: this.foremanBonus.records(),
      laborBudgetImported: job => !!this.importData.flagsForJob(job)?.laborBudgetImported,
    });
  });

  summary = computed(() => summarizeActive2026Control(this.allRows()));

  displayRows = computed(() => {
    let rows = this.allRows();
    const segment = this.activeSegment();
    if (segment !== 'all') {
      rows = rows.filter(row => matchesControlSegment(row, segment));
    }
    const filters = this.activeFilters();
    if (filters.size) {
      rows = rows.filter(row => [...filters].every(f => matchesControlFilter(row, f)));
    }
    return sortControlRows(rows, this.sortKey);
  });

  segmentOptions = computed(() => {
    const rows = this.allRows();
    const count = (seg: ControlSegmentId) =>
      seg === 'all' ? rows.length : rows.filter(r => matchesControlSegment(r, seg)).length;
    return [
      { id: 'activeJobs' as ControlSegmentId, label: 'In Progress', badge: count('activeJobs') || undefined },
      { id: 'all' as ControlSegmentId, label: 'All', badge: count('all') || undefined },
      { id: 'criticalRisk' as ControlSegmentId, label: 'Review', badge: count('criticalRisk') || undefined },
      { id: 'billing' as ControlSegmentId, label: 'Billing', badge: count('billing') || undefined },
    ];
  });

  foremanPmLabel(row: Active2026ControlRow): string {
    const people = [row.foreman, row.pm].filter(value => !!value && value !== 'TBD');
    return people.length ? people.join(' / ') : 'Not assigned';
  }

  compactStats = computed(() => {
    const s = this.summary();
    return [
      { label: 'Review Items', value: String(s.jobsCriticalRisk), alert: s.jobsCriticalRisk > 0 },
      { label: 'Open AR', value: this.fmtCurrency(s.openArTotal) },
      { label: 'Left to Bill', value: this.fmtCurrency(s.leftToBillTotal), alert: false },
    ];
  });

  fmtCurrency(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  fmtCount(n: number): string {
    return n > 0 ? String(n) : '—';
  }

  rowMetrics(row: Active2026ControlRow) {
    return [
      { label: 'Contract', value: this.fmtCurrency(row.currentContract) },
      { label: 'Billed', value: this.fmtCurrency(row.billedToDate) },
      { label: 'Left', value: this.fmtCurrency(row.leftToBill) },
      { label: 'AR', value: this.fmtCurrency(row.arBalance) },
      { label: 'Margin', value: `${row.projectedMarginPct.toFixed(1)}%`, alert: row.projectedMarginPct < this.profitTargetPct },
    ];
  }

  onSegmentSelect(seg: ControlSegmentId): void {
    this.activeSegment.set(seg);
  }

  toggleShowAllTools(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.globalNeeds.setShowAllTools(checked);
  }

  retryLoad(): void {
    this.loadError.set(null);
    this.loading.set(true);
    this.data.getProjects().pipe(take(1), takeUntilDestroyed()).subscribe({
      next: () => {
        this.loading.set(false);
        this.loadError.set(null);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err instanceof Error ? err.message : 'Could not load project data. Check your connection.');
      },
    });
  }

  openDrawer(row: Active2026ControlRow): void {
    this.selectedRow.set(row);
  }

  toggleFilter(id: ControlFilterId): void {
    const next = new Set(this.activeFilters());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.activeFilters.set(next);
  }

  clearFilters(): void {
    this.activeFilters.set(new Set());
  }

  budgetBasisLabel(basis: string): string {
    switch (basis) {
      case 'EstimatedFrom20PercentTarget': return '80% estimate';
      case 'Imported': return 'Imported';
      case 'Manual': return 'Manual';
      default: return 'Missing';
    }
  }

  navigateNextAction(): void {
    const row = this.selectedRow();
    if (!row) return;
    const action = row.nextAction;
    let url = action.route;
    if (action.queryParams) {
      const qs = new URLSearchParams(action.queryParams).toString();
      if (qs) url += `?${qs}`;
    }
    if (action.fragment) url += `#${action.fragment}`;
    void this.router.navigateByUrl(url);
    this.selectedRow.set(null);
  }

  exportCsv(): void {
    const filters = [...this.activeFilters()].join(';') || 'none';
    const rows = this.displayRows().map(r => [
      r.healthStatus,
      r.jobNumber,
      r.projectName,
      r.customer,
      r.status,
      r.lifecycleGroup,
      r.pm,
      r.foreman,
      r.currentContract,
      r.approvedCos,
      r.pendingCos,
      r.billedToDate,
      r.leftToBill,
      r.arBalance,
      r.arPastDue,
      r.retainage,
      r.billingStatus,
      r.budgetBasis,
      r.totalBudget,
      r.actualCostToDate,
      r.costToComplete,
      r.estimatedFinalCost,
      r.budgetVariance,
      r.projectedProfit,
      r.projectedMarginPct,
      r.overUnderBilling,
      r.wipStatus,
      r.laborBudget,
      r.laborActualCost,
      r.laborVariance,
      r.bonusStatus,
      r.subcontractorCount,
      r.subcontractorCostToDate,
      r.missingW9Count,
      r.missingCoiCount,
      r.driveLinked ? 'Yes' : 'No',
      r.cprStatus,
      r.seedCompletenessStatus,
      r.nextAction.label,
    ]);

    downloadCsv(
      `active-2026-control-${filters}.csv`,
      [
        'Health', 'Job', 'Project', 'Customer', 'Status', 'Lifecycle', 'PM', 'Foreman',
        'Contract', 'Approved COs', 'Pending COs', 'Billed', 'Left to Bill', 'AR', 'AR Past Due',
        'Retainage', 'Billing Status', 'Budget Basis', 'Budget', 'Actual Cost', 'CTC', 'Est Final',
        'Variance', 'Projected Profit', 'Margin %', 'Over/Under', 'WIP', 'Labor Budget',
        'Labor Actual', 'Labor Var', 'Bonus Status', 'Sub Count', 'Sub Cost', 'Missing W-9',
        'Missing COI', 'Drive Linked', 'CPR', 'Setup Status', 'Next Action',
      ],
      rows,
    );
  }
}
