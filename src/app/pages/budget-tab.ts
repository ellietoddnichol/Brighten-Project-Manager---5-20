import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ProjectBudgetLine } from '../models/types';
import { ProjectFinancialSummary } from '../utils/financial';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-budget-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Orig Contract</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.originalContract | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Approved COs</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.approvedCOs | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Rev Contract</p>
          <p class="text-xl font-bold text-indigo-700">{{ summary.revisedContract | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Est Cost</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.estimatedCost | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Actual Cost</p>
          <p class="text-xl font-bold text-red-700">{{ summary.actualCost | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="summary.leftInBudget < 0" [class.border-red-200]="summary.leftInBudget < 0">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [class.text-slate-500]="summary.leftInBudget >= 0" [class.text-red-600]="summary.leftInBudget < 0">Left in Budget</p>
          <p class="text-xl font-bold" [class.text-slate-900]="summary.leftInBudget >= 0" [class.text-red-700]="summary.leftInBudget < 0">{{ summary.leftInBudget | currency }}</p>
        </div>
        
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Billed</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.billedToDate | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Left to Bill</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.leftToBill | currency }}</p>
        </div>
        
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200 relative">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Over/Underbilled</p>
          <p class="text-xl font-bold" [class.text-amber-600]="summary.overUnderBilling > 0" [class.text-slate-900]="summary.overUnderBilling <= 0">{{ Math.abs(summary.overUnderBilling) | currency }}</p>
          <!-- <span class="absolute top-4 right-4 text-[10px] font-bold uppercase" [class.text-amber-600]="summary.overUnderBilling > 0">{{ summary.overUnderBilling > 0 ? 'OVER' : 'UNDER' }}</span> -->
        </div>
        
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Proj Profit</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.projectedProfit | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-amber-50]="summary.projectedMargin < 10" [class.border-amber-200]="summary.projectedMargin < 10">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [class.text-slate-500]="summary.projectedMargin >= 10" [class.text-amber-600]="summary.projectedMargin < 10">Proj Margin</p>
          <p class="text-xl font-bold" [class.text-slate-900]="summary.projectedMargin >= 10" [class.text-amber-700]="summary.projectedMargin < 10">{{ summary.projectedMargin | number:'1.1-1' }}%</p>
        </div>
      </div>

      <!-- Budget Detail Table -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Budget Details</h3>
          <button (click)="showNewLine = !showNewLine" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> Add Line
          </button>
        </div>
        
        @if (showNewLine) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-2 md:grid-cols-4 gap-4">
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Code</label>
               <input [(ngModel)]="newLine.costCode" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Category</label>
               <select [(ngModel)]="newLine.category" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Labor">Labor</option>
                  <option value="Materials">Materials</option>
                  <option value="Subcontractors">Subcontractors</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Other">Other</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Orig Budget</label>
               <input type="number" [(ngModel)]="newLine.originalBudget" (input)="recalcLine(newLine)" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Act Cost</label>
               <input type="number" [(ngModel)]="newLine.actualCost" (input)="recalcLine(newLine)" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="col-span-full flex justify-end gap-2">
                <button (click)="showNewLine = false" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveNewLine()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save Line</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr class="bg-white border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
                <th class="px-6 py-4 font-bold">Code / Cat</th>
                <th class="px-4 py-4 font-bold text-right">Orig Budg</th>
                <th class="px-4 py-4 font-bold text-right">App CO Budg</th>
                <th class="px-4 py-4 font-bold text-right">Rev Budg</th>
                <th class="px-4 py-4 font-bold text-right text-red-600">Act Cost</th>
                <th class="px-4 py-4 font-bold text-right">Cost 2 Comp</th>
                <th class="px-4 py-4 font-bold text-right">Proj Final</th>
                <th class="px-4 py-4 font-bold text-right">Variance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-sm font-medium">
              @for (line of projectBudgetLines(); track line.id) {
                <tr class="hover:bg-slate-50 transition-colors">
                  <td class="px-6 py-4">
                    <p class="text-slate-900 font-bold">{{ line.costCode || 'N/A' }}</p>
                    <p class="text-[10px] text-slate-500 uppercase">{{ line.category }}</p>
                  </td>
                  <td class="px-4 py-4 text-right text-slate-600 font-mono">{{ line.originalBudget | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-600 font-mono">{{ line.approvedCOBudget | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-mono font-bold">{{ line.revisedBudget | currency }}</td>
                  <td class="px-4 py-4 text-right text-red-600 font-mono">{{ line.actualCost | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-600 font-mono">{{ line.costToComplete | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-mono">{{ line.projectedFinalCost | currency }}</td>
                  <td class="px-4 py-4 text-right font-mono font-bold" [class.text-slate-900]="line.variance >= 0" [class.text-red-600]="line.variance < 0">{{ line.variance | currency }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="px-6 py-12 text-center text-slate-400 italic">No budget lines configured.</td></tr>
              }
            </tbody>
            @if (projectBudgetLines().length > 0) {
              <tfoot>
                <tr class="bg-slate-50 border-t-2 border-slate-200">
                  <td class="px-6 py-4 font-bold text-slate-900">TOTALS</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-bold font-mono">{{ getTotals('originalBudget') | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-bold font-mono">{{ getTotals('approvedCOBudget') | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-bold font-mono">{{ getTotals('revisedBudget') | currency }}</td>
                  <td class="px-4 py-4 text-right text-red-700 font-bold font-mono">{{ getTotals('actualCost') | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-bold font-mono">{{ getTotals('costToComplete') | currency }}</td>
                  <td class="px-4 py-4 text-right text-slate-900 font-bold font-mono">{{ getTotals('projectedFinalCost') | currency }}</td>
                  <td class="px-4 py-4 text-right font-bold font-mono" [class.text-red-700]="getTotals('variance') < 0">
                    {{ getTotals('variance') | currency }}
                  </td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      </div>
    </div>
  `
})
export class BudgetTabComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) summary!: ProjectFinancialSummary;

  private dataService = inject(DataService);
  
  Math = Math;
  
  budgetLines = toSignal(this.dataService.getBudgetLines(), { initialValue: [] });
  projectBudgetLines = computed(() => (this.budgetLines() || []).filter(l => l.projectId === this.project.id));
  
  showNewLine = false;
  newLine: Partial<ProjectBudgetLine> = { category: 'Materials', originalBudget: 0, actualCost: 0, approvedCOBudget: 0, costToComplete: 0, revisedBudget: 0, projectedFinalCost: 0, variance: 0 };

  recalcLine(line: Partial<ProjectBudgetLine>) {
    line.revisedBudget = (line.originalBudget || 0) + (line.approvedCOBudget || 0);
    line.projectedFinalCost = (line.actualCost || 0) + (line.costToComplete || 0);
    line.variance = line.revisedBudget - line.projectedFinalCost;
  }

  saveNewLine() {
    this.recalcLine(this.newLine);
    this.newLine.projectId = this.project.id;
    this.dataService.createBudgetLine(this.newLine).subscribe(() => {
      this.newLine = { category: 'Materials', originalBudget: 0, actualCost: 0, approvedCOBudget: 0, costToComplete: 0, revisedBudget: 0, projectedFinalCost: 0, variance: 0 };
      this.showNewLine = false;
    });
  }
  
  getTotals(field: keyof ProjectBudgetLine): number {
    return this.projectBudgetLines().reduce((acc, line) => acc + ((line[field] as number) || 0), 0);
  }
}
