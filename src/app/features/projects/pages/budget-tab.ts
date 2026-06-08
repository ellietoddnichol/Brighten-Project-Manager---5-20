import { Component, Input, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
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
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { ProjectApiService, BudgetLineWriteInput, LaborEntryWriteInput } from '@core/services/api/project-api.service';
import { ProjectSqlLaborEntry } from '@core/services/api/project-labor-api.mapper';
import { ProjectSqlBudgetLine } from '@core/services/api/project-budget-api.mapper';
import { BudgetSegment } from '@features/projects/utils/project-money.compute';
import { BudgetRollup } from '@features/projects/utils/budget-line.compute';

type BudgetInnerTab = 'lines' | 'labor-bonus' | 'labor-hours';

@Component({
  selector: 'app-budget-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, ProjectForemanBonusTabComponent, EmptyStateComponent],
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
        @if (projectApi.isEnabled()) {
        <button type="button" (click)="onSelectLaborHours()"
                class="px-3 py-1.5 rounded-t-lg text-xs font-semibold border-b-2"
                [class.border-slate-900]="activeInnerTab() === 'labor-hours'"
                [class.text-slate-900]="activeInnerTab() === 'labor-hours'"
                [class.border-transparent]="activeInnerTab() !== 'labor-hours'"
                [class.text-slate-500]="activeInnerTab() !== 'labor-hours'">
          Labor Hours
        </button>
        }
      </div>
      }

      @if (!simplified && activeInnerTab() === 'labor-bonus') {
        <app-project-foreman-bonus-tab [project]="project" />
      } @else if (!simplified && activeInnerTab() === 'labor-hours') {
        <div class="space-y-4">
          <div class="grid gap-2.5 grid-cols-2 md:grid-cols-4">
            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Entries</p>
              <p class="text-lg font-bold">{{ labor()?.entryCount ?? 0 }}</p>
            </div>
            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Hours</p>
              <p class="text-lg font-bold">{{ labor()?.totalHours ?? 0 | number:'1.0-2' }}</p>
            </div>
            <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
              <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Labor Cost</p>
              <p class="text-lg font-bold">{{ labor()?.totalLaborCost ?? 0 | currency }}</p>
            </div>
          </div>

          <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div class="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 class="text-base font-bold text-slate-900">Labor Hours (SQL)</h3>
              <div class="flex items-center gap-2">
                <button type="button" (click)="openImportLabor()" class="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50">
                  <mat-icon class="!text-[16px]">upload</mat-icon> Bulk Import
                </button>
                <button type="button" (click)="openNewLaborEntry()" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5">
                  <mat-icon class="!text-[16px]">add</mat-icon> Add Entry
                </button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr class="bg-white border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <th class="px-3 py-2 text-left">Date</th>
                    <th class="px-3 py-2 text-left">Employee</th>
                    <th class="px-3 py-2 text-left">Classification</th>
                    <th class="px-3 py-2 text-right">Reg</th>
                    <th class="px-3 py-2 text-right">OT</th>
                    <th class="px-3 py-2 text-right">DT</th>
                    <th class="px-3 py-2 text-right">Cost</th>
                    <th class="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 text-sm">
                  @for (entry of labor()?.entries ?? []; track entry.id) {
                    <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700 cursor-pointer" (click)="editLaborEntry(entry)">
                      <td class="px-3 py-2.5">{{ entry.workDate || '—' }}</td>
                      <td class="px-3 py-2.5 font-bold text-slate-900">{{ entry.employeeName || '—' }}</td>
                      <td class="px-3 py-2.5 text-slate-500">{{ entry.classification || '—' }}</td>
                      <td class="px-3 py-2.5 text-right font-mono">{{ entry.regularHours }}</td>
                      <td class="px-3 py-2.5 text-right font-mono">{{ entry.overtimeHours }}</td>
                      <td class="px-3 py-2.5 text-right font-mono">{{ entry.doubleTimeHours }}</td>
                      <td class="px-3 py-2.5 text-right font-mono">{{ entry.laborCost != null ? (entry.laborCost | currency) : '—' }}</td>
                      <td class="px-3 py-2.5 text-right" (click)="$event.stopPropagation()">
                        <button type="button" (click)="deleteLaborEntryRow(entry)" class="text-rose-700 hover:text-rose-900" title="Delete entry">
                          <mat-icon class="!text-[16px]">delete</mat-icon>
                        </button>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="px-4 py-8 text-center text-slate-400 italic">No labor entries yet — add an entry or bulk import to seed labor data.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      } @else {
      @if (showEstimatedBanner()) {
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
      } @else if (sqlBudgetConfirmed()) {
        <div class="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          <strong>Budget Basis = 80% target confirmed in Cloud SQL.</strong>
          {{ sqlBudget()?.lineCount }} budget line(s) on file — import a workbook when the real budget is ready.
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
          <p class="text-lg font-bold">{{ displayRollup().budgetAmount | currency }}</p>
        </div>
        @if (!simplified) {
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Committed</p>
          <p class="text-lg font-bold text-indigo-800">{{ displayRollup().committedAmount | currency }}</p>
        </div>
        }
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Actual Cost</p>
          <p class="text-lg font-bold text-slate-900">{{ displayRollup().costToDate | currency }}</p>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Projected Final</p>
          <p class="text-lg font-bold">{{ displayRollup().estimatedFinalCost | currency }}</p>
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
          <p class="text-lg font-bold">{{ displayRollup().costToComplete | currency }}</p>
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
            <p class="text-sm font-bold mt-1" [class.text-rose-700]="cat.variance < 0">{{ cat.variance | currency }}</p>
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
              <thead class="bg-white text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <tr>
                  <th class="px-3 py-2 text-left">Date</th>
                  <th class="px-3 py-2 text-left">Vendor</th>
                  <th class="px-3 py-2 text-left">Category</th>
                  <th class="px-3 py-2 text-left">Account</th>
                  <th class="px-3 py-2 text-right">Amount</th>
                  <th class="px-3 py-2 text-left">WIP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (t of qbCostTransactions(); track t.id) {
                  <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                    <td class="px-3 py-2.5">{{ t.transactionDate || '—' }}</td>
                    <td class="px-3 py-2.5">{{ t.vendorName || '—' }}</td>
                    <td class="px-3 py-2.5">{{ t.costCategory }}</td>
                    <td class="px-3 py-2.5 text-xs text-slate-500">{{ t.account || t.memo || '—' }}</td>
                    <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ t.amount | currency }}</td>
                    <td class="px-3 py-2.5 text-xs">{{ t.includeInWipActuals ? 'Included' : 'Excluded' }}</td>
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
          <div class="flex items-center gap-2">
            @if (sqlBudget() && projectApi.isEnabled()) {
            <button type="button" (click)="openImportLines()" class="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50">
              <mat-icon class="!text-[16px]">upload</mat-icon> Bulk Import
            </button>
            }
            <button type="button" (click)="openNewLine()" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5">
              <mat-icon class="!text-[16px]">add</mat-icon> Add Line
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr class="bg-white border-b border-slate-200 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <th class="px-3 py-2 text-left">Code / Category</th>
                <th class="px-3 py-2 text-right">Budget</th>
                <th class="px-3 py-2 text-right">Committed</th>
                <th class="px-3 py-2 text-right">Actual</th>
                <th class="px-3 py-2 text-right">Projected</th>
                <th class="px-3 py-2 text-right">CTC</th>
                <th class="px-3 py-2 text-right">Variance</th>
                <th class="px-3 py-2 text-left">Source</th>
                @if (sqlBudget()) {
                <th class="px-3 py-2 text-right">Actions</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              @for (line of displayLines(); track line.id) {
                <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700 cursor-pointer" (click)="editLine(line)">
                  <td class="px-3 py-2.5">
                    <p class="text-slate-900 font-bold">{{ line.costCode || '—' }}</p>
                    <p class="text-[10px] text-slate-500 uppercase">{{ line.category }}</p>
                    @if (line.isEstimated) {
                      <span class="text-[10px] text-amber-700 font-bold">Estimated</span>
                    }
                  </td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ line.budgetAmount | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ line.committedAmount | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono" [class.text-rose-700]="line.actualCost > 0">{{ line.actualCost | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ line.projectedCost | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ line.costToComplete | currency }}</td>
                  <td class="px-3 py-2.5 text-right text-xs font-mono font-bold" [class.text-emerald-700]="line.variance > 0" [class.text-rose-700]="line.variance < 0">{{ line.variance | currency }}</td>
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
                  @if (sqlBudget()) {
                  <td class="px-3 py-2.5 text-right" (click)="$event.stopPropagation()">
                    <button type="button" (click)="deleteLine(line)" class="text-rose-700 hover:text-rose-900" title="Delete line">
                      <mat-icon class="!text-[16px]">delete</mat-icon>
                    </button>
                  </td>
                  }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="sqlBudget() ? 9 : 8" class="px-4 py-8 text-center text-slate-400 italic">No budget lines — add lines or import seed/QB data.</td></tr>
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
              <app-empty-state title="No imported snapshots for this job" />
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
            @if (lineSaveError()) {
              <p class="text-sm text-rose-700">{{ lineSaveError() }}</p>
            }
            <button type="button" (click)="saveLine()" [disabled]="lineSaving()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
              {{ lineSaving() ? 'Saving…' : 'Save Line' }}
            </button>
          </div>
        </aside>
      }

      @if (importDrawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeImportLines()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">Bulk Import Budget Lines</h3>
            <button type="button" (click)="closeImportLines()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-4">
            <p class="text-sm text-slate-600">
              Paste rows as CSV with a header row. Required columns: <code class="text-xs">costCode, category</code>.
              Optional: <code class="text-xs">description, budgetAmount, actualToDate, committedAmount, projectedFinalCost, varianceAmount, status, notes</code>.
            </p>
            <textarea [(ngModel)]="importText" rows="10" placeholder="costCode,category,description,budgetAmount&#10;01-100,Labor,Site supervision,50000&#10;01-200,Materials,Concrete,120000"
                      class="w-full px-3 py-2 border rounded-lg text-xs font-mono"></textarea>
            @if (importError()) {
              <p class="text-sm text-rose-700">{{ importError() }}</p>
            }
            @if (importMessage()) {
              <p class="text-sm text-emerald-700">{{ importMessage() }}</p>
            }
            <button type="button" (click)="submitImportLines()" [disabled]="importSubmitting()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
              {{ importSubmitting() ? 'Importing…' : 'Import Lines' }}
            </button>
          </div>
        </aside>
      }

      @if (laborDrawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeLaborEntry()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">{{ editingLaborEntryId() ? 'Edit Labor Entry' : 'New Labor Entry' }}</h3>
            <button type="button" (click)="closeLaborEntry()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Work Date</label>
              <input type="date" [(ngModel)]="laborDraft.workDate" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Employee Name</label>
              <input [(ngModel)]="laborDraft.employeeName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Classification</label>
              <input [(ngModel)]="laborDraft.classification" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Reg Hrs</label>
                <input type="number" [(ngModel)]="laborDraft.regularHours" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">OT Hrs</label>
                <input type="number" [(ngModel)]="laborDraft.overtimeHours" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">DT Hrs</label>
                <input type="number" [(ngModel)]="laborDraft.doubleTimeHours" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Hourly Rate (optional)</label>
              <input type="number" [(ngModel)]="laborDraft.hourlyRate" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Labor Cost (optional override)</label>
              <input type="number" [(ngModel)]="laborDraft.laborCost" class="w-full px-3 py-2 border rounded-lg text-sm">
              <p class="text-[11px] text-slate-400 mt-1">Leave blank to auto-calculate from hours × rate (OT 1.5x, DT 2x).</p>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
              <textarea [(ngModel)]="laborDraft.notes" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
            @if (laborSaveError()) {
              <p class="text-sm text-rose-700">{{ laborSaveError() }}</p>
            }
            <button type="button" (click)="saveLaborEntry()" [disabled]="laborSaving()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
              {{ laborSaving() ? 'Saving…' : 'Save Entry' }}
            </button>
          </div>
        </aside>
      }

      @if (laborImportDrawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeImportLabor()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">Bulk Import Labor Entries</h3>
            <button type="button" (click)="closeImportLabor()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-4">
            <p class="text-sm text-slate-600">
              Paste rows as CSV with a header row. Required columns: <code class="text-xs">workDate, employeeName, regularHours, overtimeHours, doubleTimeHours</code>.
              Optional: <code class="text-xs">classification, hourlyRate, laborCost, notes</code>. Dates must be <code class="text-xs">YYYY-MM-DD</code>.
            </p>
            <textarea [(ngModel)]="laborImportText" rows="10" placeholder="workDate,employeeName,classification,regularHours,overtimeHours,doubleTimeHours,hourlyRate&#10;2026-06-01,Jane Doe,Carpenter,8,0,0,32.50"
                      class="w-full px-3 py-2 border rounded-lg text-xs font-mono"></textarea>
            @if (laborImportError()) {
              <p class="text-sm text-rose-700">{{ laborImportError() }}</p>
            }
            @if (laborImportMessage()) {
              <p class="text-sm text-emerald-700">{{ laborImportMessage() }}</p>
            }
            <button type="button" (click)="submitImportLabor()" [disabled]="laborImportSubmitting()"
                    class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
              {{ laborImportSubmitting() ? 'Importing…' : 'Import Entries' }}
            </button>
          </div>
        </aside>
      }
      }
    </div>
  `,
})
export class BudgetTabComponent implements OnChanges {
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
  lineSaving = signal(false);
  lineSaveError = signal<string | null>(null);

  importDrawerOpen = signal(false);
  importText = '';
  importSubmitting = signal(false);
  importError = signal<string | null>(null);
  importMessage = signal<string | null>(null);

  labor = computed(() => this.projectApi.labor());
  laborLoaded = signal(false);

  laborDrawerOpen = signal(false);
  editingLaborEntryId = signal<string | null>(null);
  laborDraft: Partial<LaborEntryWriteInput> = {};
  laborSaving = signal(false);
  laborSaveError = signal<string | null>(null);

  laborImportDrawerOpen = signal(false);
  laborImportText = '';
  laborImportSubmitting = signal(false);
  laborImportError = signal<string | null>(null);
  laborImportMessage = signal<string | null>(null);

  readonly defaultCategories = DEFAULT_BUDGET_CATEGORIES;

  rollup = computed(() => this.budgetSvc.rollupForProject(this.project));

  sqlBudget = computed(() => {
    const budget = this.projectApi.budgetSummary();
    if (!budget || this.projectApi.budgetActiveSource() !== 'api') return null;
    const keys = [this.project.id, this.project.projectNumber].filter(Boolean);
    const apiKeys = [budget.projectId, budget.jobNumber].filter(Boolean);
    return apiKeys.some(apiKey => keys.some(key => key === apiKey || key.replace(/^J/i, '') === apiKey.replace(/^J/i, '')))
      ? budget
      : null;
  });

  sqlBudgetConfirmed = computed(() => (this.sqlBudget()?.lineCount ?? 0) > 0);

  showEstimatedBanner = computed(() => this.rollup().budgetIsEstimated && !this.sqlBudgetConfirmed());

  displayRollup = computed((): BudgetRollup => {
    const sql = this.sqlBudget();
    const base = this.rollup();
    if (!sql?.lineCount) return base;
    const laborBudget = sql.lines.filter(l => l.category === 'Labor').reduce((s, l) => s + l.budgetAmount, 0);
    const subBudget = sql.lines.filter(l => l.category === 'Subcontractors').reduce((s, l) => s + l.budgetAmount, 0);
    const matBudget = sql.lines.filter(l => l.category === 'Materials').reduce((s, l) => s + l.budgetAmount, 0);
    const otherBudget = sql.lines.filter(l => !['Labor', 'Subcontractors', 'Materials'].includes(l.category))
      .reduce((s, l) => s + l.budgetAmount, 0);
    return {
      ...base,
      budgetAmount: sql.totalBudget,
      budgetIsEstimated: false,
      budgetBasis: 'Manual',
      selfPerformedBudget: laborBudget,
      subcontractorBudget: subBudget,
      materialBudget: matBudget,
      otherBudget,
      equipmentBudget: 0,
      lines: this.mapSqlBudgetLines(sql.lines),
    };
  });

  computedLines = computed(() => this.displayRollup().lines);

  totalVariance = computed(() =>
    this.computedLines().reduce((s, l) => s + l.variance, 0),
  );

  displayLines = computed(() => this.computedLines());

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project && this.projectApi.isEnabled()) {
      void this.projectApi.loadProjectBudget(this.project.projectNumber || this.project.id);
    }
  }

  private mapSqlBudgetLines(lines: ProjectSqlBudgetLine[]): ComputedBudgetLine[] {
    return lines.map(line => ({
      id: line.id,
      projectId: this.project.id,
      costCode: line.costCode,
      category: line.category as ProjectBudgetLine['category'],
      description: line.description,
      budgetAmount: line.budgetAmount,
      originalBudget: line.budgetAmount,
      approvedCOBudget: 0,
      revisedBudget: line.budgetAmount,
      actualCost: line.actualCost,
      committedAmount: line.committedAmount,
      projectedCost: line.projectedFinalCost,
      projectedFinalCost: line.projectedFinalCost,
      costToComplete: Math.max(0, line.projectedFinalCost - line.actualCost),
      variance: line.budgetAmount - line.projectedFinalCost,
      source: line.sourceType.includes('estimated') ? 'Calculated' : 'Manual',
      status: 'Active',
      isEstimated: line.sourceType.includes('estimated'),
    }));
  }

  categoryCards = computed(() => {
    const rollup = this.displayRollup();
    const fin = this.financialSvc.computeForProject(this.project);
    const useSql = this.sqlBudgetConfirmed();
    const otherBudget = useSql ? rollup.otherBudget : fin.equipmentBudget + fin.otherBudget;
    const otherActual = fin.equipmentCostToDate + fin.otherCostToDate;
    return [
      { label: 'Labor', budget: useSql ? rollup.selfPerformedBudget : fin.selfPerformedBudget, actual: fin.selfPerformedCostToDate, variance: (useSql ? rollup.selfPerformedBudget : fin.selfPerformedBudget) - fin.selfPerformedCostToDate },
      { label: 'Materials', budget: useSql ? rollup.materialBudget : fin.materialBudget, actual: fin.materialCostToDate, variance: (useSql ? rollup.materialBudget : fin.materialBudget) - fin.materialCostToDate },
      { label: 'Subcontractors', budget: useSql ? rollup.subcontractorBudget : fin.subcontractorBudget, actual: fin.subcontractorCostToDate, variance: (useSql ? rollup.subcontractorBudget : fin.subcontractorBudget) - fin.subcontractorCostToDate },
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
    this.lineSaveError.set(null);
    this.drawerOpen.set(true);
  }

  editLine(line: ComputedBudgetLine): void {
    this.editingLineId.set(line.id);
    this.lineDraft = { ...line, source: 'Manual' };
    this.lineBudgetAmount = line.budgetAmount;
    this.lineSaveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.editingLineId.set(null);
  }

  async saveLine(): Promise<void> {
    this.lineDraft.budgetAmount = this.lineBudgetAmount;
    this.lineDraft.originalBudget = this.lineBudgetAmount;
    this.lineSaveError.set(null);

    const sql = this.sqlBudget();
    if (sql) {
      this.lineSaving.set(true);
      try {
        const idOrJob = this.project.projectNumber || this.project.id;
        const input: BudgetLineWriteInput = {
          costCode: this.lineDraft.costCode || '',
          category: this.lineDraft.category || 'Other',
          description: this.lineDraft.description ?? null,
          budgetAmount: this.lineBudgetAmount,
          actualToDate: this.lineDraft.actualCost ?? null,
          notes: this.lineDraft.notes ?? null,
        };
        const editingId = this.editingLineId();
        if (editingId) {
          await this.projectApi.updateBudgetLine(idOrJob, editingId, input);
        } else {
          await this.projectApi.createBudgetLine(idOrJob, input);
        }
        this.closeDrawer();
      } catch (err) {
        this.lineSaveError.set(err instanceof Error ? err.message : 'Failed to save budget line');
      } finally {
        this.lineSaving.set(false);
      }
      return;
    }

    await this.budgetSvc.saveLine(this.project, this.lineDraft, this.editingLineId());
    this.closeDrawer();
  }

  async deleteLine(line: ComputedBudgetLine): Promise<void> {
    if (!this.sqlBudget()) return;
    if (!confirm(`Delete budget line "${line.costCode || line.category}"? This cannot be undone.`)) return;
    try {
      const idOrJob = this.project.projectNumber || this.project.id;
      await this.projectApi.deleteBudgetLine(idOrJob, line.id);
    } catch (err) {
      this.lineSaveError.set(err instanceof Error ? err.message : 'Failed to delete budget line');
    }
  }

  openImportLines(): void {
    this.importText = '';
    this.importError.set(null);
    this.importMessage.set(null);
    this.importDrawerOpen.set(true);
  }

  closeImportLines(): void {
    this.importDrawerOpen.set(false);
  }

  async submitImportLines(): Promise<void> {
    this.importError.set(null);
    this.importMessage.set(null);

    let lines: BudgetLineWriteInput[];
    try {
      lines = this.parseImportCsv(this.importText);
    } catch (err) {
      this.importError.set(err instanceof Error ? err.message : 'Could not parse pasted data');
      return;
    }
    if (!lines.length) {
      this.importError.set('No rows found — paste CSV with a header row plus at least one data row.');
      return;
    }

    this.importSubmitting.set(true);
    try {
      const idOrJob = this.project.projectNumber || this.project.id;
      const result = await this.projectApi.importBudgetLines(idOrJob, lines);
      this.importMessage.set(`Imported ${result.imported} budget line(s).`);
      this.importText = '';
    } catch (err) {
      this.importError.set(err instanceof Error ? err.message : 'Bulk import failed');
    } finally {
      this.importSubmitting.set(false);
    }
  }

  private parseImportCsv(text: string): BudgetLineWriteInput[] {
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
    if (rows.length < 2) return [];

    const header = rows[0].split(',').map(h => h.trim());
    const numericKeys = new Set([
      'budgetAmount', 'actualToDate', 'committedAmount', 'projectedFinalCost', 'varianceAmount',
    ]);

    return rows.slice(1).map((row, index) => {
      const cells = row.split(',').map(c => c.trim());
      const record: Record<string, unknown> = {};
      header.forEach((key, i) => {
        const raw = cells[i] ?? '';
        if (!raw) {
          record[key] = numericKeys.has(key) ? null : null;
          return;
        }
        record[key] = numericKeys.has(key) ? Number(raw) : raw;
      });

      if (!record['costCode'] || !record['category']) {
        throw new Error(`Row ${index + 2}: "costCode" and "category" are required.`);
      }
      return record as unknown as BudgetLineWriteInput;
    });
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

  onSelectLaborHours(): void {
    this.activeInnerTab.set('labor-hours');
    if (!this.laborLoaded() && this.projectApi.isEnabled()) {
      this.laborLoaded.set(true);
      void this.projectApi.loadProjectLabor(this.project.projectNumber || this.project.id);
    }
  }

  openNewLaborEntry(): void {
    this.editingLaborEntryId.set(null);
    this.laborDraft = {
      workDate: new Date().toISOString().slice(0, 10),
      employeeName: '',
      classification: '',
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      hourlyRate: null,
      laborCost: null,
      notes: '',
    };
    this.laborSaveError.set(null);
    this.laborDrawerOpen.set(true);
  }

  editLaborEntry(entry: ProjectSqlLaborEntry): void {
    this.editingLaborEntryId.set(entry.id);
    this.laborDraft = {
      workDate: entry.workDate,
      employeeName: entry.employeeName,
      classification: entry.classification,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      doubleTimeHours: entry.doubleTimeHours,
      hourlyRate: entry.hourlyRate,
      laborCost: entry.laborCost,
      notes: entry.notes,
    };
    this.laborSaveError.set(null);
    this.laborDrawerOpen.set(true);
  }

  closeLaborEntry(): void {
    this.laborDrawerOpen.set(false);
  }

  async saveLaborEntry(): Promise<void> {
    if (this.laborSaving()) return;
    this.laborSaveError.set(null);

    const workDate = (this.laborDraft.workDate || '').trim();
    const employeeName = (this.laborDraft.employeeName || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      this.laborSaveError.set('Field "Work date" is required and must be in YYYY-MM-DD format.');
      return;
    }
    if (!employeeName) {
      this.laborSaveError.set('Field "Employee name" is required.');
      return;
    }

    const input: LaborEntryWriteInput = {
      workDate,
      employeeName,
      classification: this.laborDraft.classification ?? null,
      regularHours: Number(this.laborDraft.regularHours) || 0,
      overtimeHours: Number(this.laborDraft.overtimeHours) || 0,
      doubleTimeHours: Number(this.laborDraft.doubleTimeHours) || 0,
      hourlyRate: this.laborDraft.hourlyRate ?? null,
      laborCost: this.laborDraft.laborCost ?? null,
      notes: this.laborDraft.notes ?? null,
    };

    this.laborSaving.set(true);
    try {
      const idOrJob = this.project.projectNumber || this.project.id;
      const editingId = this.editingLaborEntryId();
      if (editingId) {
        await this.projectApi.updateLaborEntry(idOrJob, editingId, input);
      } else {
        await this.projectApi.createLaborEntry(idOrJob, input);
      }
      this.closeLaborEntry();
    } catch (err) {
      this.laborSaveError.set(err instanceof Error ? err.message : 'Failed to save labor entry');
    } finally {
      this.laborSaving.set(false);
    }
  }

  async deleteLaborEntryRow(entry: ProjectSqlLaborEntry): Promise<void> {
    if (!confirm(`Delete labor entry for "${entry.employeeName}" on ${entry.workDate}? This cannot be undone.`)) return;
    try {
      const idOrJob = this.project.projectNumber || this.project.id;
      await this.projectApi.deleteLaborEntry(idOrJob, entry.id);
    } catch (err) {
      this.laborSaveError.set(err instanceof Error ? err.message : 'Failed to delete labor entry');
    }
  }

  openImportLabor(): void {
    this.laborImportText = '';
    this.laborImportError.set(null);
    this.laborImportMessage.set(null);
    this.laborImportDrawerOpen.set(true);
  }

  closeImportLabor(): void {
    this.laborImportDrawerOpen.set(false);
  }

  async submitImportLabor(): Promise<void> {
    this.laborImportError.set(null);
    this.laborImportMessage.set(null);

    let entries: LaborEntryWriteInput[];
    try {
      entries = this.parseLaborImportCsv(this.laborImportText);
    } catch (err) {
      this.laborImportError.set(err instanceof Error ? err.message : 'Could not parse pasted data');
      return;
    }
    if (!entries.length) {
      this.laborImportError.set('No rows found — paste CSV with a header row plus at least one data row.');
      return;
    }

    this.laborImportSubmitting.set(true);
    try {
      const idOrJob = this.project.projectNumber || this.project.id;
      const result = await this.projectApi.importLaborEntries(idOrJob, entries);
      this.laborImportMessage.set(`Imported ${result.imported} labor entr${result.imported === 1 ? 'y' : 'ies'}.`);
      this.laborImportText = '';
    } catch (err) {
      this.laborImportError.set(err instanceof Error ? err.message : 'Bulk import failed');
    } finally {
      this.laborImportSubmitting.set(false);
    }
  }

  private parseLaborImportCsv(text: string): LaborEntryWriteInput[] {
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
    if (rows.length < 2) return [];

    const header = rows[0].split(',').map(h => h.trim());
    const numericKeys = new Set([
      'regularHours', 'overtimeHours', 'doubleTimeHours', 'hourlyRate', 'laborCost',
    ]);

    return rows.slice(1).map((row, index) => {
      const cells = row.split(',').map(c => c.trim());
      const record: Record<string, unknown> = {};
      header.forEach((key, i) => {
        const raw = cells[i] ?? '';
        if (!raw) {
          record[key] = numericKeys.has(key) ? null : null;
          return;
        }
        record[key] = numericKeys.has(key) ? Number(raw) : raw;
      });

      const workDate = String(record['workDate'] ?? '').trim();
      const employeeName = String(record['employeeName'] ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        throw new Error(`Row ${index + 2}: "workDate" is required and must be in YYYY-MM-DD format.`);
      }
      if (!employeeName) {
        throw new Error(`Row ${index + 2}: "employeeName" is required.`);
      }

      return {
        workDate,
        employeeName,
        classification: record['classification'] != null ? String(record['classification']) : null,
        regularHours: Number(record['regularHours']) || 0,
        overtimeHours: Number(record['overtimeHours']) || 0,
        doubleTimeHours: Number(record['doubleTimeHours']) || 0,
        hourlyRate: record['hourlyRate'] != null ? Number(record['hourlyRate']) : null,
        laborCost: record['laborCost'] != null ? Number(record['laborCost']) : null,
        notes: record['notes'] != null ? String(record['notes']) : null,
      } as LaborEntryWriteInput;
    });
  }
}
