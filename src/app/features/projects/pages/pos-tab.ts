import { Component, Input, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Project, PO, ChangeOrder, ProjectBudgetLine } from '@app/models/types';
import { Submittal } from '@app/models/project-controls.types';
import { BudgetLineType } from '@app/models/financial.types';
import { DataService } from '@core/services/data.service';
import { PurchaseOrderService } from '@features/financials/services/purchase-order.service';
import { BudgetLineService } from '@features/projects/services/budget-line.service';
import { ProjectFinancialService } from '@features/projects/services/project-financial.service';
import { WorkflowDocumentsSectionComponent } from '@app/components/workflow-documents-section';
import { ProjectSubcontractorsTabComponent } from './project-subcontractors-tab';
import {
  derivePoStatus,
  nextPoNumber,
  poCommittedAmount,
  poInvoicedAmount,
  poRemainingCommitment,
  typeToCategory,
} from '@features/projects/utils/budget-line.compute';
import { coNumber } from '@features/projects/utils/change-management';
import { toSignal } from '@angular/core/rxjs-interop';

type PoFilter = 'all' | 'Draft' | 'Issued' | 'PartiallyInvoiced' | 'Closed' | 'OverBudget' | 'LinkedCO' | 'MissingCategory';
type PosSegment = 'pos' | 'subcontractors';

@Component({
  selector: 'app-pos-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule, FormsModule, WorkflowDocumentsSectionComponent, ProjectSubcontractorsTabComponent],
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button type="button" (click)="segment.set('pos')"
                class="px-4 py-2 text-sm font-semibold rounded-t-lg"
                [class.bg-white]="segment() === 'pos'"
                [class.text-blue-700]="segment() === 'pos'"
                [class.border]="segment() === 'pos'"
                [class.border-slate-200]="segment() === 'pos'">
          Purchase Orders
        </button>
        <button type="button" (click)="segment.set('subcontractors')"
                class="px-4 py-2 text-sm font-semibold rounded-t-lg"
                [class.bg-white]="segment() === 'subcontractors'"
                [class.text-blue-700]="segment() === 'subcontractors'"
                [class.border]="segment() === 'subcontractors'"
                [class.border-slate-200]="segment() === 'subcontractors'">
          Subcontractors
        </button>
      </div>

      @if (segment() === 'subcontractors') {
        <app-project-subcontractors-tab [project]="project" />
      } @else {
      <div class="grid gap-3" [ngClass]="compact ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'">
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Committed</p>
          <p class="text-xl font-bold text-slate-900">{{ summary().committed | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Invoiced</p>
          <p class="text-xl font-bold text-slate-900">{{ summary().invoiced | currency }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Remaining</p>
          <p class="text-xl font-bold text-indigo-800">{{ summary().remaining | currency }}</p>
        </div>
        @if (!compact) {
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open POs</p>
          <p class="text-xl font-bold">{{ summary().openCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Over Budget</p>
          <p class="text-xl font-bold text-amber-700">{{ summary().overBudgetCount }}</p>
        </div>
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Draft</p>
          <p class="text-xl font-bold">{{ summary().draftCount }}</p>
        </div>
        } @else {
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Open POs</p>
          <p class="text-xl font-bold">{{ summary().openCount }}</p>
        </div>
        }
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        @for (f of filterOptions; track f.id) {
          <button type="button" (click)="activeFilter.set(f.id)"
                  [class.bg-slate-900]="activeFilter() === f.id"
                  [class.text-white]="activeFilter() === f.id"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">
            {{ f.label }}
          </button>
        }
        <button type="button" (click)="openNew()" class="ml-auto bg-slate-900 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2">
          <mat-icon class="!text-[18px]">add</mat-icon> New PO
        </button>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                <th class="px-5 py-3 text-left">PO #</th>
                <th class="px-5 py-3 text-left">Vendor</th>
                <th class="px-5 py-3 text-left">Category</th>
                <th class="px-5 py-3 text-right">Committed</th>
                <th class="px-5 py-3 text-right">Invoiced</th>
                <th class="px-5 py-3 text-right">Remaining</th>
                <th class="px-5 py-3 text-left">Status</th>
                <th class="px-5 py-3 text-left">Links</th>
                <th class="px-5 py-3 text-center">Attach</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (row of filteredPos(); track row.po.id) {
                <tr class="hover:bg-slate-50 cursor-pointer" (click)="selectPo(row.po)">
                  <td class="px-5 py-3 font-medium">{{ row.po.poNumber }}</td>
                  <td class="px-5 py-3">{{ row.po.vendor }}</td>
                  <td class="px-5 py-3">{{ row.po.category || '—' }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ row.committed | currency }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ row.invoiced | currency }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ row.remaining | currency }}</td>
                  <td class="px-5 py-3">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full"
                          [class.bg-slate-100]="row.status === 'Draft'"
                          [class.bg-blue-100]="row.status === 'Issued'"
                          [class.bg-amber-100]="row.status === 'PartiallyInvoiced'"
                          [class.bg-emerald-100]="row.status === 'Closed'"
                          [class.bg-red-100]="row.status === 'Void'">
                      {{ row.status }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-xs text-slate-500">
                    @if (row.po.linkedChangeOrderId) { CO }
                    @if (row.po.linkedSubmittalId) { · SUB }
                    @if (row.po.linkedBudgetLineId) { · BL }
                    @if (row.overBudget) { · <span class="text-amber-700 font-bold">Over</span> }
                  </td>
                  <td class="px-5 py-3 text-center">
                    @if (row.attachmentCount) {
                      <span class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <mat-icon class="!text-[16px]">attach_file</mat-icon>{{ row.attachmentCount }}
                      </span>
                    } @else {
                      <span class="text-xs text-slate-300">—</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="px-5 py-12 text-center text-slate-400 italic">No purchase orders match this filter.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 class="text-lg font-bold text-slate-900">{{ editingId() ? 'Edit PO' : 'New PO' }}</h3>
            <button type="button" (click)="closeDrawer()" class="text-slate-500 hover:text-slate-800">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="p-5 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">PO #</label>
                <input [(ngModel)]="draft.poNumber" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Auto">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
                <select [(ngModel)]="draft.status" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Draft">Draft</option>
                  <option value="Issued">Issued</option>
                  <option value="PartiallyInvoiced">Partially Invoiced</option>
                  <option value="Closed">Closed</option>
                  <option value="Void">Void</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor</label>
              <input [(ngModel)]="draft.vendor" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
              <input [(ngModel)]="draft.itemsPurchased" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                <select [(ngModel)]="draftType" (ngModelChange)="onTypeChange($event)" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Material">Material</option>
                  <option value="Subcontractor">Subcontractor</option>
                  <option value="Labor">Labor</option>
                  <option value="Equipment">Equipment</option>
                  <option value="GeneralConditions">General Conditions</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Cost Code</label>
                <input [(ngModel)]="draft.costCode" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Committed Amount</label>
                <input type="number" [(ngModel)]="draftAmount" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Invoiced Amount</label>
                <input type="number" [(ngModel)]="draftInvoiced" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Budget Line</label>
              <select [(ngModel)]="draft.linkedBudgetLineId" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option [ngValue]="undefined">— Unlinked —</option>
                @for (line of budgetLineOptions(); track line.id) {
                  <option [ngValue]="line.id">{{ line.costCode || line.category }} — {{ line.category }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Linked Change Order</label>
              <select [(ngModel)]="draft.linkedChangeOrderId" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option [ngValue]="undefined">— None —</option>
                @for (co of changeOrderOptions(); track co.id) {
                  <option [ngValue]="co.id">{{ coNumber(co) }} — {{ co.title }}</option>
                }
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Linked Submittal</label>
              <select [(ngModel)]="draft.linkedSubmittalId" class="w-full px-3 py-2 border rounded-lg text-sm">
                <option [ngValue]="undefined">— None —</option>
                @for (sub of submittalOptions(); track sub.id) {
                  <option [ngValue]="sub.id">{{ sub.submittalNumber || sub.id.slice(0, 8) }} — {{ sub.description }}</option>
                }
              </select>
            </div>

            <div class="flex flex-wrap gap-2 pt-2">
              <button type="button" (click)="save()" class="bg-emerald-600 text-white px-4 py-2 rounded-lg font-semibold text-sm">Save</button>
              @if (editingId() && draft.status === 'Draft') {
                <button type="button" (click)="issueSelected()" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold text-sm">Issue PO</button>
              }
              @if (editingId() && draft.status !== 'Void') {
                <button type="button" (click)="voidSelected()" class="bg-red-600 text-white px-4 py-2 rounded-lg font-semibold text-sm">Void</button>
              }
            </div>

            <div class="border-t border-slate-200 pt-4">
              @if (editingId()) {
                <app-workflow-documents-section
                  [project]="project"
                  workflowType="purchase_order"
                  [sourceRecordId]="editingId()!"
                  documentType="PO Attachment"
                  [backupUpload]="true" />
              } @else {
                <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p class="font-semibold text-slate-800">Attachments</p>
                  <p class="text-xs mt-1">Save this purchase order first, then upload quotes, signed POs, or invoice backups here.</p>
                </div>
              }
            </div>
          </div>
        </aside>
      }
      }
    </div>
  `,
})
export class PosTabComponent implements OnInit {
  @Input({ required: true }) project!: Project;
  @Input() compact = false;
  @Input() defaultSegment: PosSegment = 'pos';

  segment = signal<PosSegment>('pos');

  ngOnInit(): void {
    this.segment.set(this.defaultSegment);
  }

  private data = inject(DataService);
  private poService = inject(PurchaseOrderService);
  private budgetSvc = inject(BudgetLineService);
  private financialSvc = inject(ProjectFinancialService);

  pos = toSignal(this.data.getPOs(), { initialValue: [] });
  projectFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });
  changeOrders = toSignal(this.data.getChangeOrders(), { initialValue: [] });
  submittals = toSignal(this.data.getSubmittals(), { initialValue: [] });

  activeFilter = signal<PoFilter>('all');
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);

  draft: Partial<PO> = {};
  draftType = 'Material';
  draftAmount = 0;
  draftInvoiced = 0;
  coNumber = coNumber;

  readonly filterOptions: { id: PoFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Draft', label: 'Draft' },
    { id: 'Issued', label: 'Issued' },
    { id: 'PartiallyInvoiced', label: 'Partially Invoiced' },
    { id: 'Closed', label: 'Closed' },
    { id: 'OverBudget', label: 'Over Budget' },
    { id: 'LinkedCO', label: 'Linked to CO' },
    { id: 'MissingCategory', label: 'Missing Budget Category' },
  ];

  projectPos = computed(() => (this.pos() || []).filter(p => p.projectId === this.project.id));

  enrichedPos = computed(() => {
    const files = (this.projectFiles() ?? []).filter(f => f.projectId === this.project.id);
    return this.projectPos().map(po => {
      const status = derivePoStatus(po);
      const attachmentCount = files.filter(f =>
        f.poId === po.id
        || (f.workflowType === 'purchase_order' && f.sourceRecordId === po.id),
      ).length;
      return {
        po,
        status,
        committed: poCommittedAmount({ ...po, status }),
        invoiced: poInvoicedAmount(po),
        remaining: poRemainingCommitment({ ...po, status }),
        overBudget: this.poService.isOverBudget(this.project.id, po),
        attachmentCount,
      };
    });
  });

  filteredPos = computed(() => {
    const filter = this.activeFilter();
    return this.enrichedPos().filter(row => {
      switch (filter) {
        case 'Draft':
        case 'Issued':
        case 'PartiallyInvoiced':
        case 'Closed':
          return row.status === filter;
        case 'OverBudget':
          return row.overBudget;
        case 'LinkedCO':
          return !!row.po.linkedChangeOrderId;
        case 'MissingCategory':
          return !row.po.linkedBudgetLineId && !row.po.category;
        default:
          return true;
      }
    });
  });

  summary = computed(() => {
    const rows = this.enrichedPos();
    const active = rows.filter(r => r.status !== 'Void' && r.status !== 'Draft');
    return {
      committed: active.reduce((s, r) => s + r.committed, 0),
      invoiced: active.reduce((s, r) => s + r.invoiced, 0),
      remaining: active.reduce((s, r) => s + r.remaining, 0),
      openCount: rows.filter(r => r.status === 'Issued' || r.status === 'PartiallyInvoiced').length,
      overBudgetCount: rows.filter(r => r.overBudget).length,
      draftCount: rows.filter(r => r.status === 'Draft').length,
    };
  });

  budgetLineOptions = computed((): ProjectBudgetLine[] =>
    this.budgetSvc.computeForProject(this.project),
  );

  changeOrderOptions = computed((): ChangeOrder[] =>
    (this.changeOrders() || []).filter(c => c.projectId === this.project.id),
  );

  submittalOptions = computed((): Submittal[] =>
    (this.submittals() || []).filter(s => s.projectId === this.project.id),
  );

  openNew(): void {
    this.editingId.set(null);
    this.draft = {
      poNumber: nextPoNumber(this.project.id, this.projectPos()),
      vendor: '',
      itemsPurchased: '',
      status: 'Draft',
    };
    this.draftType = 'Material';
    this.draftAmount = 0;
    this.draftInvoiced = 0;
    this.drawerOpen.set(true);
  }

  selectPo(po: PO): void {
    this.editingId.set(po.id);
    this.draft = { ...po };
    this.draftType = po.type ?? 'Material';
    this.draftAmount = po.committedAmount ?? po.originalAmount ?? 0;
    this.draftInvoiced = po.invoicedAmount ?? 0;
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.editingId.set(null);
  }

  onTypeChange(type: string): void {
    const t = type as BudgetLineType;
    this.draft.type = t;
    this.draft.category = typeToCategory(t);
  }

  async save(): Promise<void> {
    if (!this.draft.vendor?.trim()) return;
    this.draft.originalAmount = this.draftAmount;
    this.draft.committedAmount = this.draftAmount;
    this.draft.invoicedAmount = this.draftInvoiced;
    const t = this.draftType as BudgetLineType;
    this.draft.type = t;
    this.draft.category = typeToCategory(t);

    const saved = await this.poService.savePo(this.project, this.draft, this.editingId());
    this.editingId.set(saved.id);
    this.draft = { ...saved };
  }

  async issueSelected(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const po = this.projectPos().find(p => p.id === id);
    if (!po) return;
    await this.poService.issuePo(po);
    this.selectPo({ ...po, status: 'Issued' });
  }

  async voidSelected(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    const po = this.projectPos().find(p => p.id === id);
    if (!po) return;
    await this.poService.voidPo(po);
    this.closeDrawer();
  }
}
