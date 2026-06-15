import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '@app/models/types';
import { WIPRecord, WipGroup } from '@app/models/financial.types';
import { WipService } from '@features/financials/services/wip.service';
import { wipConfidenceLabel } from '@features/financials/utils/wip.compute';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { ImportDataService } from '@core/services/import-data.service';
import { DataService } from '@core/services/data.service';

@Component({
  selector: 'app-wip-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      @if (record(); as w) {
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Contract</p>
            <p class="text-xl font-bold">{{ w.contractAmount | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Earned Revenue</p>
            <p class="text-xl font-bold text-indigo-800">{{ w.earnedRevenue | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Billed to Date</p>
            <p class="text-xl font-bold">{{ w.billedToDate | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
               [class.bg-amber-50]="w.overUnderBilling > 0" [class.bg-blue-50]="w.overUnderBilling < 0">
            <p class="text-[10px] font-bold uppercase mb-1">Over / Under</p>
            <p class="text-xl font-bold">{{ w.overUnderBilling | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Left to Bill</p>
            <p class="text-xl font-bold">{{ w.leftToBill | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Cost to Date</p>
            <p class="text-xl font-bold text-red-700">{{ w.costToDate | currency }}</p>
            @if (actualCostSources().length) {
              <div class="flex flex-wrap gap-1 mt-2">
                @for (src of actualCostSources(); track src) {
                  <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                        [class.bg-blue-50]="src === 'QuickBooks Detail'"
                        [class.text-indigo-700]="src === 'QuickBooks Detail'"
                        [class.bg-emerald-50]="src === 'Labor Actuals'"
                        [class.text-emerald-700]="src === 'Labor Actuals'"
                        [class.bg-slate-100]="src === 'Manual'"
                        [class.text-slate-600]="src === 'Manual'">{{ src }}</span>
                }
              </div>
            }
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Cost to Complete</p>
            <p class="text-xl font-bold">{{ w.costToComplete | currency }}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">% Complete</p>
            <p class="text-xl font-bold">{{ w.percentComplete | number:'1.1-1' }}%</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">Forecast GP</p>
            <p class="text-xl font-bold">{{ w.forecastGrossProfit | currency }}</p>
            <p class="text-xs text-slate-500">{{ w.forecastMargin | number:'1.1-1' }}% margin</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p class="text-[10px] font-bold text-orange-600 uppercase mb-1">AR (collections)</p>
            <p class="text-xl font-bold text-orange-700">{{ w.arBalance | currency }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span class="px-3 py-1 rounded-full font-bold text-xs"
                [class.bg-emerald-100]="w.wipGroup === 'ActiveWIP'"
                [class.bg-sky-100]="w.wipGroup === 'UpcomingWIP'"
                [class.bg-orange-100]="w.wipGroup === 'CloseoutAR'"
                [class.bg-slate-100]="w.wipGroup === 'ExcludedArchive'">
            {{ wipSvc.groupLabel(w.wipGroup) }}
          </span>
          @if (w.budgetBasisLabel) {
            <span class="text-xs text-slate-600">Budget: {{ w.budgetBasisLabel }}</span>
          }
          @if (w.wipConfidence) {
            <span class="text-xs font-semibold px-2 py-0.5 rounded"
                  [class.bg-emerald-50]="w.wipConfidence === 'Good'"
                  [class.text-emerald-800]="w.wipConfidence === 'Good'"
                  [class.bg-amber-50]="w.wipConfidence === 'Estimated' || w.wipConfidence === 'NeedsSource'"
                  [class.text-amber-800]="w.wipConfidence === 'Estimated' || w.wipConfidence === 'NeedsSource'"
                  [class.bg-rose-50]="w.wipConfidence === 'NeedsReview'"
                  [class.text-rose-800]="w.wipConfidence === 'NeedsReview'"
                  [class.bg-slate-100]="w.wipConfidence === 'NotApplicable'"
                  [class.text-slate-600]="w.wipConfidence === 'NotApplicable'">
              {{ confidenceLabel(w.wipConfidence) }}
            </span>
          }
          @if (w.nextAction && w.nextAction !== 'No action' && w.nextAction !== 'Complete') {
            <span class="text-indigo-700 font-semibold text-xs">{{ w.nextAction }}</span>
          }
        </div>

        @if (w.warningChips?.length) {
          <div class="flex flex-wrap gap-2">
            @for (chip of w.warningChips; track chip.label) {
              <span class="text-xs px-2 py-0.5 rounded"
                    [class.bg-rose-50]="chip.tone === 'critical'"
                    [class.text-rose-800]="chip.tone === 'critical'"
                    [class.bg-amber-50]="chip.tone === 'amber'"
                    [class.text-amber-800]="chip.tone === 'amber'">{{ chip.label }}</span>
            }
          </div>
        } @else if (w.needsReview) {
          <span class="text-amber-700 font-semibold text-xs">Needs review</span>
        }

        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="openDrawer()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Edit WIP assumptions</button>
          <button type="button" (click)="setGroup('ActiveWIP')" class="px-3 py-2 rounded-lg border text-sm font-semibold">Move to Active WIP</button>
          <button type="button" (click)="setGroup('UpcomingWIP')" class="px-3 py-2 rounded-lg border text-sm font-semibold">Move to Upcoming / Precon</button>
          <button type="button" (click)="setGroup('CloseoutAR')" class="px-3 py-2 rounded-lg border text-sm font-semibold">Move to Closeout AR</button>
          <button type="button" (click)="setGroup('ExcludedArchive')" class="px-3 py-2 rounded-lg border text-sm font-semibold">Exclude / Archive</button>
          <button type="button" (click)="openAr()" class="px-3 py-2 rounded-lg border text-sm font-semibold text-orange-700">Open AR</button>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <tbody class="divide-y divide-slate-100">
              <tr><td class="px-5 py-3 text-slate-500 w-48">Self-performed</td><td class="px-5 py-3 font-mono">{{ w.selfPerformedAmount | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Subcontractors</td><td class="px-5 py-3 font-mono">{{ w.subcontractorAmount | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Materials</td><td class="px-5 py-3 font-mono">{{ w.materialAmount | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Equipment</td><td class="px-5 py-3 font-mono">{{ w.equipmentAmount | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Other / GC</td><td class="px-5 py-3 font-mono">{{ w.otherAmount | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Retainage held</td><td class="px-5 py-3 font-mono">{{ w.retainageHeld | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Estimated final cost</td><td class="px-5 py-3 font-mono">{{ w.estimatedFinalCost | currency }}</td></tr>
              <tr><td class="px-5 py-3 text-slate-500">Budget</td><td class="px-5 py-3 font-mono">{{ w.budgetAmount | currency }}</td></tr>
            </tbody>
          </table>
        </div>
      } @else {
        <div class="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
          <p class="text-slate-600">WIP metrics are still loading for this job.</p>
          <button type="button" (click)="openDrawer()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Edit WIP assumptions</button>
        </div>
      }

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-[60] bg-black/30" (click)="drawerOpen.set(false)"></div>
        <aside class="fixed top-0 right-0 z-[70] h-full w-full max-w-md bg-white shadow-xl overflow-y-auto p-5 space-y-4">
          <div class="flex items-start justify-between gap-3">
            <h3 class="text-lg font-bold">WIP Assumptions</h3>
            <button type="button" (click)="drawerOpen.set(false)" class="text-slate-400 hover:text-slate-600">Close</button>
          </div>
          <p class="text-xs text-slate-500">Overrides apply to this job only and are saved to Firestore.</p>
          @if (saveMessage()) {
            <p class="text-sm" [class.text-emerald-700]="saveOk()" [class.text-rose-700]="!saveOk()">{{ saveMessage() }}</p>
          }
          <div><label class="text-xs font-bold uppercase text-slate-500">Contract override</label>
            <input type="number" [(ngModel)]="draftContract" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
          <div><label class="text-xs font-bold uppercase text-slate-500">Budget override</label>
            <input type="number" [(ngModel)]="draftBudget" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
          <div><label class="text-xs font-bold uppercase text-slate-500">Est. final cost override</label>
            <input type="number" [(ngModel)]="draftEfc" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
          <div><label class="text-xs font-bold uppercase text-slate-500">Cost to complete override</label>
            <input type="number" [(ngModel)]="draftCtc" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
          <div>
            <label class="text-xs font-bold uppercase text-slate-500">Forecast treatment</label>
            <select [(ngModel)]="draftForecastTreatment" class="w-full border rounded-lg px-3 py-2 text-sm mt-1">
              <option value="">Not set</option>
              <option value="Forecast backlog">Forecast backlog</option>
              <option value="Collections only">Collections only</option>
              <option value="Needs contract">Needs contract</option>
              <option value="PreCon forecast">PreCon forecast</option>
            </select>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="text-xs font-bold uppercase text-slate-500">Low %</label>
              <input type="number" step="0.01" [(ngModel)]="draftForecastLowPct" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
            <div><label class="text-xs font-bold uppercase text-slate-500">Base %</label>
              <input type="number" step="0.01" [(ngModel)]="draftForecastBasePct" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
            <div><label class="text-xs font-bold uppercase text-slate-500">High %</label>
              <input type="number" step="0.01" [(ngModel)]="draftForecastHighPct" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></div>
          </div>
          <div><label class="text-xs font-bold uppercase text-slate-500">Forecast notes</label>
            <textarea [(ngModel)]="draftForecastNotes" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></textarea></div>
          <div><label class="text-xs font-bold uppercase text-slate-500">Review notes</label>
            <textarea [(ngModel)]="draftNotes" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm mt-1"></textarea></div>
          <button type="button" (click)="saveAssumptions()" [disabled]="saving()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors disabled:opacity-50">
            {{ saving() ? 'Saving…' : 'Save assumptions' }}
          </button>
        </aside>
      }
    </div>
  `,
})
export class WipTabComponent {
  @Input({ required: true }) project!: Project;

  wipSvc = inject(WipService);
  readonly confidenceLabel = wipConfidenceLabel;
  private qbSyncData = inject(QuickBooksSyncDataService);
  private importData = inject(ImportDataService);
  private data = inject(DataService);
  private router = inject(Router);

  drawerOpen = signal(false);
  saving = signal(false);
  saveMessage = signal<string | null>(null);
  saveOk = signal(true);
  draftContract = 0;
  draftBudget = 0;
  draftEfc = 0;
  draftCtc = 0;
  draftNotes = '';
  draftForecastTreatment = '';
  draftForecastLowPct: number | null = null;
  draftForecastBasePct: number | null = null;
  draftForecastHighPct: number | null = null;
  draftForecastNotes = '';

  record = computed(() => this.wipSvc.forProject(this.project.id));

  actualCostSources = computed(() => {
    const sources: string[] = [];
    if (this.qbSyncData.hasDetailCostsForProject(this.project.id)) {
      sources.push('QuickBooks Detail');
    }
    if (this.data.projectLaborActualsSnapshot().some(a => a.projectId === this.project.id)) {
      sources.push('Labor Actuals');
    }
    const hasImport = this.importData.projectActualTotal(this.project.id) > 0
      || this.importData.subcontractorActualTotal(this.project.id) > 0;
    if ((this.project.actualCostToDate ?? 0) > 0 && !sources.length) {
      sources.push('Manual');
    } else if (hasImport && !this.qbSyncData.hasDetailCostsForProject(this.project.id)) {
      sources.push('Manual');
    }
    return sources;
  });

  openDrawer(): void {
    const w = this.record();
    this.draftContract = this.project.wipContractOverride ?? w?.contractAmount ?? 0;
    this.draftBudget = this.project.wipBudgetOverride ?? w?.budgetAmount ?? 0;
    this.draftEfc = this.project.wipEstimatedFinalCostOverride ?? w?.estimatedFinalCost ?? 0;
    this.draftCtc = this.project.wipCostToComplete ?? w?.costToComplete ?? 0;
    this.draftNotes = this.project.wipReviewNotes ?? '';
    this.draftForecastTreatment = this.project.forecastTreatment ?? '';
    this.draftForecastLowPct = this.project.forecastLowPct ?? null;
    this.draftForecastBasePct = this.project.forecastBasePct ?? null;
    this.draftForecastHighPct = this.project.forecastHighPct ?? null;
    this.draftForecastNotes = this.project.wipForecastNotes ?? '';
    this.saveMessage.set(null);
    this.drawerOpen.set(true);
  }

  async saveAssumptions(): Promise<void> {
    this.saving.set(true);
    this.saveMessage.set(null);
    try {
      await this.wipSvc.saveAssumptions(this.project.id, {
        wipContractOverride: this.draftContract || undefined,
        wipBudgetOverride: this.draftBudget || undefined,
        wipEstimatedFinalCostOverride: this.draftEfc || undefined,
        wipCostToComplete: this.draftCtc || undefined,
        wipReviewNotes: this.draftNotes.trim() || undefined,
        forecastTreatment: this.draftForecastTreatment.trim() || undefined,
        forecastLowPct: this.draftForecastLowPct ?? undefined,
        forecastBasePct: this.draftForecastBasePct ?? undefined,
        forecastHighPct: this.draftForecastHighPct ?? undefined,
        wipForecastNotes: this.draftForecastNotes.trim() || undefined,
      });
      this.saveOk.set(true);
      this.saveMessage.set('WIP assumptions saved.');
      this.drawerOpen.set(false);
    } catch {
      this.saveOk.set(false);
      this.saveMessage.set('Save failed — check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  async setGroup(group: WipGroup): Promise<void> {
    await this.wipSvc.setWipGroup(this.project.id, group);
  }

  openAr(): void {
    void this.router.navigate(['/projects', this.project.id], {
      queryParams: { section: 'financials', view: 'ar' },
    });
  }
}
