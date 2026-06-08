import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Project } from '@app/models/types';
import { ProjectFinancialSummary } from '@shared/utils/financial';
import { FINANCIAL_VIEW_LABELS, FinancialView } from './project-detail.types';
import { ProjectEnabledModules } from '@app/models/project-needs.types';
import { BudgetTabComponent } from '@features/projects/pages/budget-tab';
import { PosTabComponent } from '@features/projects/pages/pos-tab';
import { BillingTabComponent } from '@features/projects/pages/billing-tab';
import { WipTabComponent } from '@features/projects/pages/wip-tab';
import { ArTabComponent } from '@features/projects/pages/ar-tab';
import { ProjectForemanBonusTabComponent } from '@features/projects/pages/project-foreman-bonus-tab';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { DataService } from '@core/services/data.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ProjectApiService } from '@core/services/api/project-api.service';
import { ProjectSqlFinancialSummary } from '@core/services/api/project-financial-api.mapper';
import { ProjectSqlPayApp, ProjectSqlPayAppDetail } from '@core/services/api/project-pay-app-api.mapper';
import { toSignal } from '@angular/core/rxjs-interop';
import { isApprovedUnbilledCo } from '@features/projects/utils/change-management';
import { arPastDueForProject } from '@features/financials/utils/ar.compute';
import { StatCardComponent } from '../ui/stat-card';
import { CompactStatStripComponent } from '../ui/compact-stat-strip';
import { SegmentedControlComponent, SegmentOption } from '../ui/segmented-control';
import { DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent } from '../ui/detail-drawer';
import { EmptyStateComponent } from '../ui/empty-state';
import {
  BillingSegment,
  BudgetSegment,
  deriveMoneyNextAction,
  isMissingContract,
  isMissingRealBudget,
  missingMoneyPrompts,
  MoneyDrawerType,
  moneyCompactStats,
  moneyOverviewCards,
  moneyMoreVisible,
} from '@features/projects/utils/project-money.compute';
import { exportToCsv } from '@shared/utils/export';

type PayAppChipTone = 'slate' | 'amber' | 'emerald' | 'indigo';

interface PayAppStatusChip {
  label: string;
  tone: PayAppChipTone;
}

interface PayAppSummaryCard {
  label: string;
  value: string;
  subtext?: string;
  emphasis?: boolean;
}

@Component({
  selector: 'app-project-financials-panel',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    BudgetTabComponent, PosTabComponent, BillingTabComponent, WipTabComponent, ArTabComponent,
    ProjectForemanBonusTabComponent,
    StatCardComponent, CompactStatStripComponent, SegmentedControlComponent,
    DetailDrawerComponent, DrawerSectionComponent, DrawerFieldComponent, EmptyStateComponent,
  ],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 pb-1 flex-1 min-w-0">
        @for (seg of primarySegments(); track seg.id) {
          <button type="button" (click)="viewChange.emit(seg.id)"
                  class="px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-colors shrink-0"
                  [class.bg-slate-900]="activeView === seg.id"
                  [class.text-white]="activeView === seg.id"
                  [class.text-slate-500]="activeView !== seg.id"
                  [class.hover:text-slate-900]="activeView !== seg.id"
                  [class.hover:bg-slate-50]="activeView !== seg.id">
            {{ seg.label }}
            @if (seg.badge) {
              <span class="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{{ seg.badge }}</span>
            }
          </button>
        }
        @if (moreSegments().length) {
          <div class="relative shrink-0">
            <button type="button" (click)="moreOpen.set(!moreOpen())"
                    class="border-b-2 border-transparent px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-950 transition-colors">
              More
            </button>
            @if (moreOpen()) {
              <div class="absolute z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                @for (seg of moreSegments(); track seg.id) {
                  <button type="button" (click)="selectMore(seg.id)"
                          class="w-full text-left px-4 py-2 text-sm hover:bg-slate-50">{{ seg.label }}</button>
                }
              </div>
            }
          </div>
        }
        </div>
        <button type="button" (click)="exportActiveTab()"
                class="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors shrink-0">
          Export CSV
        </button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card label="Original Contract" [value]="fmtMoney(topStats().original)" icon="description" />
        <app-stat-card label="Approved Changes" [value]="fmtMoney(topStats().approvedCos)" icon="difference" />
        <app-stat-card label="Revised Contract" [value]="fmtMoney(topStats().revised)" icon="payments" />
        <app-stat-card label="% Billed" [value]="topStats().pctBilled" icon="percent" />
      </div>

      @if (financialLoading()) {
        <div class="space-y-2 p-4">
          @for (i of [1,2,3,4]; track i) {
            <div class="animate-pulse h-8 bg-slate-100 rounded mx-3"></div>
          }
        </div>
      }
      @if (!financialLoading() && activeView === 'summary') {
        @if (projectApi.financialError()) {
          <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Financial summary is using the existing computed view because the SQL summary could not load.
          </div>
        }

        @if (sqlFinancial(); as sql) {
          <div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">SQL Financial Summary</p>
                <p class="text-sm text-slate-600">Read-only snapshot from Cloud SQL</p>
              </div>
              <span class="text-xs font-semibold text-slate-600">As of {{ dateLabel(sql.asOfDate) }}</span>
            </div>
            <div class="p-4 space-y-3">
              <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                @for (card of sqlSummaryCards(sql); track card.label) {
                  <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{{ card.label }}</p>
                    <p class="text-xl font-bold text-slate-900">{{ card.value }}</p>
                  </div>
                }
              </div>

              @if (sql.costBreakdown.categories.length) {
                <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div class="px-3 py-2 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actual Cost Snapshot</p>
                      <p class="text-xs text-slate-600">Budget Pending · Source: latest SQL financial snapshot</p>
                    </div>
                    <span class="text-xs font-semibold text-slate-600">As of {{ dateLabel(sql.costBreakdown.asOfDate || sql.asOfDate) }}</span>
                  </div>
                  <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-100 text-sm">
                      <thead class="bg-white">
                        <tr class="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          <th class="px-4 py-3">Category</th>
                          <th class="px-4 py-3">Budget</th>
                          <th class="px-4 py-3">Actual</th>
                          <th class="px-4 py-3">Remaining</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        @for (row of sql.costBreakdown.categories; track row.category) {
                          <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                            <td class="px-3 py-2.5 font-semibold text-slate-900">{{ row.category }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ fmtNullable(row.budget) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ fmtNullable(row.actual) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ fmtNullable(row.remaining) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  @if (sql.costBreakdown.dataWarnings.length) {
                    <div class="border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      @for (warning of sql.costBreakdown.dataWarnings; track warning) {
                        <p>{{ warning }}</p>
                      }
                    </div>
                  }
                </div>
              }

              @if (sql.dataWarnings.length) {
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p class="text-xs font-bold uppercase tracking-widest text-amber-700 mb-1">Data warnings</p>
                  <ul class="list-disc pl-5 text-sm text-amber-900 space-y-1">
                    @for (warning of sql.dataWarnings; track warning) {
                      <li>{{ warning }}</li>
                    }
                  </ul>
                </div>
              }
            </div>
          </div>
        } @else {
          @for (prompt of moneyPrompts(); track prompt.id) {
            <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <p class="text-sm font-semibold text-amber-900">{{ prompt.label }}</p>
              <button type="button" (click)="viewChange.emit(prompt.view)"
                      class="text-xs font-bold text-indigo-700 underline">{{ prompt.actionLabel }}</button>
            </div>
          }

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            @for (card of overviewCards(); track card.id) {
              <button type="button" (click)="openDrawer(cardDrawerType(card.id))"
                      class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <app-stat-card
                  [label]="card.label"
                  [value]="card.value"
                  [subtext]="card.subtext"
                  [trend]="card.alert ? 'Needs attention' : undefined"
                  [trendPositive]="false" />
              </button>
            }
          </div>

          <app-compact-stat-strip [stats]="compactStrip()" />

          @if (nextAction(); as action) {
            <div class="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-[10px] font-bold uppercase text-indigo-600">Next money action</p>
                <p class="text-sm font-semibold text-indigo-900">{{ action.label }}</p>
              </div>
              <button type="button" (click)="goAction(action)" class="text-sm font-bold text-indigo-700 underline">Open</button>
            </div>
          }
        }
      }

      @if (activeView === 'budget' || activeView === 'cost-transactions') {
        <app-segmented-control
          [options]="budgetSegmentOptions"
          [value]="budgetSegment()"
          (select)="budgetSegment.set($event)" />
        <app-budget-tab
          [project]="project"
          [summary]="summary"
          [segment]="budgetSegment()"
          [simplified]="true" />
      }

      @if (activeView === 'billing') {
        <app-segmented-control
          [options]="billingSegmentOptions"
          [value]="billingSegment()"
          (select)="billingSegment.set($event)" />
        <section class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pay Apps / Billing</p>
              <p class="text-sm text-slate-600">Read-only billing records from Cloud SQL · edits handled through import/admin workflow</p>
            </div>
            <span class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Read-only
            </span>
            @if (projectApi.payAppsLoading()) {
              <span class="text-xs font-semibold text-slate-500">Loading...</span>
            }
          </div>

          @if (projectApi.payAppsError()) {
            <div class="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              Pay apps could not load from SQL. Existing billing tools are still available below.
            </div>
          }

          @if (sqlPayApps().length) {
            <div class="border-b border-slate-100 p-3">
              <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
                @for (card of payAppSummaryCards(); track card.label) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">{{ card.label }}</p>
                    <p class="text-base font-bold" [class.text-amber-700]="card.emphasis" [class.text-slate-900]="!card.emphasis">{{ card.value }}</p>
                    @if (card.subtext) {
                      <p class="text-[11px] text-slate-500">{{ card.subtext }}</p>
                    }
                  </div>
                }
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="min-w-[1080px] w-full divide-y divide-slate-100 text-sm">
                <thead class="bg-white">
                  <tr class="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    <th class="px-3 py-2">Pay App #</th>
                    <th class="px-3 py-2">Billing Period</th>
                    <th class="px-3 py-2">Type / Status</th>
                    <th class="px-3 py-2 text-right">Completed / Stored</th>
                    <th class="px-3 py-2 text-right">Current Due</th>
                    <th class="px-3 py-2 text-right">Retainage</th>
                    <th class="px-3 py-2 text-right">Balance To Finish</th>
                    <th class="px-3 py-2 text-right">SOV Lines</th>
                    <th class="px-3 py-2">Review</th>
                    <th class="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (payApp of sqlPayApps(); track payApp.id) {
                    <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700" [class.bg-indigo-50]="selectedSqlPayAppId() === payApp.id">
                      <td class="px-3 py-2.5 align-top">
                        <p class="font-semibold text-slate-900">{{ payApp.payAppNumber || 'Pending' }}</p>
                        <p class="text-[11px] text-slate-500">{{ dateLabel(payApp.applicationDate) }}</p>
                      </td>
                      <td class="px-3 py-2 align-top text-slate-700">{{ periodLabel(payApp) }}</td>
                      <td class="px-3 py-2 align-top">
                        <div class="flex flex-wrap gap-1">
                          @for (chip of payAppStatusChips(payApp); track chip.label) {
                            <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" [ngClass]="chipClass(chip.tone)">
                              {{ chip.label }}
                            </span>
                          }
                        </div>
                      </td>
                      <td class="px-3 py-2.5 align-top text-right text-xs font-mono text-slate-700">{{ moneyNullable(payApp.totalCompletedStoredToDate) }}</td>
                      <td class="px-3 py-2.5 align-top text-right text-xs font-mono text-slate-700 font-semibold">{{ moneyNullable(payApp.currentPaymentDue) }}</td>
                      <td class="px-3 py-2.5 align-top text-right text-xs font-mono text-slate-700">{{ moneyNullable(payApp.retainageAmount) }}</td>
                      <td class="px-3 py-2.5 align-top text-right text-xs font-mono text-slate-700">{{ moneyNullable(payApp.balanceToFinish) }}</td>
                      <td class="px-3 py-2 align-top text-right font-semibold text-slate-700">{{ payApp.sovLineCount }}</td>
                      <td class="px-3 py-2 align-top">
                        <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" [ngClass]="reviewIndicatorClass(payApp)">
                          {{ reviewIndicatorLabel(payApp) }}
                        </span>
                      </td>
                      <td class="px-3 py-2 align-top text-right">
                        <button type="button" (click)="selectSqlPayApp(payApp)"
                                class="text-xs font-bold text-indigo-700 hover:underline">View details</button>
                      </td>
                    </tr>
                    @if (hasReviewNotes(payApp)) {
                      <tr class="bg-slate-50/60">
                        <td colspan="10" class="px-3 py-2">
                          <details class="group">
                            <summary class="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-500 group-open:text-amber-700">
                              Import / Review Notes
                            </summary>
                            <p class="mt-1 max-w-5xl text-xs leading-relaxed text-slate-700">{{ payApp.notes }}</p>
                          </details>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          } @else if (!projectApi.payAppsLoading() && !projectApi.payAppsError()) {
            <div class="px-5 py-8">
              <app-empty-state
                title="No pay applications or invoices have been added for this project."
                message="Billing records will appear here after they are loaded into SQL." />
            </div>
          }

          @if (projectApi.payAppDetailError()) {
            <div class="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              Selected pay app detail could not load from SQL.
            </div>
          }

          @if (selectedSqlPayAppDetail(); as detail) {
            <div class="border-t border-slate-100 p-3 space-y-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Selected Billing Record</p>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-base font-bold text-slate-900">{{ detail.payAppNumber || 'Pending pay app number' }}</h3>
                    @for (chip of payAppStatusChips(detail); track chip.label) {
                      <span class="rounded-full px-2 py-0.5 text-[11px] font-bold" [ngClass]="chipClass(chip.tone)">
                        {{ chip.label }}
                      </span>
                    }
                  </div>
                  <p class="text-xs text-slate-500">{{ periodLabel(detail) }}</p>
                </div>
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Read-only billing record — edits handled through SQL/import workflow.
                </div>
                @if (projectApi.payAppDetailLoading()) {
                  <span class="text-xs font-semibold text-slate-500">Loading detail...</span>
                }
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                @for (field of payAppHeaderFields(detail); track field.label) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">{{ field.label }}</p>
                    <p class="text-sm font-semibold text-slate-900">{{ field.value }}</p>
                  </div>
                }
              </div>

              @if (detail.notes) {
                <details class="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2" [open]="recordNeedsReview(detail)">
                  <summary class="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-amber-700">
                    Import / Review Notes
                  </summary>
                  <p class="mt-1 max-w-5xl text-sm leading-relaxed text-amber-950">{{ detail.notes }}</p>
                </details>
              }

              <div class="rounded-xl border border-slate-200 overflow-hidden">
                <div class="px-3 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <p class="text-sm font-bold text-slate-900">SOV / Detail Lines</p>
                  <span class="text-xs font-bold text-slate-500">{{ detail.lines.length }} line(s)</span>
                </div>
                @if (detail.lines.length) {
                  <div class="overflow-x-auto">
                    <table class="min-w-[1100px] w-full divide-y divide-slate-100 text-sm">
                      <thead class="bg-white">
                        <tr class="text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          <th class="px-3 py-2">Line #</th>
                          <th class="px-3 py-2">Cost Code</th>
                          <th class="px-3 py-2">Description</th>
                          <th class="px-3 py-2 text-right">Scheduled Value</th>
                          <th class="px-3 py-2 text-right">Previous Completed</th>
                          <th class="px-3 py-2 text-right">This Period</th>
                          <th class="px-3 py-2 text-right">Stored Materials</th>
                          <th class="px-3 py-2 text-right">Total Completed / Stored</th>
                          <th class="px-3 py-2 text-right">% Complete</th>
                          <th class="px-3 py-2 text-right">Balance To Finish</th>
                          <th class="px-3 py-2 text-right">Retainage</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100">
                        @for (line of detail.lines; track line.id) {
                          <tr class="hover:bg-slate-50 transition-colors text-xs text-slate-700">
                            <td class="px-3 py-2.5 font-mono font-bold">{{ line.lineNumber || '' }}</td>
                            <td class="px-3 py-2.5">{{ line.costCode || '' }}</td>
                            <td class="px-3 py-2.5 font-medium text-slate-900">{{ line.description || '' }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.scheduledValue) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.workCompletedPrevious) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.workCompletedThisPeriod) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.materialsPresentlyStored) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.totalCompletedAndStored) }}</td>
                            <td class="px-3 py-2.5 text-right">{{ percentCompleteLabel(line.percentComplete) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.balanceToFinish) }}</td>
                            <td class="px-3 py-2.5 text-right text-xs font-mono text-slate-700">{{ moneyNullable(line.retainage) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <p class="px-4 py-6 text-sm text-slate-400 italic">No SOV/detail lines are available for this billing record.</p>
                }
              </div>
            </div>
          }
        </section>
        <app-billing-tab [project]="project" [segment]="billingSegment()" [simplified]="true" [readOnly]="true" />
      }

      @if (activeView === 'pos' || activeView === 'sub-invoices') {
        <app-pos-tab [project]="project" [compact]="true" [defaultSegment]="activeView === 'sub-invoices' ? 'subcontractors' : 'pos'" />
      }

      @if (activeView === 'wip') {
        <app-wip-tab [project]="project" />
      }
      @if (activeView === 'ar') {
        <app-ar-tab [project]="project" />
      }
      @if (activeView === 'labor-bonus') {
        <app-project-foreman-bonus-tab [project]="project" />
      }
      @if (activeView === 'import-source') {
          <div class="bg-white rounded-xl border p-4 space-y-2 text-sm">
          <p class="font-semibold text-slate-900">Import / Review Notes</p>
          <p class="text-slate-600">Review billing backup, budget imports, and project setup items for this job.</p>
          <div class="flex flex-wrap gap-3">
            <a routerLink="/settings" fragment="import-review" class="text-indigo-700 font-semibold underline">Import Review</a>
            <a routerLink="/settings" fragment="setup-completeness" class="text-indigo-700 font-semibold underline">Project Setup</a>
          </div>
          @if (qbCostCount() > 0) {
            <app-budget-tab [project]="project" [summary]="summary" segment="sources" [simplified]="true" />
          } @else {
            <app-empty-state title="No cost detail rows for this job." message="Import / Review Notes appear when cost transactions are available." />
          }
        </div>
      }

      <app-detail-drawer
        [open]="!!drawerType()"
        [title]="drawerTitle()"
        [subtitle]="project.projectNumber + ' · ' + project.projectName"
        (close)="drawerType.set(null)">
        @switch (drawerType()) {
          @case ('contract') {
            <app-drawer-section title="Contract">
              @if (project.contractPending) {
                <app-drawer-field label="Status" [value]="project.contractPendingNote ?? 'Pending — waiting on awarded contract / proposal amount.'" />
              } @else {
                <app-drawer-field label="Original" [value]="fmt(financial().originalContractAmount)" [mono]="true" />
                <app-drawer-field label="Approved COs" [value]="fmt(financial().approvedChangeOrderAmount)" [mono]="true" />
                <app-drawer-field label="Pending COs" [value]="fmt(financial().pendingChangeOrderAmount)" [mono]="true" />
                <app-drawer-field label="Current Contract" [value]="fmt(financial().currentContractAmount)" [mono]="true" />
              }
            </app-drawer-section>
          }
          @case ('budget') {
            <app-drawer-section title="Budget">
              <app-drawer-field label="Budget" [value]="fmt(financial().budgetAmount)" [mono]="true" />
              <app-drawer-field label="Basis" [value]="budgetBasisLabel()" />
              <app-drawer-field label="Cost to Complete" [value]="fmt(financial().costToComplete)" [mono]="true" />
              <app-drawer-field label="Est Final Cost" [value]="fmt(financial().estimatedFinalCost)" [mono]="true" />
            </app-drawer-section>
          }
          @case ('actual-cost') {
            <app-drawer-section title="Actual Cost">
              <app-drawer-field label="Actual to Date" [value]="fmt(financial().costToDate)" [mono]="true" />
              <app-drawer-field label="Labor" [value]="fmt(financial().selfPerformedCostToDate)" [mono]="true" />
              <app-drawer-field label="Materials" [value]="fmt(financial().materialCostToDate)" [mono]="true" />
              <app-drawer-field label="Subs" [value]="fmt(financial().subcontractorCostToDate)" [mono]="true" />
              <app-drawer-field label="Variance" [value]="fmt(financial().budgetAmount - financial().costToDate)" [mono]="true"
                                [alert]="financial().budgetAmount - financial().costToDate < 0" />
            </app-drawer-section>
          }
          @case ('billing') {
            <app-drawer-section title="Billing">
              <app-drawer-field label="Billed to Date" [value]="fmt(financial().billedToDate)" [mono]="true" />
              <app-drawer-field label="Left to Bill" [value]="fmt(financial().leftToBill)" [mono]="true" />
              <app-drawer-field label="Retainage" [value]="fmt(financial().retainageHeld)" [mono]="true" />
              <app-drawer-field label="Over/Under" [value]="fmt(financial().overUnderBilling)" [mono]="true" />
            </app-drawer-section>
          }
          @case ('ar') {
            <app-drawer-section title="AR">
              <app-drawer-field label="Open AR" [value]="fmt(financial().arBalance)" [mono]="true" />
              <button type="button" (click)="viewChange.emit('ar'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Open AR detail</button>
            </app-drawer-section>
          }
          @case ('sub-cost') {
            <app-drawer-section title="Subcontractor Costs">
              <app-drawer-field label="Sub Cost to Date" [value]="fmt(financial().subcontractorCostToDate)" [mono]="true" />
              <app-drawer-field label="Sub Budget" [value]="fmt(financial().subcontractorBudget)" [mono]="true" />
              <button type="button" (click)="viewChange.emit('pos'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Open Purchase Orders</button>
            </app-drawer-section>
          }
          @case ('source') {
            <app-drawer-section title="Review Notes">
              <app-drawer-field label="Budget Basis" [value]="budgetBasisLabel()" />
              <app-drawer-field label="Cost Detail Rows" [value]="qbCostCount() + ''" />
              <button type="button" (click)="viewChange.emit('import-source'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Import / Review Notes</button>
            </app-drawer-section>
          }
        }
      </app-detail-drawer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFinancialsPanelComponent implements OnChanges {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) summary!: ProjectFinancialSummary;
  @Input({ required: true }) activeView!: FinancialView;
  @Input({ required: true }) modules!: ProjectEnabledModules;
  @Output() viewChange = new EventEmitter<FinancialView>();

  private financialSvc = inject(ProjectFinancialService);
  private data = inject(DataService);
  private qbSync = inject(QuickBooksSyncDataService);
  private lifecycle = inject(ProjectLifecycleService);
  private router = inject(Router);
  readonly projectApi = inject(ProjectApiService);

  moreOpen = signal(false);
  drawerType = signal<MoneyDrawerType | null>(null);
  budgetSegment = signal<BudgetSegment>('budget');
  billingSegment = signal<BillingSegment>('summary');
  selectedSqlPayAppId = signal<string | null>(null);

  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  projectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] });
  arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });

  sqlFinancial = computed(() => {
    const summary = this.projectApi.financialSummary();
    if (!summary || this.projectApi.financialActiveSource() !== 'api') return null;
    if (summary.projectId === this.project.id || summary.jobNumber === this.project.projectNumber) return summary;
    return null;
  });

  sqlBudgetConfirmed = computed(() => {
    const budget = this.projectApi.budgetSummary();
    if (!budget || this.projectApi.budgetActiveSource() !== 'api') return false;
    return this.matchesProjectKey(budget.projectId, budget.jobNumber) && budget.lineCount > 0;
  });

  sqlPayApps = computed(() => {
    const payApps = this.projectApi.payApps();
    if (this.projectApi.payAppsActiveSource() !== 'api') return [];
    return payApps.filter(payApp => this.matchesProjectKey(payApp.projectId, payApp.jobNumber));
  });

  payAppSummaryCards = computed<PayAppSummaryCard[]>(() => {
    const payApps = this.sqlPayApps();
    return [
      { label: 'Records', value: payApps.length.toString(), subtext: 'Pay apps / invoices' },
      { label: 'Current Due', value: this.moneyNullable(this.sumNullable(payApps.map(p => p.currentPaymentDue))) },
      { label: 'Completed / Stored', value: this.moneyNullable(this.sumNullable(payApps.map(p => p.totalCompletedStoredToDate))) },
      { label: 'Retainage', value: this.moneyNullable(this.sumNullable(payApps.map(p => p.retainageAmount))) },
      { label: 'Balance To Finish', value: this.moneyNullable(this.sumNullable(payApps.map(p => p.balanceToFinish))) },
      {
        label: 'Needs Review',
        value: payApps.filter(payApp => this.recordNeedsReview(payApp)).length.toString(),
        subtext: 'Import / review notes',
        emphasis: payApps.some(payApp => this.recordNeedsReview(payApp)),
      },
    ];
  });

  selectedSqlPayAppDetail = computed(() => {
    const detail = this.projectApi.payAppDetail();
    if (!detail || detail.id !== this.selectedSqlPayAppId()) return null;
    if (this.matchesProjectKey(detail.projectId, detail.jobNumber)) return detail;
    return null;
  });

  readonly budgetSegmentOptions: SegmentOption<BudgetSegment>[] = [
    { id: 'budget', label: 'Budget' },
    { id: 'actuals', label: 'Actuals' },
    { id: 'variance', label: 'Variance' },
    { id: 'sources', label: 'Sources' },
  ];

  readonly billingSegmentOptions: SegmentOption<BillingSegment>[] = [
    { id: 'summary', label: 'Billing Summary' },
    { id: 'pay-apps', label: 'Pay App History' },
    { id: 'sov', label: 'SOV Lines' },
    { id: 'source', label: 'Source File' },
    { id: 'review', label: 'Review / Lock' },
    { id: 'ar', label: 'AR' },
    { id: 'retainage', label: 'Retainage' },
  ];

  financial = computed(() => this.financialSvc.computeForProject(this.project));

  financialLoading = computed(() =>
    this.projectApi.financialLoading() || this.projectApi.payAppsLoading() || this.projectApi.budgetLoading(),
  );

  topStats = computed(() => {
    const sql = this.sqlFinancial();
    const fin = this.financial();
    const original = sql?.contract.originalContractAmount ?? fin.originalContractAmount ?? this.summary.originalContract;
    const revised = sql?.contract.revisedContractAmount ?? fin.currentContractAmount ?? this.summary.revisedContract;
    const approvedCos = (original && revised) ? Math.max(0, revised - original) : (fin.approvedChangeOrderAmount ?? this.summary.approvedCOs);
    const billed = sql?.billing.billedToDate ?? fin.billedToDate ?? this.summary.billedToDate;
    const pct = revised > 0 ? `${((billed / revised) * 100).toFixed(1)}%` : '—';
    return { original, approvedCos, revised, pctBilled: pct };
  });

  approvedUnbilledCount = computed(() =>
    this.changeOrders().filter(c => c.projectId === this.project.id && isApprovedUnbilledCo(c)).length,
  );

  qbCostCount = computed(() => this.qbSync.costTransactionsForProject(this.project.id).length);

  moneyPrompts = computed(() => {
    const fin = this.financial();
    return missingMoneyPrompts(
      this.project,
      fin,
      this.approvedUnbilledCount() > 0,
      this.sqlBudgetConfirmed(),
    );
  });

  overviewCards = computed(() => moneyOverviewCards(this.financial(), this.project));

  nextAction = computed(() => {
    const fin = this.financial();
    const lifecycle = this.lifecycle.forProject(this.project);
    const variance = fin.budgetAmount - fin.costToDate;
    const subs = this.projectSubs().filter(p => p.projectId === this.project.id);
    return deriveMoneyNextAction({
      projectId: this.project.id,
      financial: fin,
      missingContract: isMissingContract(fin, this.project),
      missingRealBudget: isMissingRealBudget(fin),
      hasApprovedCoNotBilled: this.approvedUnbilledCount() > 0,
      arPastDue: arPastDueForProject(this.project.id, this.arRecords() ?? []),
      arBalance: fin.arBalance,
      costOverBudget: variance < 0 && fin.budgetAmount > 0,
      subComplianceGap: false,
      qbReviewNeeded: lifecycle.seedGaps.some(g => g.field.startsWith('qbo')),
      isCloseout: ['Closeout', 'Closed'].includes(this.project.status ?? ''),
      sqlBudgetConfirmed: this.sqlBudgetConfirmed(),
    });
  });

  compactStrip = computed(() =>
    moneyCompactStats(
      this.financial(),
      this.nextAction().label,
      this.approvedUnbilledCount(),
      this.sqlBudgetConfirmed(),
    ),
  );

  primarySegments = computed(() =>
    this.modules.moneyPrimary.map(id => ({
      id,
      label: FINANCIAL_VIEW_LABELS[id] ?? id,
      badge: id === 'billing' && this.approvedUnbilledCount() > 0 ? this.approvedUnbilledCount() : undefined,
    })),
  );

  moreSegments = computed(() =>
    this.modules.moneyMore
      .filter(id => moneyMoreVisible(id, this.modules, {
        ar: this.financial().arBalance > 0 ? 1 : 0,
        qbCosts: this.qbCostCount(),
        bonus: 0,
        subInvoices: this.projectSubs().length,
      }))
      .map(id => ({
        id,
        label: FINANCIAL_VIEW_LABELS[id] ?? id,
      })),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['project'] || changes['activeView']) && this.project && this.activeView === 'summary') {
      void this.projectApi.loadProjectFinancials(this.project.id);
      void this.projectApi.loadProjectBudget(this.project.projectNumber || this.project.id);
    }
    if (changes['project']) {
      this.selectedSqlPayAppId.set(null);
    }
    if ((changes['project'] || changes['activeView']) && this.project && this.activeView === 'budget') {
      void this.projectApi.loadProjectBudget(this.project.projectNumber || this.project.id);
    }
    if ((changes['project'] || changes['activeView']) && this.project && this.activeView === 'billing') {
      void this.projectApi.loadProjectPayApps(this.payAppProjectKey());
    }
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  sqlSummaryCards(summary: ProjectSqlFinancialSummary): Array<{ label: string; value: string }> {
    return [
      { label: 'Contract Amount', value: this.fmtNullable(summary.contract.originalContractAmount) },
      { label: 'Revised Contract', value: this.fmtNullable(summary.contract.revisedContractAmount) },
      { label: 'Billed to Date', value: this.fmtNullable(summary.billing.billedToDate) },
      { label: 'Remaining to Bill', value: this.fmtNullable(summary.billing.remainingToBill) },
      { label: 'Actual Cost', value: this.fmtNullable(summary.cost.actualCost) },
      { label: 'Estimated Cost', value: this.fmtNullable(summary.cost.estimatedCost) },
      { label: 'Profit', value: this.fmtNullable(summary.profit.profit) },
      { label: 'Margin', value: this.percentNullable(summary.profit.marginPercent) },
    ];
  }

  dateLabel(value: string | null): string {
    if (!value) return 'Not available';
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 'Not available';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  }

  fmtNullable(n: number | null): string {
    if (n === null || n === undefined) return 'Pending';
    return this.fmt(n);
  }

  moneyNullable(n: number | null): string {
    if (n === null || n === undefined) return 'Pending';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  }

  periodLabel(payApp: Pick<ProjectSqlPayApp, 'billingPeriodStart' | 'billingPeriodEnd'>): string {
    const start = payApp.billingPeriodStart ? this.dateLabel(payApp.billingPeriodStart) : null;
    const end = payApp.billingPeriodEnd ? this.dateLabel(payApp.billingPeriodEnd) : null;
    if (start && end) return `${start} - ${end}`;
    return start || end || 'Pending';
  }

  percentCompleteLabel(value: number | null): string {
    if (value === null || value === undefined) return 'Pending';
    const pct = Math.abs(value) <= 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }

  payAppStatusChips(payApp: Pick<ProjectSqlPayApp, 'payAppNumber' | 'status' | 'notes'>): PayAppStatusChip[] {
    const text = this.payAppReviewText(payApp);
    const chips: PayAppStatusChip[] = [];
    const add = (label: string, tone: PayAppChipTone): void => {
      if (!chips.some(chip => chip.label === label)) chips.push({ label, tone });
    };

    if (text.includes('waiting on a/r') || text.includes('waiting on ar')) add('Waiting on A/R', 'amber');
    if (text.includes('imported - review') || text.includes('imported review')) add('Imported - review', 'amber');
    if (text.includes('ready') || (text.includes('imported') && !text.includes('review'))) add('Ready / Imported', 'emerald');
    if (text.includes('retainage') || text.includes('final') || /\bret\b/.test(text)) add('Retainage / Final', 'indigo');
    if (text.includes('invoice') || text.includes('t&m') || text.includes('t & m')) add('Invoice / T&M', 'slate');
    if (this.recordNeedsReview(payApp)) add('Needs Review', 'amber');

    if (!chips.length) add(payApp.status || 'Pending', 'slate');
    return chips;
  }

  chipClass(tone: PayAppChipTone): string {
    switch (tone) {
      case 'amber':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'emerald':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'indigo':
        return 'bg-indigo-100 text-indigo-800 border border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  }

  reviewIndicatorLabel(payApp: ProjectSqlPayApp): string {
    return this.recordNeedsReview(payApp) ? 'Review' : 'OK';
  }

  reviewIndicatorClass(payApp: ProjectSqlPayApp): string {
    return this.recordNeedsReview(payApp)
      ? 'bg-amber-100 text-amber-800 border border-amber-200'
      : 'bg-slate-100 text-slate-600 border border-slate-200';
  }

  hasReviewNotes(payApp: ProjectSqlPayApp): boolean {
    return !!payApp.notes?.trim();
  }

  recordNeedsReview(payApp: Pick<ProjectSqlPayApp, 'payAppNumber' | 'status' | 'notes'>): boolean {
    const text = this.payAppReviewText(payApp);
    return [
      'review',
      'mismatch',
      'protected',
      'scanned',
      'medium-confidence',
      'medium confidence',
      'source_known',
      'needs source',
      'needs document',
      'confirm',
    ].some(term => text.includes(term));
  }

  payAppHeaderFields(payApp: ProjectSqlPayAppDetail): Array<{ label: string; value: string }> {
    return [
      { label: 'Contract Sum', value: this.moneyNullable(payApp.contractSum) },
      { label: 'Net Change by COs', value: this.moneyNullable(payApp.netChangeByChangeOrders) },
      { label: 'Contract Sum To Date', value: this.moneyNullable(payApp.contractSumToDate) },
      { label: 'Total Completed / Stored', value: this.moneyNullable(payApp.totalCompletedStoredToDate) },
      { label: 'Retainage', value: this.moneyNullable(payApp.retainageAmount) },
      { label: 'Earned Less Retainage', value: this.moneyNullable(payApp.totalEarnedLessRetainage) },
      { label: 'Previous Certificates', value: this.moneyNullable(payApp.previousCertificates) },
      { label: 'Current Payment Due', value: this.moneyNullable(payApp.currentPaymentDue) },
      { label: 'Balance To Finish', value: this.moneyNullable(payApp.balanceToFinish) },
      { label: 'Status', value: payApp.status || 'Pending' },
    ];
  }

  selectSqlPayApp(payApp: ProjectSqlPayApp): void {
    this.selectedSqlPayAppId.set(payApp.id);
    void this.projectApi.loadProjectPayAppDetail(this.payAppProjectKey(), payApp.id);
  }

  private payAppProjectKey(): string {
    return this.project.projectNumber || this.project.id;
  }

  private matchesProjectKey(projectId: string | null, jobNumber: string | null): boolean {
    const keys = [this.project.id, this.project.projectNumber].filter((value): value is string => !!value);
    const apiKeys = [projectId, jobNumber].filter((value): value is string => !!value);
    return apiKeys.some(apiKey => keys.some(key =>
      apiKey === key || this.normalizeJobKey(apiKey) === this.normalizeJobKey(key),
    ));
  }

  private normalizeJobKey(value: string): string {
    return value.trim().toUpperCase().replace(/^J/, '');
  }

  private payAppReviewText(payApp: Pick<ProjectSqlPayApp, 'payAppNumber' | 'status' | 'notes'>): string {
    return `${payApp.payAppNumber ?? ''} ${payApp.status ?? ''} ${payApp.notes ?? ''}`.toLowerCase();
  }

  private sumNullable(values: Array<number | null>): number | null {
    const present = values.filter((value): value is number => value !== null && value !== undefined);
    if (!present.length) return null;
    return present.reduce((sum, value) => sum + value, 0);
  }

  private percentNullable(n: number | null): string {
    if (n === null || n === undefined) return 'Pending';
    return `${n.toFixed(1)}%`;
  }

  budgetBasisLabel(): string {
    if (this.sqlBudgetConfirmed()) return '80% confirmed (SQL)';
    const fin = this.financial();
    if (fin.budgetIsEstimated) return '80% estimate (20% target)';
    if (fin.budgetBasis === 'Imported' || fin.budgetBasis === 'Workbook') return 'Imported workbook';
    if (fin.budgetBasis === 'Manual') return 'Manual';
    return 'Missing';
  }

  drawerTitle(): string {
    switch (this.drawerType()) {
      case 'contract': return 'Contract Detail';
      case 'budget': return 'Budget Detail';
      case 'actual-cost': return 'Actual Cost Detail';
      case 'billing': return 'Billing Detail';
      case 'ar': return 'AR Detail';
      case 'sub-cost': return 'Subcontractor Costs';
      case 'source': return 'Review Notes';
      default: return 'Detail';
    }
  }

  cardDrawerType(id: string): MoneyDrawerType {
    if (id === 'margin') return 'budget';
    if (id === 'ar-left') return this.financial().arBalance > 0 ? 'ar' : 'billing';
    return id as MoneyDrawerType;
  }

  openDrawer(type: MoneyDrawerType): void {
    this.drawerType.set(type);
  }

  selectMore(view: FinancialView): void {
    this.moreOpen.set(false);
    if (view === 'import-source') {
      this.viewChange.emit(view);
    } else {
      this.viewChange.emit(view);
    }
  }

  fmtMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }

  exportActiveTab(): void {
    const rows: Record<string, unknown>[] = [];
    if (this.activeView === 'billing') {
      for (const payApp of this.sqlPayApps()) {
        rows.push({
          payAppNumber: payApp.payAppNumber,
          status: payApp.status,
          currentDue: payApp.currentPaymentDue,
          retainage: payApp.retainageAmount,
        });
      }
    } else {
      const stats = this.topStats();
      rows.push({
        tab: this.activeView,
        originalContract: stats.original,
        approvedChanges: stats.approvedCos,
        revisedContract: stats.revised,
        pctBilled: stats.pctBilled,
      });
    }
    exportToCsv(rows, `${this.project.projectNumber}-${this.activeView}`);
  }

  goAction(action: { route: string; queryParams?: Record<string, string>; fragment?: string; view?: FinancialView }): void {
    if (action.view) {
      this.viewChange.emit(action.view);
      return;
    }
    let url = action.route;
    if (action.queryParams) {
      const qs = new URLSearchParams(action.queryParams).toString();
      if (qs) url += `?${qs}`;
    }
    if (action.fragment) url += `#${action.fragment}`;
    void this.router.navigateByUrl(url);
  }
}
