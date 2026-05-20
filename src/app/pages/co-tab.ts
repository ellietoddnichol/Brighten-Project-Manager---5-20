import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, ChangeOrder } from '../models/types';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-co-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      
      <!-- CO Summaries -->
      <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Draft Value</p>
          <p class="text-xl font-bold text-slate-900">{{ getCoTotal(['Draft', 'Internal Review']) | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Submitted Value</p>
          <p class="text-xl font-bold text-orange-600">{{ getCoTotal(['Submitted', 'Need Pricing']) | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Approved Value</p>
          <p class="text-xl font-bold text-emerald-600">{{ getCoTotal(['Approved']) | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-1">Rejected Value</p>
          <p class="text-xl font-bold text-rose-600">{{ getCoTotal(['Rejected']) | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open COs</p>
          <p class="text-xl font-bold text-slate-900">{{ getCoCount(['Draft', 'Internal Review', 'Submitted']) }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Approved COs</p>
          <p class="text-xl font-bold text-slate-900">{{ getCoCount(['Approved']) }}</p>
        </div>
      </div>

      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Change Orders</h3>
          <button (click)="showNewCO = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> New CO
          </button>
        </div>
        
        @if (showNewCO) {
          <div class="p-6 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Change Order</h4>
            </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">CO Number</label>
               <input [(ngModel)]="newCO.coNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div class="lg:col-span-2">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Title</label>
               <input [(ngModel)]="newCO.title" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newCO.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Draft">Draft</option>
                  <option value="Internal Review">Internal Review</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Need Pricing">Need Pricing</option>
                  <option value="Void">Void</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Cost Impact</label>
               <input type="number" [(ngModel)]="newCO.costImpact" (input)="recalcCO()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Markup %</label>
               <input type="number" [(ngModel)]="newCO.markup" (input)="recalcCO()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Approved Amount</label>
               <input type="number" [(ngModel)]="newCO.approvedAmount" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
                <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Sell Price (Calc)</label>
                <div class="px-3 py-2 bg-slate-100 rounded border border-slate-200 text-sm text-slate-600 font-mono">{{ newCO.sellPrice | currency }}</div>
             </div>
             <div class="col-span-full">
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Description</label>
               <textarea [(ngModel)]="newCO.description" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm" rows="2"></textarea>
             </div>
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelCO()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveCO()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save CO</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[1000px]">
            <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Number / Title</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Cost Impact</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Markup %</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Sell Price</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Approved Amt</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Requested By / Dates</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (co of projectCOs(); track co.id) {
                <tr class="hover:bg-slate-50 transition-colors group">
                  <td class="px-6 py-4 flex flex-col">
                    <span class="font-bold text-slate-900">{{ co.coNumber || 'N/A' }} - {{ co.title }}</span>
                    <span class="text-xs text-slate-500 font-medium truncate max-w-[200px]" [title]="co.description || ''">{{ co.description || 'No description' }}</span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                      [ngClass]="{
                        'bg-slate-100 text-slate-600': co.status === 'Draft' || co.status === 'Internal Review',
                        'bg-amber-100 text-amber-700': co.status === 'Submitted' || co.status === 'Need Pricing',
                        'bg-emerald-100 text-emerald-700': co.status === 'Approved',
                        'bg-rose-100 text-rose-700': co.status === 'Rejected' || co.status === 'Void'
                      }">
                      {{ co.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <span class="font-mono text-slate-700">{{ co.costImpact | currency }}</span>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <span class="font-mono text-slate-600">{{ co.markup }}%</span>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <span class="font-mono text-slate-700">{{ co.sellPrice | currency }}</span>
                  </td>
                  <td class="px-6 py-4 text-right">
                    <span class="font-mono font-bold text-slate-900">{{ co.approvedAmount | currency }}</span>
                  </td>
                  <td class="px-6 py-4">
                    <div class="flex flex-col text-xs text-slate-600">
                      @if (co.requestedBy) { <span class="font-medium text-slate-800">Req: {{ co.requestedBy }}</span> }
                      @if (co.dateSubmitted) { <span>Sub: {{ co.dateSubmitted | date:'shortDate' }}</span> }
                      @if (co.dateApproved) { <span>App: {{ co.dateApproved | date:'shortDate' }}</span> }
                    </div>
                  </td>
                  <td class="px-6 py-4 text-right space-x-2">
                     <button (click)="editCO(co)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                        <mat-icon class="!text-[18px]">edit</mat-icon>
                     </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="px-6 py-12 text-center text-slate-400 italic">No change orders found</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class CoTabComponent {
  @Input({ required: true }) project!: Project;

  private dataService = inject(DataService);
  
  changeOrders = toSignal(this.dataService.getChangeOrders(), { initialValue: [] });
  projectCOs = computed(() => (this.changeOrders() || []).filter(c => c.projectId === this.project.id));
  
  showNewCO = false;
  editingId: string | null = null;
  newCO: Partial<ChangeOrder> = this.resetCO();

  resetCO(): Partial<ChangeOrder> {
    return { title: '', coNumber: '', status: 'Draft', costImpact: 0, markup: 0, sellPrice: 0, approvedAmount: 0, description: '' };
  }

  getCoTotal(statuses: string[]): number {
    return this.projectCOs().filter(co => statuses.includes(co.status)).reduce((acc, co) => acc + (co.status === 'Approved' ? (co.approvedAmount || 0) : (co.sellPrice || 0)), 0);
  }
  
  getCoCount(statuses: string[]): number {
    return this.projectCOs().filter(co => statuses.includes(co.status)).length;
  }

  recalcCO() {
    const cost = this.newCO.costImpact || 0;
    const markup = this.newCO.markup || 0;
    this.newCO.sellPrice = cost * (1 + (markup / 100));
  }

  editCO(co: ChangeOrder) {
    this.editingId = co.id;
    this.newCO = { ...co };
    this.showNewCO = true;
  }

  cancelCO() {
    this.editingId = null;
    this.newCO = this.resetCO();
    this.showNewCO = false;
  }

  saveCO() {
    if (!this.newCO.title) return;
    if (this.newCO.status === 'Approved' && !this.newCO.dateApproved) {
        this.newCO.dateApproved = new Date().toISOString();
    }
    this.newCO.projectId = this.project.id;
    
    if (this.editingId) {
       this.dataService.updateChangeOrder(this.editingId, this.newCO).subscribe(() => this.cancelCO());
    } else {
       this.dataService.createChangeOrder(this.newCO).subscribe(() => this.cancelCO());
    }
  }
}
