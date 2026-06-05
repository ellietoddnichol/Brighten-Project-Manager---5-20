import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ProjectBudgetLine } from '@app/models/types';
import { ProjectFinancialSummary } from '@shared/utils/financial';
import { BudgetLineService } from '@features/projects/services/budget-line.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { DEFAULT_BUDGET_CATEGORIES, ComputedBudgetLine } from '@features/projects/utils/budget-line.compute';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { ImportDataService } from '@core/services/import-data.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { ProjectForemanBonusTabComponent } from './project-foreman-bonus-tab';
import { ProjectApiService } from '@core/services/api/project-api.service';
import { BudgetSegment } from '@features/projects/utils/project-money.compute';

type BudgetInnerTab = 'lines' | 'labor-bonus';

@Component({
  selector: 'app-budget-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, ProjectForemanBonusTabComponent],
  template: `
    <div class="space-y-4">
      @if (!simplified) {
      <div class="flex flex-wrap gap-1.5 border-b border-slate-200 pb-1">
        <button type="button" (click)="activeInnerTab.set('lines')"
                class="px-3 py-1.5 rounded-t-lg text-xs font-semibold border-b-2"
                [class.border-slate-900]="activeInnerTab() === 'lines'"
                [class.text-slate-900]="activeInnerTab() === 'lines'"
                [class.border-transparent]="activeInnerTab() !== 'lines'"
                [class.text-slate-500]="activeInnerTab() !== 'lines'">
          Budget Lines
        </button>
        <button type="button" (click)="activeInnerTab.set('labor-bonus')"
                class="px-3 py-1.5 rounded-t-lg text-xs font-semibold border-b-2"
                [class.border-slate-900]="activeInnerTab() === 'labor-bonus'"
                [class.text-slate-900]="activeInnerTab() === 'labor-bonus'"
                [class.border-transparent]="activeInnerTab() !== 'labor-bonus'"
                [class.text-slate-500]="activeInnerTab() !== 'labor-bonus'">
          Labor Bonus
        </button>
      </div>
      }

      @if (!simplified && activeInnerTab() === 'labor-bonus') {
        <app-project-foreman-bonus-tab [project]="project" />
      } @else {
      @if (rollup().budgetIsEstimated) {
        <div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong>Budget Basis = Estimated from 20% target.</strong>
            Target cost budget is 80% of current contract until a real budget workbook is imported.
          </div>
          @if (projectApi.isEnabled()) {
            <button type="button" (click)="approveEstimatedBudget()"
                    [disabled]="budgetConfirming()"
                    class="shrink-0 bg-amber-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
              {{ budgetConfirming() ? 'Saving…' : 'Approve 80% Budget' }}
            </button>
          }
        </div>
      } @else if (financial().budgetBasis === 'Imported') {
        <div class="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong>Budget Basis = Imported from workbook.</strong>
            @if (importSnapshots().length) {
              {{ importSnapshots().length }} snapshot(s) on file — Original and Updated preserved.
            }
            @if (sovLines().length) {
              · {{ sovLines().length }} SOV line(s) imported
            }
          </div>
          @if (importSnapshots().length) {
            <button type="button" (click)="openSnapshotDrawer()"
                    class="text-xs font-semibold text-emerald-900 underline">
              View snapshots
            </button>
          }
        </div>
      }

      @if (segment !== 'sources') {
      <div class="grid gap-2.5" [ngClass]="simplified ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'">
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Budget</p>
          <p class="text-lg font-bold">{{ rollup().budgetAmount | currency }}</p>
        </div>
        @if (!simplified) {
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Committed</p>
          <p class="text-lg font-bold text-indigo-800">{{ rollup().committedAmount | currency }}</p>
        </div>
        }
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Actual Cost</p>
          <p class="text-lg font-bold text-slate-900">{{ rollup().costToDate | currency }}</p>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Projected Final</p>
          <p class="text-lg font-bold">{{ rollup().estimatedFinalCost | currency }}</p>
        </div>
        @if (segment === 'variance' || !simplified) {
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
             [class.bg-red-50]="totalVariance() < 0" [class.border-red-200]="totalVariance() < 0">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1">Variance</p>
          <p class="text-lg font-bold" [class.text-red-700]="totalVariance() < 0">{{ totalVariance() | currency }}</p>
        </div>
        }
        @if (!simplified) {
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cost to Complete</p>
          <p class="text-lg font-bold">{{ rollup().costToComplete | currency }}</p>
        </div>
        }
      </div>
      }

      @if (segment === 'budget' || segment === 'actuals' || segment === 'variance' || !simplified) {
      <!-- Category split -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        @for (cat of categoryCards(); track cat.label) {
          <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{{ cat.label }}</p>
            <p class="text-xs text-slate-500">Budget {{ cat.budget | currency }}</p>
            <p class="text-xs text-slate-500">Actual {{ cat.actual | currency }}</p>
            <p class="text-sm font-bold mt-1" [class.text-red-600]="cat.variance < 0">{{ cat.variance | currency }}</p>
          </div>
        }
      </div>
      }

      @if ((segment === 'sources' || !simplified) && qbCostTransactions().length) {
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div class="p-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-bold text-slate-900">QuickBooks Detail Costs</h3>
            <span class="text-[10px] font-bold uppercase text-blue-700 bg-blue-50 px-2 py-1 rounded">QuickBooks Detail</span>
          </div>
          <div class="overflow-x-auto max-h-64">
            <table class="w-full text-sm min-w-[900px]">
              <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                <tr>
                  <th class="px-4 py-2 text-left">Date</th>
                  <th class="px-4 py-2 text-left">Vendor</th>
                  <th class="px-4 py-2 text-left">Category</th>
                  <th class="px-4 py-2 text-left">Account</th>
                  <th class="px-4 py-2 text-right">Amount</th>
                  <th class="px-4 py-2 text-left">WIP</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                @for (t of qbCostTransactions(); track t.id) {
                  <tr>
                    <td class="px-4 py-2">{{ t.transactionDate || '—' }}</td>
                    <td class="px-4 py-2">{{ t.vendorName || '—' }}</td>
                    <td class="px-4 py-2">{{ t.costCategory }}</td>
                    <td class="px-4 py-2 text-xs text-slate-500">{{ t.account || t.memo || '—' }}</td>
                    <td class="px-4 py-2 text-right font-mono">{{ t.amount | currency }}</td>
                    <td class="px-4 py-2 text-xs">{{ t.includeInWipActuals ? 'Included' : 'Excluded' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (segment === 'budget' || segment === 'variance' || segment === 'actuals' || !simplified) {
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-base font-bold text-slate-900">Budget Lines</h3>
          <button type="button" (click)="openNewLine()" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5">
            <mat-icon class="!text-[16px]">add</mat-icon> Add Line
          </button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr class="bg-white border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
                <th class="px-4 py-2.5 font-bold">Code / Category</th>
                <th class="px-3 py-2.5 font-bold text-right">Budget</th>
                <th class="px-3 py-2.5 font-bold text-right">Committed</th>
                <th class="px-3 py-2.5 font-bold text-right text-red-600">Actual</th>
                <th class="px-3 py-2.5 font-bold text-right">Projected</th>
                <th class="px-3 py-2.5 font-bold text-right">CTC</th>
                <th class="px-3 py-2.5 font-bold text-right">Variance</th>
                <th class="px-3 py-2.5 font-bold">Source</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              @for (line of computedLines(); track line.id) {
                <tr class="hover:bg-slate-50 cursor-pointer" (click)="editLine(line)">
                  <td class="px-4 py-2.5">
                    <p class="text-slate-900 font-bold">{{ line.costCode || '—' }}</p>
                    <p class="text-[10px] text-slate-500 uppercase">{{ line.category }}</p>
                    @if (line.isEstimated) {
                      <span class="text-[10px] text-amber-700 font-bold">Estimated</span>
                    }
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono">{{ line.budgetAmount | currency }}</td>
                  <td class="px-3 py-2.5 text-right font-mono text-indigo-800">{{ line.committedAmount | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-red-600 font-mono">{{ line.actualCost | currency }}</td>
                  <td class="px-3 py-2.5 text-right font-mono">{{ line.projectedCost | currency }}</td>
                  <td class="px-3 py-2.5 text-right font-mono">{{ line.costToComplete | currency }}</td>
                  <td class="px-3 py-2.5 text-right font-mono font-bold" [class.text-red-600]="line.variance < 0">{{ line.variance | currency }}</td>
                  <td class="px-3 py-2.5 text-xs">
                    <span class="px-2 py-0.5 rounded-full font-semibold"
                          [class.bg-emerald-100]="sourceBadge(line) === 'Budget Workbook'"
                          [class.text-emerald-800]="sourceBadge(line) === 'Budget Workbook'"
                          [class.bg-slate-100]="sourceBadge(line) === 'Manual'"
                          [class.text-slate-700]="sourceBadge(line) === 'Manual'"
                          [class.bg-blue-100]="sourceBadge(line) !== 'Budget Workbook' && sourceBadge(line) !== 'Manual'"
                          [class.text-blue-800]="sourceBadge(line) !== 'Budget Workbook' && sourceBadge(line) !== 'Manual'">
                      {{ sourceBadge(line) }}
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="px-4 py-8 text-center text-slate-400 italic">No budget lines — add lines or import seed/QB data.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      }

      @if (snapshotDrawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeSnapshotDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">Imported Budget Snapshots</h3>
            <button type="button" (click)="closeSnapshotDrawer()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-4">
            @for (snap of importSnapshots(); track snap.id) {
              <div class="border rounded-lg p-4">
                <p class="font-semibold">{{ snap.snapshotType }} — {{ snap.sourceSheetName }}</p>
                <p class="text-xs text-slate-500">{{ snap.sourceFileName }}</p>
                <div class="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>Budget: {{ snap.totalBudget | currency }}</div>
                  <div>Actual: {{ snap.totalActual | currency }}</div>
                  @if (snap.contractAmount) {
                    <div>Contract: {{ snap.contractAmount | currency }}</div>
                  }
                </div>
              </div>
            } @empty {
              <p class="text-slate-400 italic">No imported snapshots for this job.</p>
            }

            @if (originalSnapshot() && updatedSnapshot()) {
              <div class="border border-amber-200 bg-amber-50 rounded-lg p-4 text-sm">
                <p class="font-bold mb-2">Original vs Updated Budget</p>
                <p>Original: {{ originalSnapshot()?.totalBudget | currency }}</p>
                <p>Updated: {{ updatedSnapshot()?.totalBudget | currency }}</p>
                <p class="mt-1">Delta: {{ (updatedSnapshot()!.totalBudget! - (originalSnapshot()?.totalBudget ?? 0)) | currency }}</p>
              </div>
            }

            @if (sovLines().length) {
              <div>
                <h4 class="text-sm font-bold mb-2">SOV Lines</h4>
                <div class="overflow-x-auto border rounded-lg">
                  <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-[10px] uppercase text-slate-500">
                      <tr>
                        <th class="px-3 py-2 text-left">#</th>
                        <th class="px-3 py-2 text-left">Description</th>
                        <th class="px-3 py-2 text-right">Scheduled</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y">
                      @for (sov of sovLines(); track sov.id) {
                        <tr>
                          <td class="px-3 py-2">{{ sov.lineNumber }}</td>
                          <td class="px-3 py-2">{{ sov.description }}</td>
                          <td class="px-3 py-2 text-right font-mono">{{ sov.scheduledValue | currency }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        </aside>
      }

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">{{ editingLineId() ? 'Edit Budget Line' : 'New Budget Line' }}</h3>
            <button type="button" (click)="closeDrawer()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
              <select [(ngModel)]="lineDraft.category" class="w-full px-3 py-2 border rounded-lg text-sm">
                @for (c of defaultCategories; track c.category) {
                  <option [value]="c.category">{{ c.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Cost Code</label>
              <input [(ngModel)]="lineDraft.costCode" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
              <input [(ngModel)]="lineDraft.description" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Budget Amount</label>
              <input type="number" [(ngModel)]="lineBudgetAmount" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Actual Cost (override)</label>
              <input type="number" [(ngModel)]="lineDraft.actualCost" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Cost to Complete (manual)</label>
              <input type="number" [(ngModel)]="lineDraft.costToComplete" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
              <textarea [(ngModel)]="lineDraft.notes" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [(ngModel)]="lineDraft.isEstimated"> Mark as estimated
            </label>
            <button type="button" (click)="saveLine()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold text-sm">Save Line</button>
          </div>
        </aside>
      }
      }
    </div>
  `,
})
export class BudgetTabComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) summary!: ProjectFinancialSummary;
  @Input() segment: BudgetSegment = 'budget';
  @Input() simplified = false;

  activeInnerTab = signal<BudgetInnerTab>('lines');

  private budgetSvc = inject(BudgetLineService);
  private financialSvc = inject(ProjectFinancialService);
  private importData = inject(ImportDataService);
  private qbSyncData = inject(QuickBooksSyncDataService);
  private data = inject(DataService);
  projectApi = inject(ProjectApiService);
  budgetConfirming = signal(false);
  budgetConfirmMessage = signal<string | null>(null);

  financial = computed(() => this.financialSvc.computeForProject(this.project));
  importSnapshots = computed(() => this.importData.snapshotsForJob(this.project.projectNumber));
  sovLines = computed(() => this.importData.sovForJob(this.project.projectNumber));
  qbCostTransactions = computed(() => this.qbSyncData.costTransactionsForProject(this.project.id));
  originalSnapshot = computed(() =>
    this.importSnapshots().find(s => s.snapshotType === 'Original'),
  );
  updatedSnapshot = computed(() =>
    this.importSnapshots().find(s => s.snapshotType === 'UpdatedBudget'),
  );

  budgetLines = toSignal(this.data.getBudgetLines(), { initialValue: [] });

  drawerOpen = signal(false);
  snapshotDrawerOpen = signal(false);
  editingLineId = signal<string | null>(null);
  lineDraft: Partial<ProjectBudgetLine> = {};
  lineBudgetAmount = 0;

  readonly defaultCategories = DEFAULT_BUDGET_CATEGORIES;

  rollup = computed(() => this.budgetSvc.rollupForProject(this.project));
  computedLines = computed(() => this.rollup().lines);

  totalVariance = computed(() =>
    this.computedLines().reduce((s, l) => s + l.variance, 0),
  );

  categoryCards = computed(() => {
    const fin = this.financialSvc.computeForProject(this.project);
    const otherBudget = fin.equipmentBudget + fin.otherBudget;
    const otherActual = fin.equipmentCostToDate + fin.otherCostToDate;
    return [
      { label: 'Labor', budget: fin.selfPerformedBudget, actual: fin.selfPerformedCostToDate, variance: fin.selfPerformedBudget - fin.selfPerformedCostToDate },
      { label: 'Materials', budget: fin.materialBudget, actual: fin.materialCostToDate, variance: fin.materialBudget - fin.materialCostToDate },
      { label: 'Subcontractors', budget: fin.subcontractorBudget, actual: fin.subcontractorCostToDate, variance: fin.subcontractorBudget - fin.subcontractorCostToDate },
      { label: 'Other / Equipment Rental', budget: otherBudget, actual: otherActual, variance: otherBudget - otherActual },
    ];
  });

  sourceBadge(line: ComputedBudgetLine): string {
    if (line.importSource === 'job-cost-budget' || line.source === 'Imported') return 'Budget Workbook';
    if (line.source === 'QuickBooks') return 'QuickBooks';
    if (line.source === 'Manual') return 'Manual';
    return line.source || 'Manual';
  }

  openSnapshotDrawer(): void {
    this.snapshotDrawerOpen.set(true);
  }

  closeSnapshotDrawer(): void {
    this.snapshotDrawerOpen.set(false);
  }

  openNewLine(): void {
    this.editingLineId.set(null);
    this.lineDraft = { category: 'Materials', source: 'Manual', actualCost: 0, costToComplete: 0 };
    this.lineBudgetAmount = 0;
    this.drawerOpen.set(true);
  }

  editLine(line: ComputedBudgetLine): void {
    this.editingLineId.set(line.id);
    this.lineDraft = { ...line, source: 'Manual' };
    this.lineBudgetAmount = line.budgetAmount;
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.editingLineId.set(null);
  }

  async saveLine(): Promise<void> {
    this.lineDraft.budgetAmount = this.lineBudgetAmount;
    this.lineDraft.originalBudget = this.lineBudgetAmount;
    await this.budgetSvc.saveLine(this.project, this.lineDraft, this.editingLineId());
    this.closeDrawer();
  }

  async approveEstimatedBudget(): Promise<void> {
    if (this.budgetConfirming() || !this.projectApi.isEnabled()) return;
    this.budgetConfirming.set(true);
    this.budgetConfirmMessage.set(null);
    try {
      const result = await this.projectApi.confirmEstimatedBudget(this.project.id);
      this.budgetConfirmMessage.set(
        `Approved ${result.inserted} budget lines totaling ${result.totalBudget.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in Cloud SQL.`,
      );
    } catch (err) {
      this.budgetConfirmMessage.set(err instanceof Error ? err.message : 'Budget approve failed');
    } finally {
      this.budgetConfirming.set(false);
    }
  }
}
