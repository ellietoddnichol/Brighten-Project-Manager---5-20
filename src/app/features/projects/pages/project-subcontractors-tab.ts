import { Component, Input, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project, ChangeOrder } from '@app/models/types';
import { Submittal } from '@app/models/project-controls.types';
import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorDocumentType,
  SubcontractorInvoice,
  SUBCONTRACTOR_DOC_TYPES,
} from '@app/models/subcontractor.types';
import { DataService } from '@core/services/data.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { ProjectSubcontractorService } from '@features/subcontractors/services/project-subcontractor.service';
import { SubcontractorInvoiceService } from '@features/subcontractors/services/subcontractor-invoice.service';
import { SubcontractorApiService } from '@core/services/api/subcontractor-api.service';
import { StatusChipComponent } from '@app/components/ui/status-chip';

@Component({
  selector: 'app-project-subcontractors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusChipComponent],
  template: `
    <div class="space-y-6">
      @if (sqlReadOnly()) {
        <div class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
          Project subcontractors loaded from Cloud SQL (read-only). Assignments and edits still use Firestore.
        </div>
      } @else if (subApi.projectSubsError()) {
        <div class="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          Could not load project subcontractors from API — showing Firestore data. {{ subApi.projectSubsError() }}
        </div>
      }
      <div class="flex flex-wrap gap-2 items-center">
        <button type="button" (click)="openAssign()" class="ml-auto bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          Add Subcontractor
        </button>
      </div>

      <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[1100px]">
            <thead>
              <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                <th class="px-4 py-3 text-left">Subcontractor</th>
                <th class="px-4 py-3 text-left">Trade</th>
                <th class="px-4 py-3 text-left">Scope</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Compliance</th>
                <th class="px-4 py-3 text-right">Commitment</th>
                <th class="px-4 py-3 text-right">Imported Cost</th>
                <th class="px-4 py-3 text-right">Invoiced</th>
                <th class="px-4 py-3 text-right">Paid</th>
                <th class="px-4 py-3 text-right">Open AP</th>
                <th class="px-4 py-3 text-right">Retainage</th>
                <th class="px-4 py-3 text-left">Waiver</th>
                <th class="px-4 py-3 text-left">PO</th>
              </tr>
            </thead>
            <tbody>
              @for (ps of projectSubs(); track ps.id) {
                <tr class="border-b hover:bg-slate-50 cursor-pointer" (click)="openDrawer(ps)">
                  <td class="px-4 py-3 font-medium">
                    {{ ps.subcontractorName }}
                    @if (ps.importSource === 'QuickBooksSync' || ps.importSource === 'QuickBooksSeed') {
                      <app-status-chip class="ml-1" tone="blue" label="QB" />
                    }
                    @if (ps.importSource === 'DriveDiscovery' || ps.importSource === 'DriveSeed') {
                      <app-status-chip class="ml-1" tone="green" label="Drive" />
                    }
                  </td>
                  <td class="px-4 py-3">{{ ps.trade || '—' }}</td>
                  <td class="px-4 py-3 max-w-[200px] truncate">{{ ps.scopeOfWork || '—' }}</td>
                  <td class="px-4 py-3">{{ ps.status }}</td>
                  <td class="px-4 py-3">
                    <span [class.text-rose-700]="ps.complianceStatus !== 'Complete'">{{ ps.complianceStatus }}</span>
                  </td>
                  <td class="px-4 py-3 text-right font-mono">{{ ps.currentCommitmentAmount | currency }}</td>
                  <td class="px-4 py-3 text-right font-mono text-blue-800">
                    {{ (ps.importedCostToDate ?? 0) > 0 ? (ps.importedCostToDate | currency) : '—' }}
                  </td>
                  <td class="px-4 py-3 text-right font-mono">{{ ps.invoicedToDate | currency }}</td>
                  <td class="px-4 py-3 text-right font-mono">{{ ps.paidToDate | currency }}</td>
                  <td class="px-4 py-3 text-right font-mono text-orange-700">{{ ps.openBalance | currency }}</td>
                  <td class="px-4 py-3 text-right font-mono">{{ ps.retainageHeld | currency }}</td>
                  <td class="px-4 py-3">{{ waiverLabel(ps) }}</td>
                  <td class="px-4 py-3">{{ poLabel(ps.linkedPurchaseOrderId) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="13" class="px-4 py-12 text-center text-slate-400 italic">No project subcontractors yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">{{ selected()?.subcontractorName || 'Project Subcontractor' }}</h3>
            <button type="button" (click)="closeDrawer()">✕</button>
          </div>

          @if (selected(); as ps) {
            <div class="p-5 space-y-6">
              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Scope</h4>
                <textarea [(ngModel)]="draft.scopeOfWork" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
                <div class="grid grid-cols-2 gap-3 mt-3">
                  <input [(ngModel)]="draft.trade" placeholder="Trade" class="px-3 py-2 border rounded-lg text-sm">
                  <input [(ngModel)]="draft.costCode" placeholder="Cost code" class="px-3 py-2 border rounded-lg text-sm">
                </div>
              </section>

              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Commitment</h4>
                <div class="grid grid-cols-2 gap-3">
                  <input type="number" [(ngModel)]="draft.originalCommitmentAmount" placeholder="Original" class="px-3 py-2 border rounded-lg text-sm">
                  <input type="number" [(ngModel)]="draft.currentCommitmentAmount" placeholder="Current" class="px-3 py-2 border rounded-lg text-sm">
                </div>
                <div class="grid grid-cols-2 gap-3 mt-3">
                  <select [(ngModel)]="draft.linkedPurchaseOrderId" class="px-3 py-2 border rounded-lg text-sm">
                    <option [ngValue]="undefined">— Link PO —</option>
                    @for (po of poOptions(); track po.id) {
                      <option [ngValue]="po.id">{{ po.poNumber }} — {{ po.vendor }}</option>
                    }
                  </select>
                  <select [(ngModel)]="draft.budgetLineId" class="px-3 py-2 border rounded-lg text-sm">
                    <option [ngValue]="undefined">— Budget line —</option>
                    @for (line of budgetLineOptions(); track line.id) {
                      <option [ngValue]="line.id">{{ line.category }} — {{ line.costCode || line.id.slice(0, 6) }}</option>
                    }
                  </select>
                </div>
              </section>

              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Status</h4>
                <select [(ngModel)]="draft.status" class="w-full px-3 py-2 border rounded-lg text-sm">
                  @for (s of statusOptions; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
                @if (draft.status === 'ApprovedToStart' && ps.complianceStatus !== 'Complete') {
                  <div class="mt-2">
                    <label class="block text-xs text-amber-700 mb-1">Compliance override note (required)</label>
                    <textarea [(ngModel)]="draft.complianceOverrideNote" rows="2" class="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"></textarea>
                  </div>
                }
              </section>

              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Related COs / Submittals</h4>
                <div class="grid grid-cols-2 gap-3">
                  <select multiple [(ngModel)]="draftCoIds" class="px-3 py-2 border rounded-lg text-sm min-h-[80px]">
                    @for (co of projectCos(); track co.id) {
                      <option [value]="co.id">{{ co.coNumber || co.title }}</option>
                    }
                  </select>
                  <select multiple [(ngModel)]="draftSubmittalIds" class="px-3 py-2 border rounded-lg text-sm min-h-[80px]">
                    @for (sub of projectSubmittals(); track sub.id) {
                      <option [value]="sub.id">{{ sub.submittalNumber || sub.description }}</option>
                    }
                  </select>
                </div>
              </section>

              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Compliance Documents</h4>
                <div class="flex flex-wrap gap-2 mb-3">
                  <select [(ngModel)]="uploadDocType" class="px-3 py-2 border rounded-lg text-sm">
                    @for (t of docTypes; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                  <input type="date" [(ngModel)]="uploadExpiration" class="px-3 py-2 border rounded-lg text-sm">
                  <input type="file" (change)="onFileSelected($event)" class="text-sm">
                </div>
                <ul class="text-sm space-y-1">
                  @for (doc of docsForSelected(); track doc.id) {
                    <li class="flex justify-between border-b py-1">
                      <span>{{ doc.documentType }}</span>
                      <span class="text-slate-500">{{ doc.status }} · {{ doc.expirationDate || '—' }}</span>
                    </li>
                  } @empty {
                    <li class="text-slate-400 italic">No compliance documents uploaded.</li>
                  }
                </ul>
              </section>

              <section>
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs font-bold uppercase text-slate-500">Invoices / Payments</h4>
                  <button type="button" (click)="showNewInvoice.set(!showNewInvoice())" class="text-xs font-semibold text-blue-600">New Invoice</button>
                </div>

                @if (showNewInvoice()) {
                  <div class="border rounded-lg p-3 mb-3 space-y-2 bg-slate-50">
                    <input [(ngModel)]="invoiceDraft.invoiceNumber" placeholder="Invoice #" class="w-full px-3 py-2 border rounded-lg text-sm">
                    <div class="grid grid-cols-2 gap-2">
                      <input type="number" [(ngModel)]="invoiceDraft.amount" placeholder="Amount" class="px-3 py-2 border rounded-lg text-sm">
                      <input type="number" [(ngModel)]="invoiceDraft.retainagePercent" placeholder="Retainage %" class="px-3 py-2 border rounded-lg text-sm">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <input type="date" [(ngModel)]="invoiceDraft.invoiceDate" class="px-3 py-2 border rounded-lg text-sm">
                      <input type="date" [(ngModel)]="invoiceDraft.dueDate" class="px-3 py-2 border rounded-lg text-sm">
                    </div>
                    <input [(ngModel)]="invoiceDraft.description" placeholder="Description" class="w-full px-3 py-2 border rounded-lg text-sm">
                    <input type="file" (change)="onInvoiceFileSelected($event)" class="text-sm">
                    <button type="button" (click)="createInvoice()" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">Create Invoice</button>
                  </div>
                }

                <div class="overflow-x-auto border rounded-lg">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                        <th class="px-2 py-2 text-left">#</th>
                        <th class="px-2 py-2 text-right">Approved</th>
                        <th class="px-2 py-2 text-right">Paid</th>
                        <th class="px-2 py-2 text-right">Open</th>
                        <th class="px-2 py-2 text-left">Status</th>
                        <th class="px-2 py-2 text-left">Waiver</th>
                        <th class="px-2 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (inv of invoicesForSelected(); track inv.id) {
                        <tr class="border-b">
                          <td class="px-2 py-2">{{ inv.invoiceNumber }}</td>
                          <td class="px-2 py-2 text-right font-mono">{{ inv.approvedAmount | currency }}</td>
                          <td class="px-2 py-2 text-right font-mono">{{ inv.paidAmount | currency }}</td>
                          <td class="px-2 py-2 text-right font-mono">{{ inv.openBalance | currency }}</td>
                          <td class="px-2 py-2">{{ inv.status }}</td>
                          <td class="px-2 py-2">{{ inv.lienWaiverStatus }}</td>
                          <td class="px-2 py-2">
                            <div class="flex flex-wrap gap-1">
                              @if (inv.status === 'Draft' || inv.status === 'Received') {
                                <button type="button" (click)="invoiceAction(inv, 'UnderReview')" class="text-blue-600">Review</button>
                              }
                              @if (inv.status !== 'Approved' && inv.status !== 'Paid' && inv.status !== 'Void') {
                                <button type="button" (click)="invoiceAction(inv, 'Approved')" class="text-blue-600">Approve</button>
                              }
                              @if (inv.status === 'Approved' || inv.status === 'PartiallyPaid') {
                                <button type="button" (click)="invoiceAction(inv, 'Paid')" class="text-emerald-700">Mark Paid</button>
                              }
                              @if (inv.status !== 'Void') {
                                <button type="button" (click)="invoiceAction(inv, 'Disputed')" class="text-amber-700">Dispute</button>
                                <button type="button" (click)="invoiceAction(inv, 'Void')" class="text-slate-500">Void</button>
                              }
                            </div>
                          </td>
                        </tr>
                      } @empty {
                        <tr><td colspan="7" class="px-2 py-4 text-center text-slate-400 italic">No invoices yet.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Notes</h4>
                <textarea [(ngModel)]="draft.notes" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
              </section>

              @if (saveError()) {
                <p class="text-sm text-rose-700">{{ saveError() }}</p>
              }

              <button type="button" (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            </div>
          } @else {
            <div class="p-5 space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Subcontractor</label>
                <select [(ngModel)]="assignSubcontractorId" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="">— Select —</option>
                  @for (sub of masterSubs(); track sub.id) {
                    <option [value]="sub.id">{{ sub.companyName }} ({{ sub.trade || sub.status }})</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Scope of Work</label>
                <textarea [(ngModel)]="assignScope" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
              </div>
              <button type="button" (click)="assign()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Assign to Project</button>
            </div>
          }
        </aside>
      }
    </div>
  `,
})
export class ProjectSubcontractorsTabComponent implements OnChanges {
  @Input({ required: true }) project!: Project;

  private data = inject(DataService);
  private subSvc = inject(SubcontractorService);
  private psSvc = inject(ProjectSubcontractorService);
  private invSvc = inject(SubcontractorInvoiceService);
  readonly subApi = inject(SubcontractorApiService);

  private allProjectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] as ProjectSubcontractor[] });
  private masterList = toSignal(this.data.getSubcontractors(), { initialValue: [] as Subcontractor[] });
  private allDocs = toSignal(this.data.getSubcontractorDocuments(), { initialValue: [] });
  private allInvoices = toSignal(this.data.getSubcontractorInvoices(), { initialValue: [] as SubcontractorInvoice[] });
  private allCos = toSignal(this.data.getChangeOrders(), { initialValue: [] as ChangeOrder[] });
  private allSubmittals = toSignal(this.data.getSubmittals(), { initialValue: [] as Submittal[] });

  drawerOpen = signal(false);
  selected = signal<ProjectSubcontractor | null>(null);
  draft: Partial<ProjectSubcontractor> = {};
  draftCoIds: string[] = [];
  draftSubmittalIds: string[] = [];
  saveError = signal<string | null>(null);

  assignSubcontractorId = '';
  assignScope = '';
  uploadDocType: SubcontractorDocumentType = 'W9';
  uploadExpiration = '';
  pendingFile: File | null = null;
  pendingInvoiceFile: File | null = null;
  showNewInvoice = signal(false);
  invoiceDraft: Partial<SubcontractorInvoice> = { retainagePercent: 10 };

  readonly docTypes = SUBCONTRACTOR_DOC_TYPES;
  readonly statusOptions: ProjectSubcontractor['status'][] = [
    'Planned', 'PendingContract', 'PendingCompliance', 'ApprovedToStart', 'Active',
    'WorkComplete', 'FinalWaiverNeeded', 'Closed', 'HoldIssue',
  ];

  projectSubs = computed(() => {
    if (this.sqlReadOnly()) {
      return this.subApi.projectSubcontractors().filter(ps => ps.projectId === this.project.id);
    }
    return this.allProjectSubs().filter(ps => ps.projectId === this.project.id);
  });

  sqlReadOnly = computed(() =>
    this.subApi.isEnabled()
    && this.subApi.projectSubsActiveSource() === 'api'
    && this.matchesLoadedProject(this.subApi.projectSubsProjectId()),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project) {
      void this.subApi.loadProjectSubcontractors(this.projectKey());
    }
  }

  private projectKey(): string {
    return this.project.projectNumber || this.project.id;
  }

  private matchesLoadedProject(loadedKey: string | null): boolean {
    if (!loadedKey) return false;
    const keys = [this.project.id, this.project.projectNumber].filter(Boolean);
    return keys.some(key => key === loadedKey || key?.replace(/^J/i, '') === loadedKey.replace(/^J/i, ''));
  }
  masterSubs = computed(() => this.masterList());
  poOptions = computed(() => this.psSvc.poOptions(this.project.id));
  budgetLineOptions = computed(() => this.psSvc.budgetLineOptions(this.project.id));
  projectCos = computed(() => this.allCos().filter(c => c.projectId === this.project.id));
  projectSubmittals = computed(() => this.allSubmittals().filter(s => s.projectId === this.project.id));

  poLabel(poId?: string): string {
    if (!poId) return '—';
    return this.data.posSnapshot().find(p => p.id === poId)?.poNumber ?? poId.slice(0, 8);
  }

  waiverLabel(ps: ProjectSubcontractor): string {
    const invs = this.allInvoices().filter(i => i.projectSubcontractorId === ps.id);
    if (invs.some(i => i.lienWaiverStatus === 'FinalNeeded')) return 'Final Needed';
    if (invs.some(i => i.lienWaiverStatus === 'Needed')) return 'Needed';
    if (invs.some(i => i.lienWaiverStatus === 'Received')) return 'Received';
    return '—';
  }

  invoicesForSelected(): SubcontractorInvoice[] {
    const ps = this.selected();
    if (!ps) return [];
    return this.allInvoices().filter(i => i.projectSubcontractorId === ps.id);
  }

  docsForSelected() {
    const ps = this.selected();
    if (!ps) return [];
    return this.allDocs().filter(d => d.subcontractorId === ps.subcontractorId
      && (!d.projectSubcontractorId || d.projectSubcontractorId === ps.id));
  }

  openAssign(): void {
    this.selected.set(null);
    this.assignSubcontractorId = '';
    this.assignScope = '';
    this.drawerOpen.set(true);
  }

  openDrawer(ps: ProjectSubcontractor): void {
    this.selected.set(ps);
    this.draft = { ...ps };
    this.draftCoIds = [...(ps.linkedChangeOrderIds ?? [])];
    this.draftSubmittalIds = [...(ps.linkedSubmittalIds ?? [])];
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.pendingFile = null;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pendingFile = input.files?.[0] ?? null;
  }

  onInvoiceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pendingInvoiceFile = input.files?.[0] ?? null;
  }

  async createInvoice(): Promise<void> {
    const ps = this.selected();
    if (!ps || !this.invoiceDraft.amount) return;
    const inv = await this.invSvc.createInvoice(this.project, ps, {
      ...this.invoiceDraft,
      status: 'Received',
    });
    if (this.pendingInvoiceFile) {
      await this.invSvc.uploadInvoiceDocument(this.project, inv, this.pendingInvoiceFile, 'SubcontractorInvoice');
      this.pendingInvoiceFile = null;
    }
    this.invoiceDraft = { retainagePercent: 10 };
    this.showNewInvoice.set(false);
  }

  async invoiceAction(inv: SubcontractorInvoice, status: SubcontractorInvoice['status']): Promise<void> {
    await this.invSvc.setStatus(inv, status);
  }

  async assign(): Promise<void> {
    const sub = this.masterList().find(s => s.id === this.assignSubcontractorId);
    if (!sub) return;
    await this.psSvc.assignToProject(this.project, sub, { scopeOfWork: this.assignScope });
    this.closeDrawer();
  }

  async save(): Promise<void> {
    const ps = this.selected();
    if (!ps) return;
    this.saveError.set(null);
    try {
      if (this.pendingFile) {
        await this.psSvc.uploadComplianceDocument(
          this.project,
          ps,
          this.pendingFile,
          this.uploadDocType,
          this.uploadExpiration || undefined,
        );
        this.pendingFile = null;
      }

      await this.psSvc.saveProjectSubcontractor(ps, {
        ...this.draft,
        linkedChangeOrderIds: this.draftCoIds,
        linkedSubmittalIds: this.draftSubmittalIds,
      });
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Save failed');
    }
  }
}
