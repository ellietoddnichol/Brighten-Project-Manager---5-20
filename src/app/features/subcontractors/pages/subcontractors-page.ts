import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DataService } from '@core/services/data.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { SubcontractorSeedService } from '@features/subcontractors/services/subcontractor-seed.service';
import { Subcontractor, SubcontractorStatus, SubcontractorInvoice, VendorClassification } from '@app/models/subcontractor.types';
import { countActiveProjectsForSub, isCoiExpiringSoon, isDocumentExpired } from '@features/subcontractors/utils/subcontractor-compliance.compute';
import { isInvoiceOverdue } from '@features/subcontractors/utils/subcontractor-invoice.compute';
import { PageHeaderComponent } from '@app/components/ui/page-header';
import { StatusChipComponent, StatusTone } from '@app/components/ui/status-chip';
import { EmptyStateComponent } from '@app/components/ui/empty-state';
import { downloadCsv } from '@shared/utils/csv-export';

type PageView = 'directory' | 'invoices';
type SubFilter =
  | 'all'
  | 'Approved'
  | 'PendingSetup'
  | 'MissingCompliance'
  | 'MissingW9'
  | 'MissingCOI'
  | 'ExpiringCOI'
  | 'ExpiredInsurance'
  | 'DoNotUse'
  | 'Inactive'
  | 'NeedsReview';

@Component({
  selector: 'app-subcontractors-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusChipComponent, EmptyStateComponent],
  template: `
    <div class="p-4 lg:p-6 w-full max-w-[1440px] mx-auto space-y-4">
      <app-page-header
        title="Subcontractors"
        subtitle="Master directory, compliance status, and AP invoices"
        [hasActions]="true">
        <div class="flex rounded-lg border border-slate-200 overflow-hidden">
          <button type="button" (click)="pageView.set('directory')"
                  class="px-3 py-2 text-xs font-semibold transition-colors"
                  [class.bg-slate-900]="pageView() === 'directory'"
                  [class.text-white]="pageView() === 'directory'"
                  [class.text-slate-600]="pageView() !== 'directory'">Directory</button>
          <button type="button" (click)="pageView.set('invoices')"
                  class="px-3 py-2 text-xs font-semibold transition-colors"
                  [class.bg-slate-900]="pageView() === 'invoices'"
                  [class.text-white]="pageView() === 'invoices'"
                  [class.text-slate-600]="pageView() !== 'invoices'">Invoices</button>
        </div>
        @if (pageView() === 'directory') {
          <button type="button" (click)="exportDirectoryCsv()"
                  class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
            Export CSV
          </button>
          <button type="button" (click)="discoverSubs()" [disabled]="importing()"
                  class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50">
            {{ importing() ? 'Discovering…' : 'Discover subcontractors' }}
          </button>
          <button type="button" (click)="openNew()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
            New Subcontractor
          </button>
        }
      </app-page-header>

      @if (pageView() === 'directory') {
      <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        @for (card of summaryCards(); track card.label) {
          <div class="bg-white p-3 rounded-xl border shadow-sm">
            <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
            <p class="text-lg font-bold" [class.text-rose-700]="card.alert">{{ card.value }}</p>
          </div>
        }
      </div>

      <div class="flex flex-wrap gap-2">
        @for (f of filterOptions; track f.id) {
          <button type="button" (click)="activeFilter.set(f.id)"
                  class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold transition-colors"
                  [class.bg-slate-900]="activeFilter() === f.id"
                  [class.text-white]="activeFilter() === f.id"
                  [class.text-slate-600]="activeFilter() !== f.id">
            {{ f.label }}
          </button>
        }
      </div>

      <div class="relative max-w-md">
        <input type="text" [ngModel]="searchQuery()" (ngModelChange)="searchQuery.set($event)"
               placeholder="Search company or contact…"
               class="w-full px-4 py-2.5 bg-white rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-300 outline-none">
      </div>

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[1200px]">
            <thead>
              <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                <th class="px-4 py-3 text-left">Subcontractor</th>
                <th class="px-4 py-3 text-left">Trade</th>
                <th class="px-4 py-3 text-left">Contact</th>
                <th class="px-4 py-3 text-left">W-9</th>
                <th class="px-4 py-3 text-left">Insurance</th>
                <th class="px-4 py-3 text-left">Compliance</th>
                <th class="px-4 py-3 text-left">COI Exp</th>
                <th class="px-4 py-3 text-left">Classification</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-right">Imported Cost</th>
                <th class="px-4 py-3 text-right">Active Projects</th>
                <th class="px-4 py-3 text-right">Open Tasks</th>
                <th class="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRows(); track row.sub.id) {
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" (click)="selectSub(row.sub)">
                  <td class="px-4 py-3">
                    <div class="font-semibold text-slate-900" [class.text-rose-700]="row.sub.status === 'DoNotUse'">{{ row.sub.companyName }}</div>
                    @if (row.sub.trade) {
                      <div class="text-xs text-slate-500">{{ row.sub.trade }}</div>
                    }
                  </td>
                  <td class="px-4 py-3">{{ row.sub.trade || '—' }}</td>
                  <td class="px-4 py-3">
                    <div>{{ row.sub.contactName || '—' }}</div>
                    <div class="text-xs text-slate-500">
                      @if (row.sub.phone) { <a [href]="'tel:' + row.sub.phone" (click)="$event.stopPropagation()" class="text-indigo-700 hover:underline">{{ row.sub.phone }}</a> }
                      @if (row.sub.email) { <a [href]="'mailto:' + row.sub.email" (click)="$event.stopPropagation()" class="text-indigo-700 hover:underline block">{{ row.sub.email }}</a> }
                    </div>
                  </td>
                  <td class="px-4 py-3">{{ row.sub.w9Status }}</td>
                  <td class="px-4 py-3">{{ row.sub.insuranceStatus }}</td>
                  <td class="px-4 py-3">
                    <app-status-chip [tone]="complianceTone(row.sub)" [attr.title]="complianceTooltip(row.sub)">
                      {{ complianceLabel(row.sub) }}
                    </app-status-chip>
                  </td>
                  <td class="px-4 py-3">{{ row.sub.coiExpirationDate || '—' }}</td>
                  <td class="px-4 py-3">
                    <app-status-chip tone="slate">{{ row.sub.vendorClassification ?? 'NeedsReview' }}</app-status-chip>
                  </td>
                  <td class="px-4 py-3">
                    <app-status-chip [tone]="subStatusTone(row.sub.status)">{{ row.sub.status }}</app-status-chip>
                    @if (row.sub.source === 'QuickBooksSync' || row.sub.source === 'QuickBooksSeed') {
                      <app-status-chip tone="blue" label="QB" />
                    }
                    @if (row.sub.source === 'DriveDiscovery' || row.sub.source === 'DriveSeed') {
                      <app-status-chip tone="green" label="Drive" />
                    }
                  </td>
                  <td class="px-4 py-3 text-right text-xs font-numeric text-slate-700">
                    {{ row.sub.seededTotalCost != null ? (row.sub.seededTotalCost | currency) : '—' }}
                  </td>
                  <td class="px-4 py-3 text-right">{{ row.activeProjects }}</td>
                  <td class="px-4 py-3 text-right">
                    <button type="button" (click)="selectSub(row.sub); $event.stopPropagation()"
                            class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                      Open
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="12">
                  @if (sourceDataAvailable() && subCount() === 0) {
                    <app-empty-state icon="group_off" title="No subcontractors found"
                                     message="Discover subcontractors from QuickBooks / Drive to populate the directory."
                                     actionLabel="Discover subcontractors"
                                     (actionClick)="discoverSubs()" />
                  } @else if (subCount() === 0) {
                    <app-empty-state icon="group_off" title="No subcontractors found"
                                     message="Re-sync the QuickBooks workbook in Settings, then discover subcontractors here." />
                  } @else {
                    <app-empty-state title="No subcontractors match this filter" message="Try a different filter or search term." />
                  }
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      } @else {
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          @for (card of invoiceSummaryCards(); track card.label) {
            <div class="bg-white p-3 rounded-xl border shadow-sm">
              <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">{{ card.label }}</p>
              <p class="text-lg font-bold" [class.text-rose-700]="card.alert">{{ card.value }}</p>
            </div>
          }
        </div>

        <div class="flex flex-wrap gap-2">
          @for (f of invoiceFilterOptions; track f.id) {
            <button type="button" (click)="invoiceFilter.set(f.id)"
                    class="px-3 py-1.5 rounded-lg border text-xs font-semibold"
                    [class.bg-slate-900]="invoiceFilter() === f.id"
                    [class.text-white]="invoiceFilter() === f.id">
              {{ f.label }}
            </button>
          }
        </div>

        <div class="bg-white rounded-xl border overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-sm min-w-[1100px]">
              <thead>
                <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                  <th class="px-4 py-3 text-left">Invoice</th>
                  <th class="px-4 py-3 text-left">Subcontractor</th>
                  <th class="px-4 py-3 text-left">Project</th>
                  <th class="px-4 py-3 text-left">Due</th>
                  <th class="px-4 py-3 text-right">Approved</th>
                  <th class="px-4 py-3 text-right">Open</th>
                  <th class="px-4 py-3 text-left">Status</th>
                  <th class="px-4 py-3 text-left">Waiver</th>
                </tr>
              </thead>
              <tbody>
                @for (inv of filteredInvoices(); track inv.id) {
                  <tr class="border-b hover:bg-slate-50">
                    <td class="px-4 py-3 font-medium">{{ inv.invoiceNumber }}</td>
                    <td class="px-4 py-3">{{ inv.subcontractorName }}</td>
                    <td class="px-4 py-3">{{ inv.projectName || inv.jobNumber || '—' }}</td>
                    <td class="px-4 py-3" [class.text-rose-700]="isOverdue(inv)">{{ inv.dueDate || '—' }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ inv.approvedAmount | currency }}</td>
                    <td class="px-4 py-3 text-right font-numeric">{{ inv.openBalance | currency }}</td>
                    <td class="px-4 py-3">{{ inv.status }}</td>
                    <td class="px-4 py-3">{{ inv.lienWaiverStatus }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="px-4 py-12 text-center text-slate-400 italic">No invoices match this filter.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (drawerOpen()) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="closeDrawer()"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
          <div class="p-5 border-b flex justify-between items-center bg-slate-50">
            <h3 class="text-lg font-bold">{{ editingId() ? 'Edit Subcontractor' : 'New Subcontractor' }}</h3>
            <button type="button" (click)="closeDrawer()">✕</button>
          </div>
          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Company Name</label>
              <input [(ngModel)]="draft.companyName" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Trade</label>
                <input [(ngModel)]="draft.trade" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Contact</label>
                <input [(ngModel)]="draft.contactName" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Phone</label>
                <input [(ngModel)]="draft.phone" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                <input [(ngModel)]="draft.email" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
              <input [(ngModel)]="draft.address" class="w-full px-3 py-2 border rounded-lg text-sm">
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">W-9 Status</label>
                <select [(ngModel)]="draft.w9Status" class="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="Missing">Missing</option>
                  <option value="OnFile">On File</option>
                  <option value="Expired">Expired</option>
                  <option value="NotRequired">Not Required</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-500 uppercase mb-1">COI Expiration</label>
                <input type="date" [(ngModel)]="draft.coiExpirationDate" class="w-full px-3 py-2 border rounded-lg text-sm">
              </div>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Vendor Classification</label>
              <select [(ngModel)]="draft.vendorClassification" class="w-full px-3 py-2 border rounded-lg text-sm">
                @for (c of vendorClassifications; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Notes</label>
              <textarea [(ngModel)]="draft.notes" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm"></textarea>
            </div>
            <div class="flex flex-wrap gap-2 pt-2">
              <button type="button" (click)="save()" class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
              @if (editingId()) {
                <button type="button" (click)="markApproved()" class="border px-4 py-2 rounded-lg text-sm">Mark Approved</button>
                <button type="button" (click)="markInactive()" class="border px-4 py-2 rounded-lg text-sm">Mark Inactive</button>
                <button type="button" (click)="markDoNotUse()" class="border border-rose-300 text-rose-700 px-4 py-2 rounded-lg text-sm">Do Not Use</button>
              }
            </div>
          </div>
        </aside>
      }
    </div>
  `,
})
export class SubcontractorsPage implements OnInit {
  private data = inject(DataService);
  private subSvc = inject(SubcontractorService);
  private subSeed = inject(SubcontractorSeedService);
  private route = inject(ActivatedRoute);

  sourceDataAvailable = computed(() => this.subSeed.sourceDataAvailable());
  importing = signal(false);

  subCount = computed(() => (this.subs() ?? []).length);

  private subs = toSignal(this.data.getSubcontractors(), { initialValue: [] as Subcontractor[] });
  private projectSubs = toSignal(this.data.getProjectSubcontractors(), { initialValue: [] });
  private tasks = toSignal(this.data.getProjectTasks(), { initialValue: [] });
  private invoices = toSignal(this.data.getSubcontractorInvoices(), { initialValue: [] as SubcontractorInvoice[] });

  pageView = signal<PageView>('directory');
  activeFilter = signal<SubFilter>('all');
  searchQuery = signal('');
  invoiceFilter = signal<'all' | 'open' | 'due' | 'overdue' | 'missingWaiver' | 'disputed'>('all');
  invoiceSearch = signal('');
  drawerOpen = signal(false);
  editingId = signal<string | null>(null);
  draft: Partial<Subcontractor> = {};

  readonly invoiceFilterOptions = [
    { id: 'all' as const, label: 'All' },
    { id: 'open' as const, label: 'Open' },
    { id: 'due' as const, label: 'Due Soon' },
    { id: 'overdue' as const, label: 'Overdue' },
    { id: 'missingWaiver' as const, label: 'Missing Waivers' },
    { id: 'disputed' as const, label: 'Disputed' },
  ];

  readonly filterOptions: { id: SubFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'Approved', label: 'Approved' },
    { id: 'PendingSetup', label: 'Pending Setup' },
    { id: 'MissingCompliance', label: 'Missing Compliance' },
    { id: 'MissingW9', label: 'Missing W-9' },
    { id: 'MissingCOI', label: 'Missing COI' },
    { id: 'ExpiringCOI', label: 'Expiring COI' },
    { id: 'ExpiredInsurance', label: 'Expired Insurance' },
    { id: 'DoNotUse', label: 'Do Not Use' },
    { id: 'NeedsReview', label: 'Needs Review' },
    { id: 'Inactive', label: 'Inactive' },
  ];

  readonly vendorClassifications: VendorClassification[] = [
    'Subcontractor', 'Supplier', 'Consultant', 'Ignore', 'NeedsReview',
  ];

  rows = computed(() => (this.subs() ?? []).map(sub => ({
    sub,
    activeProjects: countActiveProjectsForSub(sub.id, this.projectSubs() ?? []),
    openTasks: (this.tasks() ?? []).filter(t =>
      t.systemTriggerKey?.includes(sub.id) && t.status !== 'Complete' && t.status !== 'Canceled',
    ).length,
  })));

  filteredRows = computed(() => {
    const filter = this.activeFilter();
    const q = this.searchQuery().trim().toLowerCase();
    return this.rows().filter(({ sub }) => {
      if (q) {
        const haystack = [sub.companyName, sub.contactName, sub.trade, sub.email, sub.phone].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      switch (filter) {
        case 'Approved': return sub.status === 'Approved';
        case 'PendingSetup': return sub.status === 'PendingSetup';
        case 'MissingCompliance': return sub.status === 'MissingCompliance';
        case 'MissingW9': return sub.w9Status === 'Missing';
        case 'MissingCOI': return sub.insuranceStatus === 'Missing';
        case 'ExpiringCOI': return isCoiExpiringSoon(sub.coiExpirationDate) && !isDocumentExpired(sub.coiExpirationDate);
        case 'ExpiredInsurance': return sub.insuranceStatus === 'Expired';
        case 'DoNotUse': return sub.status === 'DoNotUse';
        case 'NeedsReview': return (sub.vendorClassification ?? 'NeedsReview') === 'NeedsReview';
        case 'Inactive': return sub.status === 'Inactive';
        default: return true;
      }
    });
  });

  summaryCards = computed(() => {
    const subs = this.subs() ?? [];
    const qbDiscovered = subs.filter(s =>
      s.source === 'QuickBooksSync' || s.source === 'QuickBooksSeed' || (s.seededTotalCost ?? 0) > 0,
    );
    const importedTotal = qbDiscovered.reduce((s, x) => s + (x.seededTotalCost ?? 0), 0);
    return [
      { label: 'Total', value: String(subs.length), alert: false },
      { label: 'From QuickBooks', value: String(qbDiscovered.length), alert: false },
      { label: 'Imported Cost', value: importedTotal ? `$${Math.round(importedTotal).toLocaleString()}` : '—', alert: false },
      { label: 'Missing W-9', value: String(subs.filter(s => s.w9Status === 'Missing').length), alert: true },
      { label: 'Missing COI', value: String(subs.filter(s => s.insuranceStatus === 'Missing').length), alert: true },
      { label: 'Expiring COI', value: String(subs.filter(s => isCoiExpiringSoon(s.coiExpirationDate)).length), alert: true },
      { label: 'Expired COI', value: String(subs.filter(s => s.insuranceStatus === 'Expired').length), alert: true },
      { label: 'Compliance Issues', value: String(subs.filter(s => s.status === 'MissingCompliance').length), alert: true },
      { label: 'Do Not Use', value: String(subs.filter(s => s.status === 'DoNotUse').length), alert: true },
    ];
  });

  invoiceSummaryCards = computed(() => {
    const invs = this.invoices().filter(i => i.status !== 'Void');
    const open = invs.filter(i => (i.openBalance ?? 0) > 0 && i.status !== 'Paid');
    const overdue = invs.filter(i => isInvoiceOverdue(i));
    const missingWaiver = invs.filter(i =>
      i.lienWaiverStatus === 'Needed' || i.lienWaiverStatus === 'FinalNeeded',
    );
    const dueSoon = invs.filter(i => this.isDueSoon(i) && !isInvoiceOverdue(i));
    return [
      { label: 'Open Invoices', value: String(open.length), alert: open.length > 0 },
      { label: 'Due Soon', value: String(dueSoon.length), alert: dueSoon.length > 0 },
      { label: 'Overdue', value: String(overdue.length), alert: overdue.length > 0 },
      { label: 'Missing Waivers', value: String(missingWaiver.length), alert: missingWaiver.length > 0 },
      { label: 'Disputed', value: String(invs.filter(i => i.status === 'Disputed').length), alert: true },
    ];
  });

  filteredInvoices = computed(() => {
    const filter = this.invoiceFilter();
    const q = this.invoiceSearch().trim().toLowerCase();
    const invs = this.invoices().filter(i => i.status !== 'Void');
    return invs.filter(inv => {
      if (q) {
        const haystack = [
          inv.invoiceNumber,
          inv.subcontractorName,
          inv.projectName,
          inv.jobNumber,
          inv.description,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      switch (filter) {
        case 'open': return (inv.openBalance ?? 0) > 0 && inv.status !== 'Paid';
        case 'due': return this.isDueSoon(inv) && !isInvoiceOverdue(inv);
        case 'overdue': return isInvoiceOverdue(inv);
        case 'missingWaiver': return inv.lienWaiverStatus === 'Needed' || inv.lienWaiverStatus === 'FinalNeeded';
        case 'disputed': return inv.status === 'Disputed';
        default: return true;
      }
    }).sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''));
  });

  isOverdue(inv: SubcontractorInvoice): boolean {
    return isInvoiceOverdue(inv);
  }

  private isDueSoon(inv: SubcontractorInvoice, days = 7): boolean {
    if (!inv.dueDate || inv.status === 'Paid' || inv.status === 'Void') return false;
    const due = new Date(`${inv.dueDate.slice(0, 10)}T23:59:59`);
    const now = new Date();
    const limit = new Date(now.getTime() + days * 86400000);
    return due.getTime() >= now.getTime() && due.getTime() <= limit.getTime();
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['view'] === 'invoices') {
        this.pageView.set('invoices');
      }
      if (params['q']) {
        this.pageView.set('invoices');
        this.invoiceSearch.set(String(params['q']));
      }
    });
  }

  openNew(): void {
    this.editingId.set(null);
    this.draft = { w9Status: 'Missing', insuranceStatus: 'Missing', status: 'PendingSetup', vendorClassification: 'NeedsReview' };
    this.drawerOpen.set(true);
  }

  selectSub(sub: Subcontractor): void {
    this.editingId.set(sub.id);
    this.draft = { ...sub };
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  async save(): Promise<void> {
    if (!this.draft.companyName?.trim()) return;
    await this.subSvc.saveSubcontractor(this.draft, this.editingId());
    this.closeDrawer();
  }

  async markApproved(): Promise<void> {
    const sub = this.subs()?.find(s => s.id === this.editingId());
    if (sub) await this.subSvc.markApproved(sub);
    this.closeDrawer();
  }

  async markInactive(): Promise<void> {
    const sub = this.subs()?.find(s => s.id === this.editingId());
    if (sub) await this.subSvc.markInactive(sub);
    this.closeDrawer();
  }

  async markDoNotUse(): Promise<void> {
    const sub = this.subs()?.find(s => s.id === this.editingId());
    if (sub) await this.subSvc.markDoNotUse(sub);
    this.closeDrawer();
  }

  async discoverSubs(): Promise<void> {
    this.importing.set(true);
    try {
      await this.subSeed.discoverFromSources(false);
    } finally {
      this.importing.set(false);
    }
  }

  exportDirectoryCsv(): void {
    const rows = this.filteredRows().map(({ sub }) => [
      sub.companyName,
      sub.trade ?? '',
      sub.contactName ?? '',
      sub.phone ?? '',
      sub.email ?? '',
      this.complianceLabel(sub),
      sub.status,
    ]);
    downloadCsv(
      'subcontractors-directory.csv',
      ['Company', 'Trade', 'Contact', 'Phone', 'Email', 'Compliance', 'Status'],
      rows,
    );
  }

  complianceTone(sub: Subcontractor): StatusTone {
    if (sub.w9Status === 'Missing' || sub.insuranceStatus === 'Missing' || sub.insuranceStatus === 'Expired'
        || isDocumentExpired(sub.coiExpirationDate)) return 'red';
    if (isCoiExpiringSoon(sub.coiExpirationDate)) return 'amber';
    if (sub.w9Status === 'OnFile' && sub.insuranceStatus === 'Valid') return 'green';
    return 'amber';
  }

  complianceLabel(sub: Subcontractor): string {
    const tone = this.complianceTone(sub);
    if (tone === 'green') return 'Compliant';
    if (tone === 'red') return 'Non-compliant';
    return 'Expiring';
  }

  complianceTooltip(sub: Subcontractor): string {
    const issues: string[] = [];
    if (sub.w9Status === 'Missing') issues.push('Missing W-9');
    if (sub.insuranceStatus === 'Missing') issues.push('Missing COI');
    if (sub.insuranceStatus === 'Expired' || isDocumentExpired(sub.coiExpirationDate)) issues.push('Expired COI');
    if (isCoiExpiringSoon(sub.coiExpirationDate)) issues.push('COI expiring soon');
    return issues.length ? issues.join(' · ') : 'All compliance items current';
  }

  subStatusTone(status: SubcontractorStatus): StatusTone {
    if (status === 'Approved') return 'green';
    if (status === 'DoNotUse' || status === 'MissingCompliance') return 'red';
    if (status === 'Inactive') return 'slate';
    return 'amber';
  }
}
