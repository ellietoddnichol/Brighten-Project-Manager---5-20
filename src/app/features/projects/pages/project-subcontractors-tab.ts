import { Component, Input, computed, inject, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '@app/models/types';
import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorInvoice,
} from '@app/models/subcontractor.types';
import { DataService } from '@core/services/data.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { ProjectSubcontractorService } from '@features/subcontractors/services/project-subcontractor.service';
import { SubcontractorInvoiceService } from '@features/subcontractors/services/subcontractor-invoice.service';
import { manualFirstConfig } from '@app/config/manual-first.config';

@Component({
  selector: 'app-project-subcontractors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm text-slate-600">Track subcontractor contracts and billing on this job.</p>
          <a routerLink="/directory" [queryParams]="{ segment: 'subcontractors' }"
             class="text-xs font-semibold text-indigo-700 hover:underline">Add subs in Directory →</a>
        </div>
        <button type="button" (click)="openAssign()"
                class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold shrink-0">
          Assign Subcontractor
        </button>
      </div>

      @if (saveError()) {
        <p class="px-3 py-2 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg">{{ saveError() }}</p>
      }

      <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
              <th class="px-4 py-3 text-left">Subcontractor</th>
              <th class="px-4 py-3 text-left">Trade</th>
              <th class="px-4 py-3 text-left">Scope</th>
              <th class="px-4 py-3 text-right">Contract</th>
              <th class="px-4 py-3 text-right">Billed</th>
              <th class="px-4 py-3 text-right">%</th>
              <th class="px-4 py-3 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            @for (ps of projectSubs(); track ps.id) {
              <tr class="border-b hover:bg-slate-50 cursor-pointer" (click)="openDrawer(ps)">
                <td class="px-4 py-3 font-medium">{{ ps.subcontractorName }}</td>
                <td class="px-4 py-3">{{ ps.trade || '—' }}</td>
                <td class="px-4 py-3 max-w-[220px] truncate">{{ ps.scopeOfWork || '—' }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ ps.currentCommitmentAmount | currency }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ ps.invoicedToDate | currency }}</td>
                <td class="px-4 py-3 text-right font-mono">{{ billedPct(ps) | number:'1.0-0' }}%</td>
                <td class="px-4 py-3 text-right font-mono" [class.text-emerald-700]="remaining(ps) <= 0">
                  {{ remaining(ps) | currency }}
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="px-4 py-12 text-center text-slate-400">
                  No subcontractors on this job yet. Use <strong>Assign Subcontractor</strong> or add them in Directory first.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b bg-slate-50 flex justify-between items-center">
            <h3 class="text-lg font-bold">{{ selected() ? selected()!.subcontractorName : 'Assign Subcontractor' }}</h3>
            <button type="button" (click)="closeDrawer()">✕</button>
          </div>

          @if (selected(); as ps) {
            <div class="p-5 space-y-5">
              <section>
                <h4 class="text-xs font-bold uppercase text-slate-500 mb-2">Contract</h4>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Contract amount</label>
                    <input type="number" [(ngModel)]="draft.currentCommitmentAmount" class="w-full px-3 py-2 border rounded-lg text-sm">
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Trade</label>
                    <input [(ngModel)]="draft.trade" class="w-full px-3 py-2 border rounded-lg text-sm">
                  </div>
                </div>
                <div class="mt-3">
                  <label class="block text-xs text-slate-500 mb-1">Scope of work</label>
                  <textarea [(ngModel)]="draft.scopeOfWork" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div class="bg-slate-50 rounded-lg p-2 border">
                    <p class="text-slate-500 uppercase text-[10px] font-bold">Billed</p>
                    <p class="font-mono font-semibold">{{ ps.invoicedToDate | currency }}</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-2 border">
                    <p class="text-slate-500 uppercase text-[10px] font-bold">%</p>
                    <p class="font-mono font-semibold">{{ billedPct(ps) | number:'1.0-0' }}%</p>
                  </div>
                  <div class="bg-slate-50 rounded-lg p-2 border">
                    <p class="text-slate-500 uppercase text-[10px] font-bold">Remaining</p>
                    <p class="font-mono font-semibold">{{ remaining(ps) | currency }}</p>
                  </div>
                </div>
              </section>

              <section>
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs font-bold uppercase text-slate-500">Billings</h4>
                  <button type="button" (click)="showNewBilling.set(!showNewBilling())"
                          class="text-xs font-semibold text-indigo-700">Add billing</button>
                </div>
                @if (showNewBilling()) {
                  <div class="border rounded-lg p-3 mb-3 space-y-2 bg-slate-50">
                    <input [(ngModel)]="billingDraft.invoiceNumber" placeholder="Invoice / draw #" class="w-full px-3 py-2 border rounded-lg text-sm">
                    <div class="grid grid-cols-2 gap-2">
                      <input type="number" [(ngModel)]="billingDraft.amount" placeholder="Amount billed" class="px-3 py-2 border rounded-lg text-sm">
                      <input type="date" [(ngModel)]="billingDraft.invoiceDate" class="px-3 py-2 border rounded-lg text-sm">
                    </div>
                    <input [(ngModel)]="billingDraft.description" placeholder="Description (optional)" class="w-full px-3 py-2 border rounded-lg text-sm">
                    <button type="button" (click)="addBilling()" [disabled]="saving()"
                            class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
                      {{ saving() ? 'Saving…' : 'Save billing' }}
                    </button>
                  </div>
                }
                <ul class="text-sm border rounded-lg divide-y">
                  @for (inv of invoicesForSelected(); track inv.id) {
                    <li class="px-3 py-2 flex justify-between gap-2">
                      <div>
                        <p class="font-medium">{{ inv.invoiceNumber || 'Billing' }}</p>
                        <p class="text-xs text-slate-500">{{ inv.invoiceDate || '—' }} · {{ inv.status }}</p>
                      </div>
                      <span class="font-mono font-semibold shrink-0">{{ inv.approvedAmount | currency }}</span>
                    </li>
                  } @empty {
                    <li class="px-3 py-4 text-center text-slate-400 italic text-xs">No billings recorded yet.</li>
                  }
                </ul>
              </section>

              <button type="button" (click)="save()" [disabled]="saving()"
                      class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {{ saving() ? 'Saving…' : 'Save contract' }}
              </button>
            </div>
          } @else {
            <div class="p-5 space-y-4">
              <div class="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                <button type="button" (click)="assignMode.set('existing')"
                        class="flex-1 px-3 py-2 transition-colors"
                        [class.bg-slate-900]="assignMode() === 'existing'"
                        [class.text-white]="assignMode() === 'existing'">From directory</button>
                <button type="button" (click)="assignMode.set('new')"
                        class="flex-1 px-3 py-2 transition-colors"
                        [class.bg-slate-900]="assignMode() === 'new'"
                        [class.text-white]="assignMode() === 'new'">New company</button>
              </div>

              @if (assignMode() === 'existing') {
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Subcontractor</label>
                  <select [(ngModel)]="assignSubcontractorId" class="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">— Select —</option>
                    @for (sub of masterSubs(); track sub.id) {
                      <option [value]="sub.id">{{ sub.companyName }}{{ sub.trade ? ' · ' + sub.trade : '' }}</option>
                    }
                  </select>
                  @if (!masterSubs().length) {
                    <p class="text-xs text-slate-500 mt-1">
                      <a routerLink="/directory" [queryParams]="{ segment: 'subcontractors' }" class="text-indigo-700 font-semibold">Add subcontractors</a> in Directory first.
                    </p>
                  }
                </div>
              } @else {
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Company name</label>
                  <input [(ngModel)]="newCompanyName" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Subcontractor name">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Trade</label>
                  <input [(ngModel)]="assignTrade" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="e.g. Electrical">
                </div>
              }

              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Contract amount</label>
                <input type="number" [(ngModel)]="assignContract" class="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Total subcontract amount">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Scope of work</label>
                <textarea [(ngModel)]="assignScope" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
              </div>
              <button type="button" (click)="assign()" [disabled]="saving()"
                      class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 w-full">
                {{ saving() ? 'Assigning…' : 'Assign to this job' }}
              </button>
            </div>
          }
        </aside>
      }
    </div>
  `,
})
export class ProjectSubcontractorsTabComponent implements OnChanges {
  @Input({ required: true }) project!: Project;

  readonly manualFirst = manualFirstConfig;
  private data = inject(DataService);
  private subSvc = inject(SubcontractorService);
  private psSvc = inject(ProjectSubcontractorService);
  private invSvc = inject(SubcontractorInvoiceService);

  private allProjectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] as ProjectSubcontractor[] });
  private masterList = toSignal(this.data.getSubcontractors(), { initialValue: [] as Subcontractor[] });
  private allInvoices = toSignal(this.data.getSubcontractorInvoices(), { initialValue: [] as SubcontractorInvoice[] });

  drawerOpen = signal(false);
  selected = signal<ProjectSubcontractor | null>(null);
  draft: Partial<ProjectSubcontractor> = {};
  saveError = signal<string | null>(null);
  saving = signal(false);
  showNewBilling = signal(false);

  assignMode = signal<'existing' | 'new'>('existing');
  assignSubcontractorId = '';
  newCompanyName = '';
  assignTrade = '';
  assignContract: number | null = null;
  assignScope = '';
  billingDraft: Partial<SubcontractorInvoice> = {};

  projectSubs = computed(() =>
    this.allProjectSubs().filter(ps => ps.projectId === this.project.id),
  );

  masterSubs = computed(() =>
    [...this.masterList()].sort((a, b) => a.companyName.localeCompare(b.companyName)),
  );

  ngOnChanges(_changes: SimpleChanges): void {
    // Firestore subscriptions keep data live; no SQL preload in manual-first mode.
  }

  billedPct(ps: ProjectSubcontractor): number {
    const contract = ps.currentCommitmentAmount ?? 0;
    if (contract <= 0) return 0;
    return Math.min(100, ((ps.invoicedToDate ?? 0) / contract) * 100);
  }

  remaining(ps: ProjectSubcontractor): number {
    return Math.max(0, (ps.currentCommitmentAmount ?? 0) - (ps.invoicedToDate ?? 0));
  }

  invoicesForSelected(): SubcontractorInvoice[] {
    const ps = this.selected();
    if (!ps) return [];
    return this.allInvoices()
      .filter(i => i.projectSubcontractorId === ps.id)
      .sort((a, b) => (b.invoiceDate ?? '').localeCompare(a.invoiceDate ?? ''));
  }

  openAssign(): void {
    this.selected.set(null);
    this.assignMode.set(this.masterSubs().length ? 'existing' : 'new');
    this.assignSubcontractorId = '';
    this.newCompanyName = '';
    this.assignTrade = '';
    this.assignContract = null;
    this.assignScope = '';
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  openDrawer(ps: ProjectSubcontractor): void {
    this.selected.set(ps);
    this.draft = {
      currentCommitmentAmount: ps.currentCommitmentAmount,
      originalCommitmentAmount: ps.originalCommitmentAmount ?? ps.currentCommitmentAmount,
      trade: ps.trade,
      scopeOfWork: ps.scopeOfWork,
    };
    this.billingDraft = { invoiceDate: new Date().toISOString().slice(0, 10) };
    this.showNewBilling.set(false);
    this.saveError.set(null);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
    this.saveError.set(null);
  }

  async assign(): Promise<void> {
    const contract = this.assignContract ?? 0;
    if (contract <= 0) {
      this.saveError.set('Enter the contract amount.');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    try {
      let sub: Subcontractor | undefined;
      if (this.assignMode() === 'new') {
        const name = this.newCompanyName.trim();
        if (!name) {
          this.saveError.set('Enter a company name.');
          return;
        }
        sub = await this.subSvc.saveSubcontractor({
          companyName: name,
          trade: this.assignTrade.trim() || undefined,
          vendorClassification: 'Subcontractor',
          source: 'Manual',
        });
      } else {
        sub = this.masterList().find(s => s.id === this.assignSubcontractorId);
        if (!sub) {
          this.saveError.set('Select a subcontractor from the directory.');
          return;
        }
      }
      await this.psSvc.assignToProject(this.project, sub, {
        trade: this.assignTrade.trim() || sub.trade,
        scopeOfWork: this.assignScope.trim() || undefined,
        originalCommitmentAmount: contract,
        currentCommitmentAmount: contract,
        status: 'Active',
      });
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not assign subcontractor.');
    } finally {
      this.saving.set(false);
    }
  }

  async addBilling(): Promise<void> {
    const ps = this.selected();
    if (!ps || !this.billingDraft.amount || this.billingDraft.amount <= 0) {
      this.saveError.set('Enter a billing amount.');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    try {
      const inv = await this.invSvc.createInvoice(this.project, ps, {
        ...this.billingDraft,
        status: 'Approved',
        approvedAmount: this.billingDraft.amount,
      });
      this.billingDraft = { invoiceDate: new Date().toISOString().slice(0, 10) };
      this.showNewBilling.set(false);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Could not save billing.');
    } finally {
      this.saving.set(false);
    }
  }

  async save(): Promise<void> {
    const ps = this.selected();
    if (!ps) return;
    const contract = this.draft.currentCommitmentAmount ?? 0;
    if (contract <= 0) {
      this.saveError.set('Enter a contract amount.');
      return;
    }
    this.saveError.set(null);
    this.saving.set(true);
    try {
      await this.psSvc.saveProjectSubcontractor(ps, {
        ...this.draft,
        originalCommitmentAmount: this.draft.originalCommitmentAmount ?? contract,
        currentCommitmentAmount: contract,
      });
      this.closeDrawer();
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
