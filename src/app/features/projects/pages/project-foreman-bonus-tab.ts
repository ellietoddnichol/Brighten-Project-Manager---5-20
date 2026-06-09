import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import { DataService } from '@core/services/data.service';
import { ForemanBonusService } from '@features/labor/services/foreman-bonus.service';
import { ForemanBonusRecord } from '@app/models/foreman-bonus.types';

@Component({
  selector: 'app-project-foreman-bonus-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-slate-900">Labor Bonus</h3>
          <p class="text-sm text-slate-500">Foreman labor savings bonus with work progress and billing release caps</p>
        </div>
        <button type="button" (click)="recalculate()"
                class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          Recalculate from live data
        </button>
      </div>

      @if (assignments().length === 0) {
        <div class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          No foreman assignment on this job. Assign a foreman to track labor bonus.
        </div>
      }

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        @for (card of summaryCards(); track card.label) {
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
            <p class="text-lg font-bold">{{ card.value }}</p>
          </div>
        }
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr class="bg-slate-50 border-b text-[10px] uppercase tracking-widest text-slate-400">
                <th class="px-4 py-3">Foreman</th>
                <th class="px-4 py-3 text-right">Labor Budget</th>
                <th class="px-4 py-3 text-right">Actual Labor</th>
                <th class="px-4 py-3 text-right">% Complete</th>
                <th class="px-4 py-3 text-right">Current Budget</th>
                <th class="px-4 py-3 text-right">Labor Savings</th>
                <th class="px-4 py-3 text-right">Bonus Rate</th>
                <th class="px-4 py-3 text-right">Foreman Share</th>
                <th class="px-4 py-3 text-right">Billing Release</th>
                <th class="px-4 py-3 text-right">Available</th>
                <th class="px-4 py-3 text-right">Previously Paid</th>
                <th class="px-4 py-3 text-right">Pay This Term</th>
                <th class="px-4 py-3 text-right">Remaining</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm">
              @for (row of rows(); track row.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-semibold">{{ row.foremanName }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.laborBudget | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.actualLaborCost | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.percentComplete * 100 | number:'1.0-2' }}%</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.currentLaborBudget | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric" [class.text-emerald-700]="row.laborSavings > 0">{{ row.laborSavings | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.bonusRate * 100 | number:'1.0-2' }}%</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.foremanSharePercent * 100 | number:'1.0-0' }}%</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.billingReleasePercent * 100 | number:'1.0-2' }}%</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.bonusAvailableToReceive | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.previouslyPaid | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric font-bold">{{ row.payThisTerm | currency }}</td>
                  <td class="px-4 py-3 text-right font-numeric">{{ row.remainingPotential | currency }}</td>
                  <td class="px-4 py-3">
                    <span class="text-[10px] font-bold uppercase px-2 py-1 rounded-full"
                          [class.bg-amber-100]="row.status === 'NeedsReview' || row.status === 'MissingData'"
                          [class.text-amber-800]="row.status === 'NeedsReview' || row.status === 'MissingData'"
                          [class.bg-emerald-100]="row.status === 'Calculated' || row.status === 'Approved'"
                          [class.text-emerald-800]="row.status === 'Calculated' || row.status === 'Approved'">
                      {{ row.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-xs text-slate-500 max-w-[180px]">{{ row.notes || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="15" class="px-4 py-10 text-center text-slate-400 italic">No foreman bonus records for this project.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ProjectForemanBonusTabComponent {
  @Input({ required: true }) project!: Project;

  private data = inject(DataService);
  private bonusSvc = inject(ForemanBonusService);

  private bonusRecords = toSignal(this.data.getForemanBonusRecords(), { initialValue: [] as ForemanBonusRecord[] });
  private foremanAssignments = toSignal(this.data.getProjectForemanAssignments(), { initialValue: [] });

  recalculating = signal(false);

  assignments = computed(() =>
    this.foremanAssignments().filter(a => a.projectId === this.project.id && a.bonusEligible),
  );

  rows = computed(() =>
    this.bonusRecords()
      .filter(r => r.projectId === this.project.id)
      .map(r => this.bonusSvc.enrichRecord(r)),
  );

  summaryCards = computed(() => {
    const rows = this.rows();
    return [
      { label: 'Earned Bonus', value: this.formatCurrency(rows.reduce((s, r) => s + r.foremanShareBonus, 0)) },
      { label: 'Available (Billing Cap)', value: this.formatCurrency(rows.reduce((s, r) => s + r.bonusAvailableToReceive, 0)) },
      { label: 'Previously Paid', value: this.formatCurrency(rows.reduce((s, r) => s + r.previouslyPaid, 0)) },
      { label: 'Pay This Term', value: this.formatCurrency(rows.reduce((s, r) => s + r.payThisTerm, 0)) },
    ];
  });

  private formatCurrency(value: number): string {
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  async recalculate(): Promise<void> {
    this.recalculating.set(true);
    try {
      await this.bonusSvc.recalculateProject(this.project);
    } finally {
      this.recalculating.set(false);
    }
  }
}
