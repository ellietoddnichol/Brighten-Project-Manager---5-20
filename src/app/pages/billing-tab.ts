import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, Billing } from '../models/types';
import { ProjectFinancialSummary } from '../utils/financial';
import { DataService } from '../services/data.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Billing Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rev Contract</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.revisedContract | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Total Billed</p>
          <p class="text-xl font-bold text-indigo-700">{{ summary.billedToDate | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Paid</p>
          <p class="text-xl font-bold text-emerald-700">{{ totalPaid() | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-orange-50]="currentAR() > 0">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [class.text-slate-500]="currentAR() === 0" [class.text-orange-600]="currentAR() > 0">Current AR</p>
          <p class="text-xl font-bold" [class.text-slate-900]="currentAR() === 0" [class.text-orange-700]="currentAR() > 0">{{ currentAR() | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Retainage Held</p>
          <p class="text-xl font-bold text-slate-900">{{ totalRetainage() | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Left to Bill</p>
          <p class="text-xl font-bold text-slate-900">{{ summary.leftToBill | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-md shadow-sm border border-slate-200" [class.bg-red-50]="pastDue() > 0" [class.border-red-200]="pastDue() > 0">
          <p class="text-[10px] font-bold uppercase tracking-widest mb-1" [class.text-slate-500]="pastDue() === 0" [class.text-red-600]="pastDue() > 0">Past Due</p>
          <p class="text-xl font-bold" [class.text-slate-900]="pastDue() === 0" [class.text-red-700]="pastDue() > 0">{{ pastDue() | currency }}</p>
        </div>
      </div>

      <!-- Billing Detail Table -->
      <div class="bg-white rounded-md shadow-sm border border-slate-200 overflow-hidden">
        <div class="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-900">Pay Applications / Invoices</h3>
          <button (click)="showNewBilling = true" class="bg-slate-900 text-white px-4 py-2 rounded-md font-bold shadow-sm hover:bg-slate-800 transition-all text-sm flex items-center gap-2">
            <mat-icon class="!text-[18px] w-4 h-4">add</mat-icon> New Pay App
          </button>
        </div>
        
        @if (showNewBilling) {
          <div class="p-5 border-b border-slate-200 bg-slate-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="col-span-full">
               <h4 class="font-bold text-slate-900 mb-2">Create / Edit Pay App</h4>
            </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Pay App #</label>
               <input [(ngModel)]="newBilling.payAppNumber" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Billing Period</label>
               <input [(ngModel)]="newBilling.billingPeriod" placeholder="e.g. June 2026" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Status</label>
               <select [(ngModel)]="newBilling.status" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
                  <option value="Draft">Draft</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid</option>
                  <option value="Past Due">Past Due</option>
               </select>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Work Completed</label>
               <input type="number" [(ngModel)]="newBilling.workCompletedThisPeriod" (input)="recalcBilling()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Stored Materials</label>
               <input type="number" [(ngModel)]="newBilling.storedMaterials" (input)="recalcBilling()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Retainage Amount</label>
               <input type="number" [(ngModel)]="newBilling.retainageAmount" (input)="recalcBilling()" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Billed This App</label>
               <input type="number" [(ngModel)]="newBilling.totalBilledToDate" class="w-full px-3 py-2 bg-slate-100 rounded border border-slate-300 text-sm font-mono test-slate-700" readonly>
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Amount Paid</label>
               <input type="number" [(ngModel)]="newBilling.amountPaid" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Payment Date</label>
               <input type="date" [(ngModel)]="newBilling.paymentDate" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm">
             </div>
             <div>
               <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Invoice Link</label>
               <input [(ngModel)]="newBilling.invoiceLink" class="w-full px-3 py-2 bg-white rounded border border-slate-300 text-sm" placeholder="https://...">
             </div>
             
             <div class="col-span-full flex justify-end gap-2 mt-2">
                <button (click)="cancelBilling()" class="px-4 py-2 rounded font-bold text-slate-600 hover:bg-slate-200 text-sm">Cancel</button>
                <button (click)="saveBilling()" class="bg-emerald-600 text-white px-4 py-2 rounded font-bold hover:bg-emerald-700 text-sm">Save Pay App</button>
             </div>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm whitespace-nowrap min-w-[1000px]">
            <thead>
              <tr class="bg-white border-b border-slate-200">
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Pay App # / Period</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Work Completed</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Materials</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Retainage</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Total Billed</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Amount Paid</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">AR Balance</th>
                <th class="px-6 py-4 font-bold text-slate-400 uppercase text-[10px] tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (b of projectBillings(); track b.id) {
                <tr class="hover:bg-slate-50 transition-colors group">
                  <td class="px-6 py-4 flex flex-col">
                    <span class="font-bold text-slate-900">App #{{ b.payAppNumber || 'N/A' }}</span>
                    <span class="text-xs text-slate-500 font-medium">{{ b.billingPeriod || 'N/A' }}</span>
                  </td>
                  <td class="px-6 py-4">
                    <span class="px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wide"
                      [ngClass]="{
                        'bg-slate-100 text-slate-600': b.status === 'Draft',
                        'bg-amber-100 text-amber-700': b.status === 'Submitted',
                        'bg-blue-100 text-blue-700': b.status === 'Approved',
                        'bg-emerald-100 text-emerald-700': b.status === 'Paid',
                        'bg-red-100 text-red-700': b.status === 'Past Due'
                      }">
                      {{ b.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-right font-mono text-slate-700">{{ b.workCompletedThisPeriod | currency }}</td>
                  <td class="px-6 py-4 text-right font-mono text-slate-600">{{ b.storedMaterials | currency }}</td>
                  <td class="px-6 py-4 text-right font-mono text-slate-600">{{ b.retainageAmount | currency }}</td>
                  <td class="px-6 py-4 text-right font-mono font-bold text-slate-900">{{ b.totalBilledToDate | currency }}</td>
                  <td class="px-6 py-4 text-right font-mono text-emerald-700">{{ b.amountPaid | currency }}
                    @if (b.paymentDate) {
                       <p class="text-[10px] text-slate-400">on {{ b.paymentDate | date:'shortDate' }}</p>
                    }
                  </td>
                  <td class="px-6 py-4 text-right font-mono font-bold" [class.text-slate-900]="((b.totalBilledToDate || 0) - (b.amountPaid || 0)) <= 0" [class.text-orange-600]="((b.totalBilledToDate || 0) - (b.amountPaid || 0)) > 0">
                     {{ ((b.totalBilledToDate || 0) - (b.amountPaid || 0)) | currency }}
                  </td>
                  <td class="px-6 py-4 text-right space-x-2">
                     @if (b.invoiceLink) {
                        <a [href]="b.invoiceLink" target="_blank" class="text-blue-500 hover:text-blue-700 transition-colors inline-block" title="View Invoice">
                           <mat-icon class="!text-[18px]">receipt</mat-icon>
                        </a>
                     }
                     <button (click)="editBilling(b)" class="text-slate-400 hover:text-slate-800 transition-colors opacity-0 group-hover:opacity-100">
                        <mat-icon class="!text-[18px]">edit</mat-icon>
                     </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="px-6 py-12 text-center text-slate-400 italic">No pay applications found</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class BillingTabComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) summary!: ProjectFinancialSummary;

  private dataService = inject(DataService);
  
  billings = toSignal(this.dataService.getBillings(), { initialValue: [] });
  projectBillings = computed(() => (this.billings() || []).filter(b => b.projectId === this.project.id));
  
  totalPaid = computed(() => this.projectBillings().reduce((acc, b) => acc + (b.amountPaid || 0), 0));
  
  // Only submitted, approved, and past due billings contribute to the AR mathematically
  activeBillings = computed(() => this.projectBillings().filter(b => b.status !== 'Draft'));
  currentAR = computed(() => this.activeBillings().reduce((acc, b) => acc + ((b.totalBilledToDate || 0) - (b.amountPaid || 0)), 0));
  
  totalRetainage = computed(() => this.projectBillings().reduce((acc, b) => acc + (b.retainageAmount || 0), 0));
  pastDue = computed(() => this.projectBillings().filter(b => b.status === 'Past Due').reduce((acc, b) => acc + ((b.totalBilledToDate || 0) - (b.amountPaid || 0)), 0));

  showNewBilling = false;
  editingId: string | null = null;
  newBilling: Partial<Billing> = this.resetBilling();

  resetBilling(): Partial<Billing> {
    return { payAppNumber: '', billingPeriod: '', status: 'Draft', workCompletedThisPeriod: 0, storedMaterials: 0, retainageAmount: 0, totalBilledToDate: 0, amountPaid: 0, invoiceLink: '' };
  }

  recalcBilling() {
    const work = this.newBilling.workCompletedThisPeriod || 0;
    const materials = this.newBilling.storedMaterials || 0;
    const retainage = this.newBilling.retainageAmount || 0;
    this.newBilling.totalBilledToDate = (work + materials) - retainage;
  }

  editBilling(b: Billing) {
    this.editingId = b.id;
    this.newBilling = { ...b };
    this.showNewBilling = true;
  }

  cancelBilling() {
    this.editingId = null;
    this.newBilling = this.resetBilling();
    this.showNewBilling = false;
  }

  saveBilling() {
    if (!this.newBilling.payAppNumber) return;
    this.newBilling.projectId = this.project.id;
    
    if (this.editingId) {
       this.dataService.updateBilling(this.editingId, this.newBilling).subscribe(() => this.cancelBilling());
    } else {
       this.dataService.createBilling(this.newBilling).subscribe(() => this.cancelBilling());
    }
  }
}
