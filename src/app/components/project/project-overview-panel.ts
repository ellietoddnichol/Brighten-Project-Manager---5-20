import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { RouterLink } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';

import { Project, ChangeOrder } from '@app/models/types';

import { ProjectFinancialSummary } from '@shared/utils/financial';

import { isOverheadJob } from '@shared/utils/project';

import { WorkflowSummaryStripComponent } from './workflow-summary-strip';

import { HealthStatus, WorkflowChip, WorkflowView, FinancialView, ProjectNavState } from './project-detail.types';

import { ProjectFinancialService } from '@features/projects/services/project-financial.service';

import { BRIGHTEN_PROFIT_TARGET } from '@app/config/active-2026-jobs.config';

import { ControlNextAction } from '@app/models/active-2026-control.types';

import { ActionItem } from '@shared/utils/action-items';

import { resolveActionItemNav } from '@shared/utils/action-item-navigation';



export interface ActivityRow {

  id: string;

  title: string;

  description?: string;

  activityType: string;

  createdAt?: unknown;

}



@Component({

  selector: 'app-project-overview-panel',

  standalone: true,

  imports: [CommonModule, MatIconModule, RouterLink, WorkflowSummaryStripComponent],

  template: `

    @if (project && !isOverheadJob(project)) {

      <div class="space-y-6">

        <div class="flex flex-wrap items-center gap-3">

          <span class="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">{{ project.status }}</span>

          @if (lifecycleGroup) {

            <span class="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800">{{ lifecycleGroup }}</span>

          }

          <span class="px-3 py-1 rounded-full text-sm font-bold"

                [class.bg-emerald-100]="healthStatus() === 'On Track'"

                [class.text-emerald-800]="healthStatus() === 'On Track'"

                [class.bg-amber-100]="healthStatus() === 'Needs Attention'"

                [class.text-amber-800]="healthStatus() === 'Needs Attention'"

                [class.bg-red-100]="healthStatus() === 'At Risk'"

                [class.text-red-800]="healthStatus() === 'At Risk'">

            {{ healthStatus() }}

          </span>

        </div>



        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">

          @for (kpi of kpis(); track kpi.label) {

            <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">

              <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{{ kpi.label }}</p>

              <p class="text-xl font-bold" [class.text-slate-900]="!kpi.alert" [class.text-rose-700]="kpi.alert">{{ kpi.value }}</p>

              @if (kpi.hint) {

                <p class="text-[10px] text-amber-600 mt-1">{{ kpi.hint }}</p>

              }

            </div>

          }

        </div>



        @if (nextAction) {

          <div class="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">

            <div>

              <p class="text-[10px] font-bold uppercase text-indigo-600">Next action</p>

              <p class="text-sm font-semibold text-indigo-900">{{ nextAction.label }}</p>

            </div>

            <a [routerLink]="nextAction.route" [queryParams]="nextAction.queryParams" [fragment]="nextAction.fragment"

               class="text-sm font-bold text-indigo-700 underline">Go</a>

          </div>

        }



        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <div class="space-y-6">

            @if (criticalActionItems.length) {

              <div class="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-sm">

                <div class="px-5 py-4 border-b bg-amber-50">

                  <h3 class="text-sm font-bold text-amber-900">Missing critical info</h3>

                </div>

                <div class="divide-y divide-slate-100">

                  @for (item of criticalActionItems.slice(0, 5); track item.id) {

                    <button type="button" (click)="openActionItem(item)"

                            class="w-full text-left px-5 py-3 hover:bg-slate-50/80 focus:outline-none focus:bg-slate-50 transition-colors group">

                      <div class="flex flex-wrap items-start justify-between gap-2">

                        <div class="min-w-0 flex-1">

                          <p class="text-sm font-semibold text-slate-900 group-hover:text-indigo-900">{{ item.title }}</p>

                          <p class="text-xs text-slate-500 mt-0.5">{{ item.description }}</p>

                        </div>

                        <span class="text-xs font-semibold text-indigo-700 shrink-0">

                          {{ actionNavLabel(item) }} →

                        </span>

                      </div>

                    </button>

                  }

                </div>

              </div>

            }

          </div>



          <div class="lg:col-span-2 space-y-6">

            @if (visibleWorkflowChips.length) {

              <app-workflow-summary-strip [chips]="visibleWorkflowChips" (chipClick)="onChip($event)" />

            }



            <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">

              <div class="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between">

                <h3 class="text-sm font-bold text-slate-900">Recent activity</h3>

                <button type="button" (click)="navigateWorkflow.emit('changes')" class="text-xs font-bold text-blue-600 hover:underline">View changes</button>

              </div>

              <div class="divide-y divide-slate-100">

                @for (item of activityFeed.slice(0, 8); track item.id) {

                  <div class="px-5 py-3">

                    <p class="text-xs text-slate-400">@if (item.createdAt) { {{ $any(item.createdAt) | date:'short' }} }</p>

                    <p class="text-sm font-medium text-slate-900">{{ item.title }}</p>

                    @if (item.description) {

                      <p class="text-xs text-slate-500">{{ item.description }}</p>

                    }

                  </div>

                } @empty {

                  <p class="px-5 py-8 text-sm text-slate-400 italic text-center">No recent activity.</p>

                }

              </div>

            </div>



            @if (latestChangeOrders.length) {

              <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">

                <div class="px-5 py-4 border-b border-slate-100 bg-slate-50">

                  <h3 class="text-sm font-bold text-slate-900">Latest changes</h3>

                </div>

                <div class="divide-y divide-slate-100">

                  @for (co of latestChangeOrders.slice(0, 4); track co.id) {

                    <div class="px-5 py-3 flex justify-between gap-4">

                      <div class="min-w-0">

                        <p class="text-sm font-semibold text-slate-900">{{ co.coNumber || 'CO' }} — {{ co.title }}</p>

                        <p class="text-xs text-slate-500">{{ co.status }}</p>

                      </div>

                      <p class="font-mono text-sm shrink-0">{{ (co.approvedAmount || co.sellPrice || 0) | currency }}</p>

                    </div>

                  }

                </div>

              </div>

            }

          </div>

        </div>

      </div>

    } @else if (project) {

      <div class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-600">

        Overhead project — use Work and Money for POs and time tracking.

      </div>

    }

  `,

  changeDetection: ChangeDetectionStrategy.OnPush,

})

export class ProjectOverviewPanelComponent {

  @Input({ required: true }) project!: Project;

  @Input({ required: true }) summary!: ProjectFinancialSummary;

  @Input({ required: true }) actionItems: ActionItem[] = [];

  @Input({ required: true }) activityFeed: ActivityRow[] = [];

  @Input({ required: true }) latestChangeOrders: ChangeOrder[] = [];

  @Input({ required: true }) visibleWorkflowChips: WorkflowChip[] = [];

  @Input() lifecycleGroup = '';

  @Input() nextAction?: ControlNextAction;



  @Output() navigateWorkflow = new EventEmitter<WorkflowView | 'billing'>();

  @Output() navigateFinancial = new EventEmitter<FinancialView>();

  @Output() navigateAction = new EventEmitter<ProjectNavState>();



  isOverheadJob = isOverheadJob;



  private financialSvc = inject(ProjectFinancialService);



  get criticalActionItems(): ActionItem[] {
    return this.actionItems.filter(a => a.severity === 'error' || a.severity === 'warning');
  }

  actionNavLabel(item: ActionItem): string {
    return resolveActionItemNav(item).label;
  }

  openActionItem(item: ActionItem): void {
    this.navigateAction.emit(resolveActionItemNav(item).nav);
  }

  healthScore = computed(() => {

    const errors = this.actionItems.filter(a => a.severity === 'error').length;

    const warnings = this.actionItems.filter(a => a.severity === 'warning').length;

    return Math.max(0, 100 - errors * 20 - warnings * 8);

  });



  healthStatus = computed((): HealthStatus => {

    const score = this.healthScore();

    if (score >= 80) return 'On Track';

    if (score >= 55) return 'Needs Attention';

    return 'At Risk';

  });



  kpis = computed(() => {

    const fin = this.financialSvc.computeForProject(this.project);

    const marginAlert = fin.forecastMargin < BRIGHTEN_PROFIT_TARGET * 100 && fin.currentContractAmount > 0;

    return [

      { label: 'Contract', value: this.formatCurrency(fin.currentContractAmount) },

      {

        label: 'Budget',

        value: this.formatCurrency(fin.budgetAmount),

        hint: fin.budgetIsEstimated ? '80% estimate' : fin.budgetBasis === 'Imported' ? 'Imported' : undefined,

      },

      { label: 'Actual Cost', value: this.formatCurrency(fin.costToDate) },

      { label: 'Projected Margin', value: `${fin.forecastMargin.toFixed(1)}%`, alert: marginAlert },

      { label: 'Billed to Date', value: this.formatCurrency(fin.billedToDate) },

      { label: 'Open AR', value: this.formatCurrency(fin.arBalance || this.project.currentAR || 0) },

    ];

  });



  onChip(id: string): void {

    if (id === 'billing') {

      this.navigateFinancial.emit('billing');

    } else {

      this.navigateWorkflow.emit(id as WorkflowView);

    }

  }



  private formatCurrency(n: number): string {

    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

  }

}


