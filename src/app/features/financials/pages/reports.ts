import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '@core/services/data.service';
import { dedupeProjectsForDisplay } from '@features/projects/utils/project-dedupe';
import { isOverheadJob } from '@shared/utils/project';
import { toSignal } from '@angular/core/rxjs-interop';
import { downloadCsv } from '@shared/utils/csv-export';
import { StatusChipComponent } from '@app/components/ui/status-chip';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="p-4 lg:p-6 flex-1 overflow-y-auto w-full max-w-[1440px] mx-auto space-y-4">
      <header class="flex justify-between items-center mb-8">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 tracking-tight">WIP Report</h1>
          <p class="text-slate-500 text-sm mt-1">Work in progress and job costing by project.</p>
        </div>
        <div class="flex gap-3">
          <button type="button" (click)="printReport()"
                  class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
             <mat-icon class="!text-[18px] w-4 h-4 text-slate-500">print</mat-icon> Print Report
          </button>
          <button type="button" (click)="exportCsv()"
                  class="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-semibold shadow-sm hover:bg-slate-900 transition-all flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">file_download</mat-icon> Export CSV
          </button>
        </div>
      </header>

      <!-- SUMMARY CARDS -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
          <div class="text-[11px] font-bold text-slate-500 mb-1 tracking-widest uppercase">Total Est. Income</div>
          <div class="text-3xl font-black text-slate-800">{{ totals().contract | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="mt-2 text-[10px] text-slate-400 font-medium">Sum of all contract amounts</div>
        </div>
        <div class="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
          <div class="text-[11px] font-bold text-slate-500 mb-1 tracking-widest uppercase">Total Act. Costs</div>
          <div class="text-3xl font-black text-slate-800">{{ totals().actCost | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="mt-2 text-[10px] text-slate-400 font-medium">Incurred costs across projects</div>
        </div>
        <div class="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
          <div class="text-[11px] font-bold text-slate-500 mb-1 tracking-widest uppercase">Earned Revenue</div>
          <div class="text-3xl font-black text-slate-800">{{ totals().earnedRev | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="mt-2 text-[10px] text-slate-400 font-medium">Based on % complete</div>
        </div>
        <div class="bg-white p-5 rounded-md border border-slate-200 shadow-sm">
          <div class="text-[11px] font-bold text-slate-500 mb-1 tracking-widest uppercase">Total Profit</div>
          <div class="text-3xl font-black text-slate-800">{{ totals().profit | currency:'USD':'symbol':'1.0-0' }}</div>
          <div class="mt-2 text-[10px] text-slate-400 font-medium">Billed Amount - Actual Costs</div>
        </div>
      </div>

      <!-- WIP TABLE -->
      <div class="bg-white rounded-md border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 class="text-sm font-semibold text-slate-900">Work In Progress by Project</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr class="bg-white border-b border-slate-200 text-[10px] uppercase font-black tracking-widest text-slate-400">
                <th class="px-5 py-4 w-[250px] sticky left-0 bg-white shadow-[1px_0_0_#f1f5f9]">Project</th>
                <th class="px-5 py-4 text-right">Est. Costs</th>
                <th class="px-5 py-4 text-right">Act. Costs</th>
                <th class="px-5 py-4 text-center">% Comp</th>
                <th class="px-5 py-4 text-right">Est. Income</th>
                <th class="px-5 py-4 text-right">Earned Rev.</th>
                <th class="px-5 py-4 text-right">Act. Income</th>
                <th class="px-5 py-4 text-right">Over/(Under)</th>
                <th class="px-5 py-4 text-right">Profit</th>
                <th class="px-5 py-4 text-right">Margin</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700">
              @for (row of wipData(); track row.id) {
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-5 py-4 font-bold text-orange-600 sticky left-0 bg-white truncate max-w-[250px]" [title]="row.projectName">
                    {{ row.projectNumber }} - {{ row.projectName }}
                  </td>
                  <td class="px-5 py-4 text-right font-numeric">{{ row.estimatedCost | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-4 text-right font-numeric">{{ row.actualCost | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-4 text-center font-bold">
                    <app-status-chip
                      [tone]="row.pctComplete >= 100 ? 'green' : 'slate'"
                      [label]="pctLabel(row.pctComplete)" />
                  </td>
                  <td class="px-5 py-4 text-right font-numeric">{{ row.contractAmount | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-4 text-right font-numeric text-slate-500">{{ row.earnedRev | currency:'USD':'symbol':'1.0-0' }}</td>
                  <td class="px-5 py-4 text-right font-numeric font-medium">{{ row.billedAmount | currency:'USD':'symbol':'1.0-0' }}</td>
                  
                  <!-- Over/Under -->
                  <td class="px-5 py-4 text-right font-numeric font-bold" [ngClass]="row.overUnder < 0 ? 'text-amber-600' : 'text-slate-900'">
                    {{ row.overUnder | currency:'USD':'symbol':'1.0-0' }}
                  </td>
                  
                  <!-- Profit -->
                  <td class="px-5 py-4 text-right font-numeric font-bold" [ngClass]="row.profit < 0 ? 'text-rose-600' : 'text-emerald-600'">
                    {{ row.profit | currency:'USD':'symbol':'1.0-0' }}
                  </td>
                  
                  <!-- Margin -->
                  <td class="px-5 py-4 text-right font-bold" [ngClass]="row.margin < 0 ? 'text-rose-600' : 'text-slate-700'">
                    {{ row.margin | percent:'1.1-2' }}
                  </td>
                </tr>
              }
            </tbody>
            <tfoot class="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
              <tr>
                <td class="px-5 py-4 sticky left-0 bg-slate-50 shadow-[1px_0_0_#e2e8f0]">TOTALS</td>
                <td class="px-5 py-4 text-right font-numeric">{{ totals().estCost | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right font-numeric">{{ totals().actCost | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-center"></td>
                <td class="px-5 py-4 text-right font-numeric">{{ totals().contract | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right font-numeric text-slate-600">{{ totals().earnedRev | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right font-numeric">{{ totals().billed | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right font-numeric" [ngClass]="totals().overUnder < 0 ? 'text-amber-600' : ''">{{ totals().overUnder | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right font-numeric text-emerald-600">{{ totals().profit | currency:'USD':'symbol':'1.0-0' }}</td>
                <td class="px-5 py-4 text-right">{{ totals().margin | percent:'1.1-2' }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Reports {
  dataService = inject(DataService);
  projects = toSignal(this.dataService.getProjects(), { initialValue: [] });
  uniqueProjects = computed(() => dedupeProjectsForDisplay(this.projects() || []));
  pos = toSignal(this.dataService.getPOs(), { initialValue: [] });

  wipData = computed(() => {
    return this.uniqueProjects().filter(p => !isOverheadJob(p)).map(p => {
      const estCost = (p.estLaborCost || 0) + (p.estMaterialCost || 0) + (p.estSubCost || 0) + (p.estEquipmentCost || 0) + (p.estOtherCost || 0);
      const actCost = p.actualCostToDate || 0;
      const contract = p.originalContractAmount || 0;
      const billed = p.billedToDate || 0;
      
      const pctComplete = estCost > 0 ? (actCost / estCost) * 100 : 0;
      const pctCompleteDec = estCost > 0 ? (actCost / estCost) : 0;
      
      const earnedRev = contract * pctCompleteDec;
      // Over/(Under) Billings = Actual Billed - Earned Revenue
      const overUnder = billed - earnedRev;
      
      // They calculated Profit as Act Income - Act Cost from the PDF
      const profit = billed - actCost;
      // They calculated Margins relative to Act Cost in their example (Profit / Act Cost)
      // Standard is Profit / Act Income for gross margin, let's just do Profit / Act Income if billed > 0
      const margin = billed > 0 ? (profit / billed) : 0;

      return {
        id: p.id,
        projectNumber: p.projectNumber,
        projectName: p.projectName,
        contractAmount: contract,
        estimatedCost: estCost,
        actualCost: actCost,
        billedAmount: billed,
        pctComplete,
        earnedRev,
        overUnder,
        profit,
        margin
      };
    });
  });

  totals = computed(() => {
    const data = this.wipData();
    const contract = data.reduce((s, x) => s + x.contractAmount, 0);
    const estCost = data.reduce((s, x) => s + x.estimatedCost, 0);
    const actCost = data.reduce((s, x) => s + x.actualCost, 0);
    const billed = data.reduce((s, x) => s + x.billedAmount, 0);
    const earnedRev = data.reduce((s, x) => s + x.earnedRev, 0);
    const overUnder = data.reduce((s, x) => s + x.overUnder, 0);
    const profit = data.reduce((s, x) => s + x.profit, 0);
    const margin = billed > 0 ? (profit / billed) : 0;

    return { contract, estCost, actCost, billed, earnedRev, overUnder, profit, margin };
  });

  pctLabel(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  printReport(): void {
    window.print();
  }

  exportCsv(): void {
    const rows = this.wipData().map(r => [
      r.projectNumber,
      r.projectName,
      r.estimatedCost,
      r.actualCost,
      r.pctComplete,
      r.contractAmount,
      r.earnedRev,
      r.billedAmount,
      r.overUnder,
      r.profit,
      r.margin,
    ]);
    downloadCsv(
      `wip-report-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Job #', 'Project', 'Est Costs', 'Act Costs', '% Complete', 'Contract', 'Earned Rev', 'Billed', 'Over/(Under)', 'Profit', 'Margin'],
      rows,
    );
  }
}
