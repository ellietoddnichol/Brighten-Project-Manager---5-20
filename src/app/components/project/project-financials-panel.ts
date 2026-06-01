import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Project } from '../../models/types';
import { ProjectFinancialSummary } from '../../utils/financial';
import { FINANCIAL_VIEW_LABELS, FinancialView } from './project-detail.types';
import { ProjectEnabledModules } from '../../models/project-needs.types';
import { BudgetTabComponent } from '../../pages/budget-tab';
import { PosTabComponent } from '../../pages/pos-tab';
import { BillingTabComponent } from '../../pages/billing-tab';
import { WipTabComponent } from '../../pages/wip-tab';
import { ArTabComponent } from '../../pages/ar-tab';
import { ProjectForemanBonusTabComponent } from '../../pages/project-foreman-bonus-tab';
import { ProjectFinancialService } from '../../services/project-financial.service';
import { DataService } from '../../services/data.service';
import { QuickBooksSyncDataService } from '../../services/quickbooks-sync-data.service';
import { ProjectLifecycleService } from '../../services/project-lifecycle.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { isApprovedUnbilledCo } from '../../utils/change-management';
import { arPastDueForProject } from '../../utils/ar.compute';
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
} from '../../utils/project-money.compute';

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
    <div class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        @for (seg of primarySegments(); track seg.id) {
          <button type="button" (click)="viewChange.emit(seg.id)"
                  [class.bg-slate-900]="activeView === seg.id"
                  [class.text-white]="activeView === seg.id"
                  class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold transition-colors hover:bg-slate-50 flex items-center gap-1.5">
            {{ seg.label }}
            @if (seg.badge) {
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">{{ seg.badge }}</span>
            }
          </button>
        }
        @if (moreSegments().length) {
          <div class="relative">
            <button type="button" (click)="moreOpen.set(!moreOpen())"
                    class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white hover:bg-slate-50">
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

      @if (activeView === 'summary') {
        @for (prompt of moneyPrompts(); track prompt.id) {
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p class="text-sm font-semibold text-amber-900">{{ prompt.label }}</p>
            <button type="button" (click)="viewChange.emit(prompt.view)"
                    class="text-xs font-bold text-indigo-700 underline">{{ prompt.actionLabel }}</button>
          </div>
        }

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div class="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-[10px] font-bold uppercase text-indigo-600">Next money action</p>
              <p class="text-sm font-semibold text-indigo-900">{{ action.label }}</p>
            </div>
            <button type="button" (click)="goAction(action)" class="text-sm font-bold text-indigo-700 underline">Open</button>
          </div>
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
        <app-billing-tab [project]="project" [segment]="billingSegment()" [simplified]="true" />
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
        <div class="bg-white rounded-xl border p-5 space-y-3 text-sm">
          <p class="font-semibold text-slate-900">Import &amp; source detail</p>
          <p class="text-slate-600">Review QuickBooks sync, budget imports, and setup fields for this job.</p>
          <div class="flex flex-wrap gap-3">
            <a routerLink="/settings" fragment="import-review" class="text-indigo-700 font-semibold underline">Source Review</a>
            <a routerLink="/settings" fragment="setup-completeness" class="text-indigo-700 font-semibold underline">Setup Completeness</a>
          </div>
          @if (qbCostCount() > 0) {
            <app-budget-tab [project]="project" [summary]="summary" segment="sources" [simplified]="true" />
          } @else {
            <app-empty-state title="No QuickBooks detail costs for this job." message="Source detail appears when QB cost transactions are synced." />
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
              <app-drawer-field label="Original" [value]="fmt(financial().originalContractAmount)" [mono]="true" />
              <app-drawer-field label="Approved COs" [value]="fmt(financial().approvedChangeOrderAmount)" [mono]="true" />
              <app-drawer-field label="Pending COs" [value]="fmt(financial().pendingChangeOrderAmount)" [mono]="true" />
              <app-drawer-field label="Current Contract" [value]="fmt(financial().currentContractAmount)" [mono]="true" />
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
              <app-drawer-field label="Open AR" [value]="fmt(financial().arBalance)" [mono]="true" [alert]="financial().arBalance > 0" />
              <button type="button" (click)="viewChange.emit('ar'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Open AR detail</button>
            </app-drawer-section>
          }
          @case ('sub-cost') {
            <app-drawer-section title="Subcontractor Costs">
              <app-drawer-field label="Sub Cost to Date" [value]="fmt(financial().subcontractorCostToDate)" [mono]="true" />
              <app-drawer-field label="Sub Budget" [value]="fmt(financial().subcontractorBudget)" [mono]="true" />
              <button type="button" (click)="viewChange.emit('pos'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Open Commitments</button>
            </app-drawer-section>
          }
          @case ('source') {
            <app-drawer-section title="Sources">
              <app-drawer-field label="Budget Basis" [value]="budgetBasisLabel()" />
              <app-drawer-field label="QB Detail Rows" [value]="qbCostCount() + ''" />
              <button type="button" (click)="viewChange.emit('import-source'); drawerType.set(null)"
                      class="text-sm font-semibold text-indigo-700 underline mt-2">Import / source detail</button>
            </app-drawer-section>
          }
        }
      </app-detail-drawer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFinancialsPanelComponent {
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

  moreOpen = signal(false);
  drawerType = signal<MoneyDrawerType | null>(null);
  budgetSegment = signal<BudgetSegment>('budget');
  billingSegment = signal<BillingSegment>('summary');

  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  projectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] });
  arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });

  readonly budgetSegmentOptions: SegmentOption<BudgetSegment>[] = [
    { id: 'budget', label: 'Budget' },
    { id: 'actuals', label: 'Actuals' },
    { id: 'variance', label: 'Variance' },
    { id: 'sources', label: 'Sources' },
  ];

  readonly billingSegmentOptions: SegmentOption<BillingSegment>[] = [
    { id: 'summary', label: 'Billing Summary' },
    { id: 'pay-apps', label: 'Pay Apps / Invoices' },
    { id: 'ar', label: 'AR' },
    { id: 'retainage', label: 'Retainage' },
  ];

  financial = computed(() => this.financialSvc.computeForProject(this.project));

  approvedUnbilledCount = computed(() =>
    this.changeOrders().filter(c => c.projectId === this.project.id && isApprovedUnbilledCo(c)).length,
  );

  qbCostCount = computed(() => this.qbSync.costTransactionsForProject(this.project.id).length);

  moneyPrompts = computed(() => {
    const fin = this.financial();
    return missingMoneyPrompts(this.project, fin, this.approvedUnbilledCount() > 0);
  });

  overviewCards = computed(() => moneyOverviewCards(this.financial()));

  nextAction = computed(() => {
    const fin = this.financial();
    const lifecycle = this.lifecycle.forProject(this.project);
    const variance = fin.budgetAmount - fin.costToDate;
    const subs = this.projectSubs().filter(p => p.projectId === this.project.id);
    return deriveMoneyNextAction({
      projectId: this.project.id,
      financial: fin,
      missingContract: isMissingContract(fin),
      missingRealBudget: isMissingRealBudget(fin),
      hasApprovedCoNotBilled: this.approvedUnbilledCount() > 0,
      arPastDue: arPastDueForProject(this.project.id, this.arRecords() ?? []),
      arBalance: fin.arBalance,
      costOverBudget: variance < 0 && fin.budgetAmount > 0,
      subComplianceGap: false,
      qbReviewNeeded: lifecycle.seedGaps.some(g => g.field.startsWith('qbo')),
      isCloseout: ['Closeout', 'Closed'].includes(this.project.status ?? ''),
    });
  });

  compactStrip = computed(() =>
    moneyCompactStats(this.financial(), this.nextAction().label, this.approvedUnbilledCount()),
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

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  budgetBasisLabel(): string {
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
      case 'source': return 'Source Detail';
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
