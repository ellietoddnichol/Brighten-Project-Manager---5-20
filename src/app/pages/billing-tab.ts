import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, Billing, ChangeOrder } from '../models/types';
import { DataService } from '../services/data.service';
import { PayAppService } from '../services/pay-app.service';
import { ProjectFinancialService } from '../services/project-financial.service';
import {
  coApprovedAmount,
  coNumber,
  isApprovedUnbilledCo,
  isIncludedInDraftPayApp,
} from '../utils/change-management';
import { WorkflowDocumentsSectionComponent } from '../components/workflow-documents-section';
import { BillingSegment } from '../utils/project-money.compute';
import { ArTabComponent } from './ar-tab';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-billing-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, WorkflowDocumentsSectionComponent, ArTabComponent],
  template: `
    <div class="space-y-6">
      @if (segment === 'summary' || !simplified) {
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Revised Contract</p>
          <p class="text-xl font-bold text-indigo-800">{{ financial().currentContractAmount | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Billed to Date</p>
          <p class="text-xl font-bold">{{ financial().billedToDate | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Left to Bill</p>
          <p class="text-xl font-bold">{{ financial().leftToBill | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Open AR</p>
          <p class="text-xl font-bold text-orange-700">{{ financial().arBalance | currency }}</p>
        </div>
      </div>
      }

      @if (!simplified) {
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Original Contract</p>
          <p class="text-xl font-bold text-slate-900">{{ financial().originalContractAmount | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Approved COs</p>
          <p class="text-xl font-bold text-emerald-700">{{ financial().approvedChangeOrderAmount | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Revised Contract</p>
          <p class="text-xl font-bold text-indigo-800">{{ financial().currentContractAmount | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Billed to Date</p>
          <p class="text-xl font-bold">{{ financial().billedToDate | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Left to Bill</p>
          <p class="text-xl font-bold">{{ financial().leftToBill | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Open AR</p>
          <p class="text-xl font-bold text-orange-700">{{ financial().arBalance | currency }}</p>
        </div>
      </div>
      }

      @if (financial().budgetIsEstimated && (segment === 'summary' || !simplified)) {
        <div class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Budget estimated at 80% of contract (20% target profit).
        </div>
      }

      @if (segment === 'pay-apps' || segment === 'summary' || !simplified) {
      <div class="flex flex-wrap gap-2">
        <button type="button" (click)="createDraft()" class="bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm">Create draft pay app</button>
      </div>
      }

      @if (segment === 'summary' || !simplified) {
      <!-- Approved Unbilled COs -->
      <section class="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-emerald-100 bg-emerald-50 flex justify-between items-center">
          <h3 class="text-sm font-bold text-emerald-900">Approved Unbilled COs</h3>
          <span class="text-xs font-bold text-emerald-700">{{ approvedUnbilledCos().length }}</span>
        </div>
        @if (approvedUnbilledCos().length) {
          <ul class="divide-y divide-slate-100">
            @for (co of approvedUnbilledCos(); track co.id) {
              <li class="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span class="font-medium">{{ coNumber(co) }} — {{ co.title }}</span>
                <span class="font-mono text-emerald-800">{{ coApprovedAmount(co) | currency }}</span>
                <button type="button" (click)="addCoToPayApp(co)" class="text-xs font-bold text-emerald-700 hover:underline">Add to draft pay app</button>
              </li>
            }
          </ul>
        } @else {
          <p class="px-5 py-6 text-sm text-slate-400 italic">No approved unbilled change orders.</p>
        }
      </section>
      }

      @if (segment === 'pay-apps' || !simplified) {
      <!-- COs Included in Draft Pay Apps -->
      <section class="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
        <div class="px-5 py-4 border-b border-blue-100 bg-blue-50 flex justify-between items-center">
          <h3 class="text-sm font-bold text-blue-900">COs Included in Draft Pay Apps</h3>
          <span class="text-xs font-bold text-blue-700">{{ includedInDraftCos().length }}</span>
        </div>
        @if (includedInDraftCos().length) {
          <ul class="divide-y divide-slate-100">
            @for (co of includedInDraftCos(); track co.id) {
              <li class="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{{ coNumber(co) }} — {{ co.title }}</span>
                <span class="font-mono">{{ coApprovedAmount(co) | currency }}</span>
                <span class="text-xs text-blue-700 font-semibold">IncludedInDraftPayApp</span>
                @if (draftPayApp(); as draft) {
                  <button type="button" (click)="removeCoFromDraft(co, draft)" class="text-xs font-bold text-red-600 hover:underline">Remove</button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="px-5 py-6 text-sm text-slate-400 italic">No COs in draft pay apps.</p>
        }
      </section>

      @for (group of payAppGroups(); track group.key) {
        <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 class="text-sm font-bold text-slate-900">{{ group.label }}</h3>
            <span class="text-xs font-bold text-slate-500">{{ group.items.length }}</span>
          </div>
          @if (group.items.length) {
            <div class="divide-y divide-slate-100">
              @for (b of group.items; track b.id) {
                <div class="px-5 py-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p class="font-bold text-slate-900">{{ b.payAppNumber }}</p>
                      <p class="text-xs text-slate-500">{{ b.billingPeriod }} · {{ b.status }}</p>
                      @if (cosForPayApp(b).length) {
                        <p class="text-xs text-slate-600 mt-1">COs: {{ coLabelsForPayApp(b) }}</p>
                      }
                    </div>
                    <div class="text-right">
                      <p class="font-mono font-bold">{{ (b.netDue ?? b.currentApplication ?? b.workCompletedThisPeriod) | currency }}</p>
                      <div class="flex flex-wrap justify-end gap-2 mt-2">
                        <button type="button" (click)="toggleDocs(b.id)" class="text-xs font-bold text-slate-600 hover:underline">Docs</button>
                        @if (b.status === 'Draft') {
                          <button type="button" (click)="submitPayApp(b)" class="text-xs font-bold text-amber-700 hover:underline">Submit</button>
                        }
                        @if (b.status === 'Submitted') {
                          <button type="button" (click)="approvePayApp(b)" class="text-xs font-bold text-emerald-700 hover:underline">Approve</button>
                          <button type="button" (click)="markInvoiced(b)" class="text-xs font-bold text-indigo-700 hover:underline">Mark invoiced</button>
                        }
                        @if (b.status === 'Approved') {
                          <button type="button" (click)="markInvoiced(b)" class="text-xs font-bold text-indigo-700 hover:underline">Mark invoiced</button>
                          <button type="button" (click)="markPaid(b)" class="text-xs font-bold text-blue-700 hover:underline">Mark paid</button>
                        }
                        @if (b.status === 'Invoiced' || b.status === 'Past Due') {
                          <button type="button" (click)="markPaid(b)" class="text-xs font-bold text-blue-700 hover:underline">Mark paid</button>
                        }
                      </div>
                    </div>
                  </div>
                  @if (expandedId() === b.id) {
                    <div class="mt-4 pt-4 border-t border-slate-100">
                      <app-workflow-documents-section
                        [project]="project"
                        workflowType="billing"
                        [sourceRecordId]="b.id"
                        [canGenerateDoc]="true"
                        [signedUpload]="true" />
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <p class="px-5 py-6 text-sm text-slate-400 italic">None</p>
          }
        </section>
      }
      }

      @if (segment === 'ar') {
        <app-ar-tab [project]="project" />
      }

      @if (segment === 'retainage') {
        <section class="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 class="text-sm font-bold text-slate-900">Retainage</h3>
          <p class="text-2xl font-bold text-slate-900">{{ financial().retainageHeld | currency }}</p>
          <p class="text-sm text-slate-500">Retainage held on billed work. Review pay apps for release timing.</p>
          @if (financial().retainageHeld <= 0) {
            <p class="text-sm text-slate-400 italic">No retainage recorded for this project.</p>
          }
        </section>
      }
    </div>
  `,
})
export class BillingTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  @Input() segment: BillingSegment = 'summary';
  @Input() simplified = false;

  private data = inject(DataService);
  private payApps = inject(PayAppService);
  private financialSvc = inject(ProjectFinancialService);

  billings = toSignal(this.data.getBillings(), { initialValue: [] });
  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });

  coNumber = coNumber;
  coApprovedAmount = coApprovedAmount;

  financial = computed(() => this.financialSvc.computeForProject(this.project));

  approvedUnbilledCos = computed(() =>
    this.changeOrders().filter(co => co.projectId === this.project.id && isApprovedUnbilledCo(co)),
  );

  includedInDraftCos = computed(() =>
    this.changeOrders().filter(co => co.projectId === this.project.id && isIncludedInDraftPayApp(co)),
  );

  projectBillings = computed(() =>
    this.billings().filter(b => b.projectId === this.project.id && b.status !== 'Void'),
  );

  draftPayApp = computed(() => this.projectBillings().find(b => b.status === 'Draft'));

  payAppGroups = computed(() => {
    const all = this.projectBillings();
    return [
      { key: 'draft', label: 'Draft Pay Apps', items: all.filter(b => b.status === 'Draft') },
      { key: 'submitted', label: 'Submitted Pay Apps', items: all.filter(b => b.status === 'Submitted') },
      {
        key: 'invoiced',
        label: 'Invoiced / Billed Pay Apps',
        items: all.filter(b => b.status === 'Approved' || b.status === 'Invoiced' || b.status === 'Past Due'),
      },
      { key: 'paid', label: 'Paid Pay Apps', items: all.filter(b => b.status === 'Paid') },
    ];
  });

  expandedId = signal<string | null>(null);

  ngOnInit(): void {
    void this.payApps.refreshPayAppAutomation(this.project.id);
  }

  cosForPayApp(b: Billing): ChangeOrder[] {
    return this.payApps.cosForPayApp(b);
  }

  coLabelsForPayApp(b: Billing): string {
    return this.cosForPayApp(b).map(co => coNumber(co)).join(', ');
  }

  async createDraft(): Promise<void> {
    await this.payApps.createDraftPayApp(this.project);
  }

  toggleDocs(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  async addCoToPayApp(co: ChangeOrder): Promise<void> {
    let pay = this.draftPayApp();
    if (!pay) pay = await this.payApps.createDraftPayApp(this.project);
    await this.payApps.includeCoInDraftPayApp(co, pay);
  }

  async removeCoFromDraft(co: ChangeOrder, pay: Billing): Promise<void> {
    await this.payApps.removeCoFromDraftPayApp(co, pay);
  }

  async submitPayApp(b: Billing): Promise<void> {
    await this.payApps.submitPayApp(b);
    void this.payApps.refreshPayAppAutomation(this.project.id);
  }

  async approvePayApp(b: Billing): Promise<void> {
    await this.payApps.approvePayApp(b);
    void this.payApps.refreshPayAppAutomation(this.project.id);
  }

  async markInvoiced(b: Billing): Promise<void> {
    await this.payApps.markPayAppInvoiced(b);
    void this.payApps.refreshPayAppAutomation(this.project.id);
  }

  async markPaid(b: Billing): Promise<void> {
    await this.payApps.markPayAppPaid(b);
    void this.payApps.refreshPayAppAutomation(this.project.id);
  }
}
