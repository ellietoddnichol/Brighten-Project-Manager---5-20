import { Component, ChangeDetectionStrategy, Input, inject, signal, computed, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Project, ChangeOrder, ProjectTask, PO, TimeEntry } from '@app/models/types';
import { ProjectLaborEntry, ProjectMaterial } from '@app/models/job-record.types';
import { DataService } from '@core/services/data.service';
import { JobRecordService } from '@features/projects/services/job-record.service';
import { ActivityEventsService } from '@core/services/activity-events.service';
import { ActivityEvent } from '@app/models/activity-event.types';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { ChartCardComponent } from '@app/components/ui/chart-card';
import { DonutChartComponent, DonutSlice } from '@app/components/charts/donut-chart';
import { ChangesTabComponent } from '@features/projects/pages/changes-tab';
import { TasksTabComponent } from '@features/projects/pages/tasks-tab';
import { ProjectSubcontractorsTabComponent } from '@features/projects/pages/project-subcontractors-tab';
import { ProjectWorkflowSaveService } from '@features/projects/services/project-workflow-save.service';
import { ProjectFilesRepository } from '@core/services/project-files.repository';
import { formatMoney, formatPercent } from '@features/projects/utils/project-profit.compute';
import { projectProfileLabel } from '@features/projects/utils/project-profile.compat';

type SaveState = 'idle' | 'saving' | 'saved';

@Component({
  selector: 'app-project-record-overview-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartCardComponent, DonutChartComponent],
  template: `
    <div class="space-y-4">
      <div class="grid lg:grid-cols-2 gap-4">
        <section class="bg-white rounded-xl border border-slate-200 p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-bold text-slate-900">Job Summary</h2>
            <span class="text-xs text-slate-500">{{ saveState() === 'saving' ? 'Saving…' : saveState() === 'saved' ? 'Saved' : '' }}</span>
          </div>
          <ul class="space-y-2.5 text-sm">
            @for (item of summaryBullets(); track item.label) {
              <li class="flex gap-3">
                <span class="text-slate-400 shrink-0 w-28 text-xs font-semibold uppercase tracking-wide">{{ item.label }}</span>
                <span class="font-semibold text-slate-900 min-w-0">{{ item.value }}</span>
              </li>
            }
          </ul>
          @if (project.scopeSummary) {
            <div class="mt-4 pt-4 border-t border-slate-100">
              <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">Scope</p>
              <p class="text-sm text-slate-700 whitespace-pre-wrap">{{ project.scopeSummary }}</p>
            </div>
          }
        </section>

        <app-chart-card title="Cost Breakdown" [subtitle]="fmt(totals().costToDate) + ' to date'">
          @if (costSlices().length) {
            <app-donut-chart [slices]="costSlices()" [centerLabel]="fmt(totals().costToDate)" />
          } @else {
            <p class="text-sm text-slate-500 text-center py-8">No cost data entered yet.</p>
          }
        </app-chart-card>
      </div>

      <section class="bg-white rounded-xl border border-slate-200 p-5">
        <h3 class="text-sm font-bold text-slate-900 mb-3">Billing Progress</h3>
        <div class="space-y-3">
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-500">Billed to date</span>
              <span class="font-semibold">{{ formatPercent(profit().billedPercent) }} · {{ fmt(project.billedToDate) }}</span>
            </div>
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-indigo-500 rounded-full transition-all"
                   [style.width.%]="(profit().billedPercent ?? 0) * 100"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-500">Cost used</span>
              <span class="font-semibold">{{ formatPercent(profit().costPercent) }} · {{ fmt(totals().costToDate) }}</span>
            </div>
            <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div class="h-full bg-amber-500 rounded-full transition-all"
                   [style.width.%]="(profit().costPercent ?? 0) * 100"></div>
            </div>
          </div>
        </div>
        <div class="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div class="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p class="text-[10px] font-bold uppercase text-slate-500">Profit to Date</p>
            <p class="font-bold text-slate-900">{{ fmt(profit().profitToDate) }}</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p class="text-[10px] font-bold uppercase text-slate-500">Projected Profit</p>
            <p class="font-bold text-slate-900">{{ fmt(profit().projectedProfit) }}</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <p class="text-[10px] font-bold uppercase text-slate-500">Projected Margin</p>
            <p class="font-bold text-slate-900">{{ formatPercent(profit().projectedMargin) }}</p>
          </div>
        </div>
      </section>

      <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 class="text-sm font-bold text-slate-900">Edit Job Details</h3>
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <label class="text-[10px] font-bold uppercase text-slate-500">Scope / Work Requested</label>
            <textarea [(ngModel)]="scope" rows="3" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
                      (blur)="saveScope()"></textarea>
          </div>
          <div class="space-y-3">
            <div>
              <label class="text-[10px] font-bold uppercase text-slate-500">Project Manager</label>
              <input [(ngModel)]="pm" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="savePm()" />
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase text-slate-500">Superintendent</label>
              <input [(ngModel)]="sup" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="saveSup()" />
            </div>
            <div>
              <label class="text-[10px] font-bold uppercase text-slate-500">Address</label>
              <input [(ngModel)]="address" class="w-full mt-1 border rounded-lg px-3 py-2 text-sm" (blur)="saveAddress()" />
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordOverviewTabComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  private data = inject(DataService);
  saveState = signal<SaveState>('idle');
  scope = '';
  pm = '';
  sup = '';
  address = '';

  private changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] as ChangeOrder[] });

  totals = computed(() =>
    this.jobRecord.totalsForProject(this.project, this.changeOrders()),
  );

  profit = computed(() => this.jobRecord.profitForProject(this.project, this.totals()));

  summaryBullets = computed(() => {
    const p = this.project;
    const t = this.totals();
    const revised = p.revisedContractAmount
      ?? ((p.originalContractAmount ?? 0) + t.approvedChangeAmount);
    return [
      { label: 'Customer', value: p.customer || '—' },
      { label: 'Profile', value: projectProfileLabel(p.projectProfile) },
      { label: 'Status', value: p.status || '—' },
      { label: 'Contract', value: this.fmt(revised) },
      { label: 'Billed', value: this.fmt(p.billedToDate) },
      { label: 'Total Hours', value: t.totalHours.toFixed(1) },
      { label: 'Labor Cost', value: this.fmt(t.laborCost) },
      { label: 'Materials', value: this.fmt(t.materialCost) },
      { label: 'Changes', value: `${this.fmt(t.approvedChangeAmount)} approved · ${this.fmt(t.pendingChangeAmount)} pending` },
      { label: 'PM / Super', value: [p.projectManager, p.superintendent].filter(Boolean).join(' · ') || '—' },
      { label: 'Dates', value: [p.startDate, p.targetCompletionDate].filter(Boolean).join(' → ') || '—' },
      { label: 'County', value: p.county || '—' },
    ];
  });

  costSlices = computed((): DonutSlice[] => {
    const t = this.totals();
    const other = Math.max(0, t.costToDate - t.laborCost - t.materialCost);
    return [
      { label: 'Labor', value: t.laborCost, color: '#6366f1' },
      { label: 'Materials', value: t.materialCost, color: '#f59e0b' },
      { label: 'Other', value: other, color: '#94a3b8' },
    ].filter(s => s.value > 0);
  });

  fmt = formatMoney;
  formatPercent = formatPercent;

  ngOnChanges(_changes: SimpleChanges): void {
    this.scope = this.project.scopeSummary ?? '';
    this.pm = this.project.projectManager ?? '';
    this.sup = this.project.superintendent ?? '';
    this.address = this.project.address ?? '';
  }

  private async patch(fields: Partial<Project>): Promise<void> {
    this.saveState.set('saving');
    await this.jobRecord.saveProjectField(this.project, fields);
    Object.assign(this.project, fields);
    this.saveState.set('saved');
    setTimeout(() => this.saveState.set('idle'), 1500);
  }

  saveScope(): void { void this.patch({ scopeSummary: this.scope.trim() || undefined }); }
  savePm(): void { void this.patch({ projectManager: this.pm.trim() || undefined }); }
  saveSup(): void { void this.patch({ superintendent: this.sup.trim() || undefined }); }
  saveAddress(): void { void this.patch({ address: this.address.trim() || undefined }); }
}

@Component({
  selector: 'app-project-record-labor-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <div>
          <h2 class="text-sm font-bold">Labor</h2>
          <p class="text-xs text-slate-500">
            Total hours: {{ totalHours.toFixed(1) }}
            @if (syncedHours > 0) { · {{ syncedHours.toFixed(1) }}h from Master Time }
            · Labor cost: {{ fmt(totalCost) }}
          </p>
        </div>
        <button type="button" (click)="openLaborForm()" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Labor Cost</button>
      </div>
      @if (saveError()) {
        <p class="px-5 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-100">{{ saveError() }}</p>
      }
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" [(ngModel)]="draft.workDate" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.employeeName" placeholder="Employee / crew" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.classification" placeholder="Classification" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.laborCode" placeholder="Labor code" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.regularHours" placeholder="Reg hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.overtimeHours" placeholder="OT hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.doubleTimeHours" placeholder="DT hrs" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.costRate" placeholder="Cost rate ($/hr)" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.laborCost" placeholder="Or total labor cost ($)" class="border rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <div class="sm:col-span-2 flex gap-2 items-center">
            <button type="button" (click)="saveLabor()" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{{ saving() ? 'Saving…' : 'Save' }}</button>
            <button type="button" (click)="closeLaborForm()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
          <tr>
            <th class="px-4 py-2 text-left">Date</th>
            <th class="px-4 py-2 text-left">Employee</th>
            <th class="px-4 py-2 text-left">Code</th>
            <th class="px-4 py-2 text-right">Reg</th>
            <th class="px-4 py-2 text-right">OT</th>
            <th class="px-4 py-2 text-right">DT</th>
            <th class="px-4 py-2 text-right">Total Hrs</th>
            <th class="px-4 py-2 text-right">Cost</th>
            <th class="px-4 py-2 text-left">Source</th>
          </tr>
        </thead>
        <tbody>
          @for (row of syncedRows(); track row.id) {
            <tr class="border-t border-slate-100 bg-indigo-50/30">
              <td class="px-4 py-2">{{ row.workDate || '—' }}</td>
              <td class="px-4 py-2">{{ row.employeeName || '—' }}</td>
              <td class="px-4 py-2">{{ row.classification || '—' }}</td>
              <td class="px-4 py-2 text-right">{{ row.regularHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.overtimeHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.doubleTimeHours }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ row.totalHours }}</td>
              <td class="px-4 py-2 text-right text-slate-400">—</td>
              <td class="px-4 py-2 text-xs text-indigo-700">Master Time</td>
            </tr>
          }
          @for (row of manualEntries(); track row.id) {
            <tr class="border-t border-slate-100">
              <td class="px-4 py-2">{{ row.workDate }}</td>
              <td class="px-4 py-2">{{ row.employeeName || '—' }}</td>
              <td class="px-4 py-2">{{ row.laborCode || row.classification || '—' }}</td>
              <td class="px-4 py-2 text-right">{{ row.regularHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.overtimeHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.doubleTimeHours }}</td>
              <td class="px-4 py-2 text-right">{{ row.totalHours }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ fmt(row.laborCost ?? 0) }}</td>
              <td class="px-4 py-2 text-xs text-slate-500">Manual</td>
            </tr>
          }
          @if (!syncedRows().length && !manualEntries().length) {
            <tr><td colspan="9"><app-empty-state title="No labor entered yet" message="Sync Master Time Data Search or add labor manually." /></td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordLaborTabComponent {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  private data = inject(DataService);
  showForm = signal(false);
  saving = signal(false);
  saveError = signal<string | null>(null);
  draft: Partial<ProjectLaborEntry> = { workDate: new Date().toISOString().slice(0, 10), regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 };

  private allLabor = toSignal(this.data.getProjectLaborEntries(), { initialValue: [] as ProjectLaborEntry[] });
  private allTime = toSignal(this.data.getTimeEntries(), { initialValue: [] as TimeEntry[] });

  manualEntries = computed(() => this.allLabor().filter(e => e.projectId === this.project.id));

  syncedRows = computed(() =>
    this.jobRecord.timeEntriesForProject(this.project)
      .sort((a, b) => (b.workDate ?? '').localeCompare(a.workDate ?? '')),
  );

  get syncedHours(): number {
    return this.syncedRows().reduce((s, e) => s + (e.totalHours ?? 0), 0);
  }

  get totalHours(): number {
    const manual = this.manualEntries().reduce((s, e) => s + (e.totalHours ?? 0), 0);
    return Math.max(manual, this.syncedHours, this.project.totalLaborHours ?? 0);
  }

  get totalCost(): number {
    return this.manualEntries().reduce((s, e) => s + (e.laborCost ?? 0), 0);
  }

  fmt = formatMoney;

  openLaborForm(): void {
    this.saveError.set(null);
    this.showForm.set(true);
  }

  closeLaborForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  async saveLabor(): Promise<void> {
    const reg = this.draft.regularHours ?? 0;
    const ot = this.draft.overtimeHours ?? 0;
    const dt = this.draft.doubleTimeHours ?? 0;
    const totalHours = reg + ot + dt;
    const hasCost = (this.draft.laborCost ?? 0) > 0
      || ((this.draft.costRate ?? 0) > 0 && totalHours > 0);
    if (totalHours <= 0 && !hasCost) {
      this.saveError.set('Enter hours or a labor cost amount.');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    try {
      await this.jobRecord.createLaborEntry({ ...this.draft, projectId: this.project.id });
      this.closeLaborForm();
      this.draft = { workDate: new Date().toISOString().slice(0, 10), regularHours: 0, overtimeHours: 0, doubleTimeHours: 0 };
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save labor entry.');
    } finally {
      this.saving.set(false);
    }
  }
}

@Component({
  selector: 'app-project-record-materials-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex justify-between items-center">
        <div>
          <h2 class="text-sm font-bold">Materials</h2>
          <p class="text-xs text-slate-500">
            Total material cost: {{ fmt(totalCost) }}
            @if (poCost > 0) { · {{ fmt(poCost) }} from PO log }
          </p>
        </div>
        <button type="button" (click)="openMaterialForm()" class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg">Add Material Cost</button>
      </div>
      @if (saveError()) {
        <p class="px-5 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-100">{{ saveError() }}</p>
      }
      @if (showForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="date" [(ngModel)]="draft.entryDate" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.vendor" placeholder="Vendor" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.description" placeholder="Description *" class="border rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <input [(ngModel)]="draft.category" placeholder="Category" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.quantity" (ngModelChange)="recalcTotal()" placeholder="Qty" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.unitCost" (ngModelChange)="recalcTotal()" placeholder="Unit cost" class="border rounded-lg px-3 py-2 text-sm" />
          <input type="number" [(ngModel)]="draft.totalCost" placeholder="Total cost ($)" class="border rounded-lg px-3 py-2 text-sm" />
          <div class="flex gap-2 items-center">
            <button type="button" (click)="saveMaterial()" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">{{ saving() ? 'Saving…' : 'Save' }}</button>
            <button type="button" (click)="closeMaterialForm()" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
          <tr>
            <th class="px-4 py-2 text-left">Date</th>
            <th class="px-4 py-2 text-left">Vendor</th>
            <th class="px-4 py-2 text-left">Description</th>
            <th class="px-4 py-2 text-right">Total</th>
            <th class="px-4 py-2 text-left">Source</th>
          </tr>
        </thead>
        <tbody>
          @for (row of poRows(); track row.id) {
            <tr class="border-t border-slate-100 bg-amber-50/30">
              <td class="px-4 py-2">{{ row.date || row.issuedAt || '—' }}</td>
              <td class="px-4 py-2">{{ row.vendor || '—' }}</td>
              <td class="px-4 py-2">{{ row.itemsPurchased || row.poNumber || 'PO' }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ fmt(poAmount(row)) }}</td>
              <td class="px-4 py-2 text-xs text-amber-700">PO Log</td>
            </tr>
          }
          @for (row of manualEntries(); track row.id) {
            <tr class="border-t border-slate-100">
              <td class="px-4 py-2">{{ row.entryDate }}</td>
              <td class="px-4 py-2">{{ row.vendor || '—' }}</td>
              <td class="px-4 py-2">{{ row.description }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ fmt(row.totalCost) }}</td>
              <td class="px-4 py-2 text-xs text-slate-500">Manual</td>
            </tr>
          }
          @if (!poRows().length && !manualEntries().length) {
            <tr><td colspan="5"><app-empty-state title="No materials entered yet" message="Sync PO log or add materials manually." /></td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordMaterialsTabComponent {
  @Input({ required: true }) project!: Project;
  private jobRecord = inject(JobRecordService);
  private data = inject(DataService);
  showForm = signal(false);
  saving = signal(false);
  saveError = signal<string | null>(null);
  draft: Partial<ProjectMaterial> = { entryDate: new Date().toISOString().slice(0, 10), description: '', totalCost: 0 };

  private allMaterials = toSignal(this.data.getProjectMaterials(), { initialValue: [] as ProjectMaterial[] });
  private allPos = toSignal(this.data.getPOs(), { initialValue: [] as PO[] });

  manualEntries = computed(() => this.allMaterials().filter(m => m.projectId === this.project.id));
  poRows = computed(() => this.jobRecord.posForProject(this.project.id));

  poAmount(po: PO): number {
    return po.invoicedAmount ?? po.committedAmount ?? po.originalAmount ?? 0;
  }

  get poCost(): number {
    return this.poRows().reduce((s, po) => s + this.poAmount(po), 0);
  }

  get totalCost(): number {
    const manual = this.manualEntries().reduce((s, m) => s + (m.totalCost ?? 0), 0);
    return manual + this.poCost;
  }

  fmt = formatMoney;

  openMaterialForm(): void {
    this.saveError.set(null);
    this.showForm.set(true);
  }

  closeMaterialForm(): void {
    this.showForm.set(false);
    this.saveError.set(null);
  }

  recalcTotal(): void {
    const qty = this.draft.quantity;
    const unit = this.draft.unitCost;
    if (qty != null && unit != null && qty > 0 && unit > 0) {
      this.draft.totalCost = qty * unit;
    }
  }

  async saveMaterial(): Promise<void> {
    if (!this.draft.description?.trim()) {
      this.saveError.set('Enter a description.');
      return;
    }
    const total = this.draft.totalCost
      ?? ((this.draft.quantity ?? 0) * (this.draft.unitCost ?? 0));
    if (!total || total <= 0) {
      this.saveError.set('Enter a total cost or qty × unit cost.');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    try {
      await this.jobRecord.createMaterial({
        ...this.draft,
        description: this.draft.description.trim(),
        projectId: this.project.id,
        totalCost: total,
      });
      this.closeMaterialForm();
      this.draft = { entryDate: new Date().toISOString().slice(0, 10), description: '', totalCost: 0 };
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save material entry.');
    } finally {
      this.saving.set(false);
    }
  }
}

@Component({
  selector: 'app-project-record-changes-tab',
  standalone: true,
  imports: [ChangesTabComponent],
  template: `<app-changes-tab [project]="project" [coLogOnly]="true" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordChangesTabComponent {
  @Input({ required: true }) project!: Project;
}

@Component({
  selector: 'app-project-record-todos-tab',
  standalone: true,
  imports: [TasksTabComponent],
  template: `<app-tasks-tab [project]="project" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordTodosTabComponent {
  @Input({ required: true }) project!: Project;
}

@Component({
  selector: 'app-project-record-activities-tab',
  standalone: true,
  imports: [CommonModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b"><h2 class="text-sm font-bold">Activities</h2></div>
      <ul class="divide-y divide-slate-100">
        @for (a of events(); track a.id) {
          <li class="px-5 py-3">
            <p class="text-sm font-semibold">{{ a.title }}</p>
            @if (a.description) { <p class="text-xs text-slate-500">{{ a.description }}</p> }
          </li>
        } @empty {
          <li class="p-4"><app-empty-state title="No recent activity yet" message="Edits and additions will appear here." /></li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordActivitiesTabComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) project!: Project;
  private activitySvc = inject(ActivityEventsService);
  events = signal<ActivityEvent[]>([]);
  private sub?: { unsubscribe(): void };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project?.id) {
      this.sub?.unsubscribe();
      this.sub = this.activitySvc.getProjectEvents(this.project.id).subscribe(e => this.events.set(e));
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

@Component({
  selector: 'app-project-record-subs-tab',
  standalone: true,
  imports: [ProjectSubcontractorsTabComponent],
  template: `<app-project-subcontractors-tab [project]="project" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordSubsTabComponent {
  @Input({ required: true }) project!: Project;
}

@Component({
  selector: 'app-project-record-documents-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, EmptyStateComponent],
  template: `
    <section class="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div class="px-5 py-3 border-b flex flex-wrap justify-between items-center gap-2">
        <h2 class="text-sm font-bold">Documents</h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="showLinkForm.set(true)" class="text-xs font-semibold border border-slate-200 px-3 py-1.5 rounded-lg">Add Link</button>
          @if (project.driveFolderId) {
            <label class="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1">
              <mat-icon class="!text-[16px]">upload_file</mat-icon> Upload
              <input type="file" class="hidden" (change)="onFileSelected($event)" />
            </label>
          }
        </div>
      </div>
      @if (!project.driveFolderId) {
        <p class="px-5 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
          Link a Drive folder on the job to upload files. You can still add document links below.
        </p>
      }
      @if (uploading()) {
        <p class="px-5 py-2 text-xs text-slate-500">Uploading…</p>
      }
      @if (uploadError()) {
        <p class="px-5 py-2 text-xs text-rose-700">{{ uploadError() }}</p>
      }
      @if (showLinkForm()) {
        <div class="p-4 border-b bg-slate-50 grid sm:grid-cols-2 gap-3">
          <input [(ngModel)]="draft.fileName" placeholder="Document name" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.fileUrl" placeholder="Drive or file URL" class="border rounded-lg px-3 py-2 text-sm" />
          <input [(ngModel)]="draft.documentType" placeholder="Type (Contract, COI, etc.)" class="border rounded-lg px-3 py-2 text-sm" />
          <div class="flex gap-2">
            <button type="button" (click)="saveDoc()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="showLinkForm.set(false)" class="border px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      }
      <ul class="divide-y divide-slate-100">
        @for (f of files(); track f.id) {
          <li class="px-5 py-3 flex flex-wrap items-center gap-3">
            <mat-icon class="!text-[20px] text-slate-400 shrink-0">description</mat-icon>
            <div class="min-w-0 flex-1">
              @if (f.fileUrl) {
                <a [href]="f.fileUrl" target="_blank" rel="noopener" class="text-sm font-semibold text-slate-900 hover:text-indigo-700 truncate block">{{ f.fileName }}</a>
              } @else {
                <p class="text-sm font-semibold text-slate-900 truncate">{{ f.fileName }}</p>
              }
              <p class="text-xs text-slate-500">{{ f.documentType }}</p>
            </div>
            <button type="button" (click)="removeDoc(f.id)"
                    class="text-xs font-semibold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg hover:bg-rose-100">
              Delete
            </button>
          </li>
        } @empty {
          <li class="p-4"><app-empty-state title="No documents yet" message="Upload a file or add a document link." /></li>
        }
      </ul>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectRecordDocumentsTabComponent {
  @Input({ required: true }) project!: Project;
  private data = inject(DataService);
  private workflowSave = inject(ProjectWorkflowSaveService);
  private projectFiles = inject(ProjectFilesRepository);
  showLinkForm = signal(false);
  uploading = signal(false);
  uploadError = signal<string | null>(null);
  draft = { fileName: '', fileUrl: '', documentType: 'Other' };

  private allFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  files = computed(() => this.allFiles().filter(f => f.projectId === this.project.id && !f.archived));

  async saveDoc(): Promise<void> {
    if (!this.draft.fileName.trim()) return;
    await firstValueFrom(this.data.createProjectFile({
      projectId: this.project.id,
      fileName: this.draft.fileName.trim(),
      fileUrl: this.draft.fileUrl.trim() || undefined,
      documentType: this.draft.documentType.trim() || 'Other',
      documentStatus: 'Linked',
      sourceType: 'manual',
    }));
    this.showLinkForm.set(false);
    this.draft = { fileName: '', fileUrl: '', documentType: 'Other' };
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.project.driveFolderId) return;
    this.uploading.set(true);
    this.uploadError.set(null);
    try {
      await this.workflowSave.saveProjectWorkflowFile({
        projectId: this.project.id,
        workflowType: 'closeout',
        folderKey: 'CORRESPONDENCE',
        fallbackFolderKeys: ['BILLING', 'SUBS', 'RFIS'],
        fileName: file.name,
        content: file,
        mimeType: file.type || 'application/octet-stream',
        documentType: 'General',
        requestAuthIfNeeded: true,
      });
    } catch (err) {
      this.uploadError.set(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  async removeDoc(id: string): Promise<void> {
    await firstValueFrom(this.projectFiles.archive(id, 'Removed from job profile'));
  }
}
