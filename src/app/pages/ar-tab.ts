import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Project } from '../models/types';
import { ARRecord, ArCollectionStatus } from '../models/financial.types';
import { DataService } from '../services/data.service';
import { ArService } from '../services/ar.service';
import { ArComputeService } from '../services/ar-compute.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { StatCardComponent } from '../components/ui/stat-card';
import { CompactStatStripComponent } from '../components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '../components/ui/segmented-control';
import {
  AR_PAGE_SEGMENT_OPTIONS,
  ArPageSegmentId,
  matchesArRecordSegment,
  normalizeArPageSegment,
} from '../utils/ar.compute';

@Component({
  selector: 'app-ar-tab',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule,
    StatCardComponent, CompactStatStripComponent, SegmentedControlComponent,
  ],
  template: `
    <div class="space-y-6">
      @if (jobRow(); as row) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <app-stat-card label="Open AR" [value]="fmt(row.totalOpen)" [trend]="row.totalOpen > 0 ? 'Collections' : undefined" [trendPositive]="row.totalOpen === 0" />
          <app-stat-card label="Past Due" [value]="fmt(pastDue())" [trend]="pastDue() > 0 ? 'Follow up' : undefined" [trendPositive]="false" />
          <app-stat-card label="30+ Days" [value]="fmt(days30Plus())" />
          <app-stat-card label="Closeout AR" [value]="fmt(row.isCloseout ? row.totalOpen : 0)" />
        </div>
        <app-compact-stat-strip [stats]="compactStats()" />
        @if (row.warningChips?.length) {
          <div class="flex flex-wrap gap-1.5">
            @for (chip of row.warningChips; track chip.label) {
              <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                    [class.bg-rose-100]="chip.tone === 'critical'"
                    [class.text-rose-800]="chip.tone === 'critical'"
                    [class.bg-amber-100]="chip.tone === 'amber'"
                    [class.text-amber-800]="chip.tone === 'amber'">{{ chip.label }}</span>
            }
          </div>
        }
        <div class="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-indigo-900">Next action: {{ row.nextAction }}</p>
          <span class="text-xs text-indigo-700">{{ row.sourceLabel }}</span>
        </div>
      } @else {
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-800">
          No open AR for this job.
        </div>
      }

      <app-segmented-control
        [options]="segmentOptions"
        [value]="activeSection()"
        (select)="activeSection.set(normalizeArPageSegment($event))" />

      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm min-w-[900px]">
            <thead>
              <tr class="text-[10px] uppercase text-slate-400 border-b bg-slate-50">
                <th class="px-5 py-3 text-left">Invoice / Pay App</th>
                <th class="px-5 py-3 text-left">Invoice date</th>
                <th class="px-5 py-3 text-left">Due</th>
                <th class="px-5 py-3 text-right">Original</th>
                <th class="px-5 py-3 text-right">Paid</th>
                <th class="px-5 py-3 text-right">Open</th>
                <th class="px-5 py-3 text-left">Aging</th>
                <th class="px-5 py-3 text-left">Collection</th>
                <th class="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (r of filteredRecords(); track r.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-5 py-3 font-medium">{{ r.invoiceNumber || '—' }}</td>
                  <td class="px-5 py-3">{{ r.invoiceDate || '—' }}</td>
                  <td class="px-5 py-3">{{ r.dueDate || '—' }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ r.originalAmount | currency }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ r.paidAmount ?? 0 | currency }}</td>
                  <td class="px-5 py-3 text-right font-mono">{{ r.openBalance | currency }}</td>
                  <td class="px-5 py-3">{{ r.agingBucket }}</td>
                  <td class="px-5 py-3 text-xs">{{ r.collectionStatus || 'NotStarted' }}</td>
                  <td class="px-5 py-3">
                    <div class="flex flex-wrap gap-1">
                      @if (r.status !== 'Paid') {
                        <button type="button" (click)="markPaid(r)" class="text-xs text-emerald-700 font-bold">Paid</button>
                        <button type="button" (click)="markDisputed(r)" class="text-xs text-red-600 font-bold">Dispute</button>
                      }
                      <button type="button" (click)="selectRecord(r)" class="text-xs text-blue-700 font-bold">Note</button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="9" class="px-5 py-12 text-center text-slate-400 italic">No AR records in this section.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (selected(); as rec) {
        <div class="fixed inset-0 z-40 bg-black/30" (click)="selected.set(null)"></div>
        <aside class="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-xl p-5 space-y-4 overflow-y-auto">
          <h3 class="text-lg font-bold">AR — {{ rec.invoiceNumber }}</h3>
          <textarea [(ngModel)]="noteDraft" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Collection note"></textarea>
          <div>
            <label class="text-xs font-bold uppercase text-slate-500">Next follow-up</label>
            <input type="date" [(ngModel)]="followUpDraft" class="w-full border rounded-lg px-3 py-2 text-sm mt-1">
          </div>
          <div>
            <label class="text-xs font-bold uppercase text-slate-500">Collection status</label>
            <select [(ngModel)]="collectionDraft" class="w-full border rounded-lg px-3 py-2 text-sm mt-1">
              @for (s of collectionStatuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="flex gap-2">
            <button type="button" (click)="saveNote(rec)" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save</button>
            <button type="button" (click)="openBilling()" class="px-4 py-2 rounded-lg border text-sm font-semibold">Open billing</button>
          </div>
        </aside>
      }
    </div>
  `,
})
export class ArTabComponent {
  @Input({ required: true }) project!: Project;

  private data = inject(DataService);
  private arSvc = inject(ArService);
  private arCompute = inject(ArComputeService);
  private router = inject(Router);

  arRecords = toSignal(this.data.getArRecords(), { initialValue: [] });
  activeSection = signal<ArPageSegmentId>('open');
  selected = signal<ARRecord | null>(null);
  noteDraft = '';
  followUpDraft = '';
  collectionDraft: ArCollectionStatus = 'NotStarted';

  readonly segmentOptions = AR_PAGE_SEGMENT_OPTIONS;
  readonly normalizeArPageSegment = normalizeArPageSegment;

  readonly collectionStatuses: ArCollectionStatus[] = [
    'NotStarted', 'FollowUpNeeded', 'Contacted', 'PromiseToPay', 'Disputed', 'Escalated', 'Closed',
  ];

  ctx = computed(() => this.arCompute.buildContext());
  jobRow = computed(() => this.arCompute.jobRowForProject(this.project.id, this.ctx()));

  pastDue = computed(() => {
    const row = this.jobRow();
    if (!row) return 0;
    return row.days1To30 + row.days31To60 + row.days61To90 + row.days90Plus;
  });

  days30Plus = computed(() => {
    const row = this.jobRow();
    if (!row) return 0;
    return row.days31To60 + row.days61To90 + row.days90Plus;
  });

  compactStats = computed(() => {
    const row = this.jobRow();
    if (!row) return [];
    return [
      { label: 'Current', value: this.fmt(row.current) },
      { label: '1–30', value: this.fmt(row.days1To30), alert: row.days1To30 > 0 },
      { label: '31–60', value: this.fmt(row.days31To60), alert: row.days31To60 > 0 },
      { label: '61–90', value: this.fmt(row.days61To90), alert: row.days61To90 > 0 },
      { label: '90+', value: this.fmt(row.days90Plus), alert: row.days90Plus > 0 },
    ];
  });

  filteredRecords = computed(() => {
    const recs = (this.arRecords() || []).filter(r => r.projectId === this.project.id);
    const section = this.activeSection();
    const isCloseout = this.jobRow()?.isCloseout ?? false;
    return recs.filter(r => matchesArRecordSegment(r, section, isCloseout));
  });

  fmt(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
  }

  async syncFromPayApps(): Promise<void> {
    const bills = this.data.billingsSnapshot().filter(b => b.projectId === this.project.id);
    for (const b of bills) {
      await this.arSvc.upsertFromPayApp(b, this.project);
    }
    await this.arSvc.refreshArAutomation();
  }

  async markPaid(r: ARRecord): Promise<void> {
    await this.arSvc.markPaid(r);
  }

  async markDisputed(r: ARRecord): Promise<void> {
    await this.arSvc.markDisputed(r);
  }

  selectRecord(r: ARRecord): void {
    this.selected.set(r);
    this.noteDraft = '';
    this.followUpDraft = r.nextFollowUpDate ?? '';
    this.collectionDraft = r.collectionStatus ?? 'NotStarted';
  }

  async saveNote(r: ARRecord): Promise<void> {
    if (this.noteDraft.trim()) await this.arSvc.addNote(r, this.noteDraft.trim());
    if (this.followUpDraft) await this.arSvc.setFollowUpDate(r, this.followUpDraft);
    if (this.collectionDraft) await this.arSvc.setCollectionStatus(r, this.collectionDraft);
    this.selected.set(null);
  }

  openBilling(): void {
    void this.router.navigate(['/projects', this.project.id], {
      queryParams: { section: 'financials', view: 'billing' },
    });
  }
}
