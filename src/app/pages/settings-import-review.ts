import { Component, computed, inject, signal, input } from '@angular/core';

import { CommonModule } from '@angular/common';

import { ImportReviewService } from '../services/import-review.service';

import { ImportSeedService } from '../services/import-seed.service';

import { QuickBooksSyncDataService } from '../services/quickbooks-sync-data.service';

import { QuickBooksSyncSheetsService } from '../services/quickbooks-sync-sheets.service';

import { QbInvoicePacketImportService } from '../services/qb-invoice-packet-import.service';
import { WipForecastImportService } from '../services/wip-forecast-import.service';
import { WipSetupImportService } from '../services/wip-setup-import.service';
import { ArAgingImportService } from '../services/ar-aging-import.service';
import { BillingSovImportService } from '../services/billing-sov-import.service';

import { ImportException } from '../models/import.types';

import { QB_DETAIL_COST_WARNING } from '../config/qb-project-mgmt-sync.config';



@Component({

  selector: 'app-settings-import-review',

  standalone: true,

  imports: [CommonModule],

  template: `

    <section id="import-review" class="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mb-6" [class.p-4]="compactMode()" [class.rounded-xl]="compactMode()" [class.mb-0]="compactMode()">
      <span id="source-review" class="sr-only"></span>

      @if (!compactMode()) {
      <div class="flex flex-wrap items-start justify-between gap-4 mb-4">

        <div>

          <h2 class="text-xl font-bold mb-2">Source Review</h2>

          <p class="text-sm text-slate-500 font-medium">

            Review unresolved issues grouped by source: Master Time Sheet, QuickBooks Sync Workbook,
            budget workbooks, Google Drive, PO Sheet, and manual conflicts.

          </p>

        </div>

        <div class="flex flex-wrap gap-2">

          <button type="button" (click)="runQbSync()" [disabled]="qbSync.syncing()"

                  class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ qbSync.syncing() ? 'Syncing…' : 'Re-sync QuickBooks workbook' }}

          </button>

          <button type="button" (click)="runAll()" [disabled]="importSeed.running()"

                  class="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ importSeed.running() ? 'Syncing…' : 'Re-run all source imports' }}

          </button>

          <button type="button" (click)="runInvoicePacket()" [disabled]="invoicePacket.running()"

                  class="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ invoicePacket.running() ? 'Importing…' : 'Import QB invoice PDF packet' }}

          </button>

          <button type="button" (click)="runWipForecast()" [disabled]="wipForecast.running()"

                  class="bg-violet-600 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ wipForecast.running() ? 'Importing…' : 'Import WIP forecast workbook' }}

          </button>

          <button type="button" (click)="runWipSetup()" [disabled]="wipSetup.running()"

                  class="bg-teal-700 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ wipSetup.running() ? 'Applying…' : 'Apply WIP setup fields (June 2026)' }}

          </button>

          <button type="button" (click)="runArAging()" [disabled]="arAging.running()"

                  class="bg-sky-700 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ arAging.running() ? 'Importing…' : 'Import AR aging (Jun 2, 2026)' }}

          </button>

          <button type="button" (click)="runBillingSov()" [disabled]="billingSov.running()"

                  class="bg-fuchsia-700 text-white px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50">

            {{ billingSov.running() ? 'Importing…' : 'Import Billing/SOV (May–Jun 2026)' }}

          </button>

          <button type="button" (click)="review.exportExceptionsCsv()"

                  class="bg-white border border-slate-300 px-4 py-2 rounded-md text-sm font-semibold">

            Export exceptions CSV

          </button>

        </div>

      </div>
      }

      @if (!compactMode() && qbSync.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ qbSync.lastMessage() }}</p>

      }

      @if (!compactMode() && qbSync.lastSyncError()) {

        <p class="text-sm text-red-600 mb-2">{{ qbSync.lastSyncError() }}</p>

      }



      @if (!compactMode() && invoicePacket.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ invoicePacket.lastMessage() }}</p>

      }

      @if (!compactMode() && wipForecast.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ wipForecast.lastMessage() }}</p>

      }

      @if (!compactMode() && wipSetup.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ wipSetup.lastMessage() }}</p>

      }

      @if (!compactMode() && arAging.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ arAging.lastMessage() }}</p>

      }

      @if (!compactMode() && billingSov.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-2">{{ billingSov.lastMessage() }}</p>

      }



      @if (!compactMode() && importSeed.lastMessage()) {

        <p class="text-sm text-emerald-700 mb-4">{{ importSeed.lastMessage() }}</p>

      }



      @if (!compactMode() && (importSeed.sourceWarnings().length || qbSyncWarnings().length)) {

        <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">

          @for (w of importSeed.sourceWarnings(); track w) {

            <div>{{ w }}</div>

          }

          @for (w of qbSyncWarnings(); track w) {

            <div>{{ w }}</div>

          }

        </div>

      }



      @if (!compactMode()) {
      <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 mb-6">

        <h3 class="text-sm font-bold text-slate-700 mb-2">QuickBooks Project Mgmt Sync</h3>

        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">

          <div>

            <p class="text-[10px] uppercase text-slate-500 font-bold">Last sync</p>

            <p>{{ qbSyncData.lastRun()?.completedAt ? (qbSyncData.lastRun()!.completedAt | date:'short') : 'Never' }}</p>

          </div>

          <div>

            <p class="text-[10px] uppercase text-slate-500 font-bold">Tabs read</p>

            <p>{{ qbTabsReadCount() }}</p>

          </div>

          <div>

            <p class="text-[10px] uppercase text-slate-500 font-bold">Rows imported</p>

            <p>{{ qbSyncData.lastRun()?.rowsImported ?? 0 }}</p>

          </div>

          <div>

            <p class="text-[10px] uppercase text-slate-500 font-bold">Missing tabs</p>

            <p>{{ qbTabsMissingCount() }}</p>

          </div>

          <div>

            <p class="text-[10px] uppercase text-slate-500 font-bold">Warnings</p>

            <p>{{ qbWarningCount() }}</p>

          </div>

        </div>

        @if (!qbSyncData.hasDetailCostTab()) {
          <p class="text-xs text-amber-800 mt-3">{{ detailCostWarning }}</p>
        } @else {
          <p class="text-xs text-emerald-800 mt-3">
            Detail cost tab found: {{ qbSyncData.detailCostTabName() }}
            · {{ qbSyncData.detailCostTransactions().length }} transaction(s) imported
          </p>
        }

        <div class="flex flex-wrap gap-2 mt-3">

          <button type="button" (click)="activeSection.set('qb')" class="text-xs font-semibold text-blue-600">View QB exceptions</button>

          <button type="button" (click)="showUnmatchedProjects.set(true)" class="text-xs font-semibold text-blue-600">View unmatched projects</button>

        </div>

      </div>
      }



      <div class="flex flex-wrap gap-2 mb-4">

        @for (section of sections; track section.id) {

          <button type="button" (click)="activeSection.set(section.id)"

                  class="px-3 py-1.5 rounded-lg border text-xs font-semibold"

                  [class.bg-slate-900]="activeSection() === section.id"

                  [class.text-white]="activeSection() === section.id">

            {{ section.label }}

          </button>

        }

      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">

        <div class="bg-slate-50 p-4 rounded-xl border">

          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">Unresolved</p>

          <p class="text-xl font-bold">{{ review.unresolvedCount() }}</p>

        </div>

        <div class="bg-slate-50 p-4 rounded-xl border">

          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">Import runs</p>

          <p class="text-xl font-bold">{{ review.runs().length }}</p>

        </div>

        <div class="bg-slate-50 p-4 rounded-xl border">

          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">QB invoice lines</p>

          <p class="text-xl font-bold">{{ qbSyncData.invoiceLines().length }}</p>

        </div>

        <div class="bg-slate-50 p-4 rounded-xl border">

          <p class="text-[10px] font-bold uppercase text-slate-500 mb-1">QB AR jobs</p>

          <p class="text-xl font-bold">{{ qbSyncData.arAging().length }}</p>

        </div>

      </div>



      <h3 class="text-sm font-bold text-slate-700 mb-2">Recent import runs</h3>

      <div class="overflow-x-auto rounded-xl border border-slate-200 mb-6">

        <table class="w-full text-sm min-w-[700px]">

          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold">

            <tr>

              <th class="px-4 py-2 text-left">Run</th>

              <th class="px-4 py-2 text-left">When</th>

              <th class="px-4 py-2 text-right">Updated</th>

              <th class="px-4 py-2 text-right">Exceptions</th>

              <th class="px-4 py-2 text-left">Message</th>

            </tr>

          </thead>

          <tbody class="divide-y divide-slate-100">

            @for (run of review.runs(); track run.id) {

              <tr>

                <td class="px-4 py-2 font-medium">{{ run.label }}</td>

                <td class="px-4 py-2">{{ run.importedAt | date:'short' }}</td>

                <td class="px-4 py-2 text-right">{{ run.updated || run.created }}</td>

                <td class="px-4 py-2 text-right">{{ run.exceptions }}</td>

                <td class="px-4 py-2 text-slate-600">{{ run.message || '—' }}</td>

              </tr>

            } @empty {

              <tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic">No import runs logged yet.</td></tr>

            }

          </tbody>

        </table>

      </div>



      <h3 class="text-sm font-bold text-slate-700 mb-2">Exceptions</h3>

      <div class="overflow-x-auto rounded-xl border border-slate-200">

        <table class="w-full text-sm min-w-[900px]">

          <thead class="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold">

            <tr>

              <th class="px-4 py-2 text-left">Type</th>

              <th class="px-4 py-2 text-left">Job</th>

              <th class="px-4 py-2 text-left">Message</th>

              <th class="px-4 py-2 text-left">Status</th>

              <th class="px-4 py-2 text-left">Actions</th>

            </tr>

          </thead>

          <tbody class="divide-y divide-slate-100">

            @for (ex of filteredExceptions(); track ex.id) {

              <tr>

                <td class="px-4 py-2">{{ ex.type }}</td>

                <td class="px-4 py-2">{{ ex.jobNumber ? 'J' + ex.jobNumber : '—' }}</td>

                <td class="px-4 py-2 text-slate-600">{{ ex.message }}</td>

                <td class="px-4 py-2">

                  <span class="px-2 py-0.5 rounded-full text-xs font-semibold"

                        [class.bg-amber-100]="ex.status === 'NeedsReview'"

                        [class.text-amber-800]="ex.status === 'NeedsReview'"

                        [class.bg-emerald-100]="ex.status === 'Matched' || ex.status === 'Ignored'"

                        [class.text-emerald-800]="ex.status === 'Matched' || ex.status === 'Ignored'">

                    {{ ex.status }}

                  </span>

                </td>

                <td class="px-4 py-2">

                  @if (ex.status === 'NeedsReview' || ex.status === 'Imported') {

                    <button type="button" (click)="review.resolveException(ex.id)" class="text-xs text-blue-600 font-semibold mr-2">Resolve</button>

                    <button type="button" (click)="review.ignoreException(ex.id)" class="text-xs text-slate-500 font-semibold">Ignore</button>

                  }

                </td>

              </tr>

            } @empty {

              <tr><td colspan="5" class="px-4 py-8 text-center text-slate-400 italic">No import exceptions.</td></tr>

            }

          </tbody>

        </table>

      </div>

    </section>

  `,

})

export class SettingsImportReview {

  compactMode = input(false);

  review = inject(ImportReviewService);

  importSeed = inject(ImportSeedService);

  qbSync = inject(QuickBooksSyncSheetsService);

  qbSyncData = inject(QuickBooksSyncDataService);

  invoicePacket = inject(QbInvoicePacketImportService);

  wipForecast = inject(WipForecastImportService);

  wipSetup = inject(WipSetupImportService);
  arAging = inject(ArAgingImportService);
  billingSov = inject(BillingSovImportService);

  activeSection = signal<string>('all');

  showUnmatchedProjects = signal(false);

  readonly detailCostWarning = QB_DETAIL_COST_WARNING;



  readonly sections = [

    { id: 'all', label: 'All' },

    { id: 'master-time', label: 'Master Time Sheet' },

    { id: 'qb', label: 'QuickBooks Sync Workbook' },

    { id: 'po', label: 'PO Sheet' },

    { id: 'budget', label: 'Budget Workbooks (later)' },

    { id: 'billing', label: 'Billing / SOV' },

    { id: 'subs', label: 'Subcontractors' },

    { id: 'costs', label: 'Project Costs' },

    { id: 'drive', label: 'Google Drive' },

    { id: 'manual', label: 'Manual Conflicts' },

  ];



  qbSyncWarnings = computed(() => this.qbSyncData.lastRun()?.warnings ?? []);
  qbTabsReadCount = computed(() => this.qbSyncData.lastRun()?.tabsRead?.length ?? 0);
  qbTabsMissingCount = computed(() => this.qbSyncData.lastRun()?.tabsMissing?.length ?? 0);
  qbWarningCount = computed(() => this.qbSyncData.lastRun()?.warnings?.length ?? 0);



  filteredExceptions(): ImportException[] {

    const section = this.activeSection();

    const list = this.review.exceptions();

    if (section === 'all') return list;

    if (section === 'master-time') {
      return list.filter(e => e.source === 'TimeDataSheet' || e.source === 'MasterSheet'
        || e.type === 'unmappedLaborCode' || e.type === 'unassignedLaborCode'
        || e.type === 'laborDoubleCountRisk');
    }

    if (section === 'qb') {

      return list.filter(e => e.source === 'QuickBooksSync'

        || e.type === 'laborDoubleCountRisk' || e.type === 'retainageReview'
        || e.type === 'qbCostCategoryUnknown' || e.type === 'possibleDuplicateQbCost'
        || e.type === 'duplicateInvoiceNumber'
        || (this.showUnmatchedProjects() && e.type === 'unmatchedProject'));

    }

    if (section === 'budget') return list.filter(e => e.source === 'BudgetWorkbook' || e.type.includes('budget') || e.type.includes('coSheet'));

    if (section === 'billing') return list.filter(e => e.source === 'BillingSovWorkbook' || e.type === 'billingSovReview' || e.type === 'payAppContractMismatch');

    if (section === 'po') return list.filter(e => e.source === 'PoSheet' || e.message?.toLowerCase().includes('purchase order'));

    if (section === 'subs') return list.filter(e => e.source === 'QuickBooksSync' || e.source === 'QuickBooksSeed'
      || e.type.includes('Subcontractor') || e.type.includes('vendor') || e.type === 'unmatchedVendor');

    if (section === 'costs') return list.filter(e => e.source === 'QuickBooksProjectCostDetail' || e.type.includes('cost') || e.type.includes('Cost'));

    if (section === 'drive') return list.filter(e => e.source === 'DriveAudit' || e.source === 'DriveSeed' || e.source === 'DriveDiscovery' || e.type.includes('Drive') || e.type === 'duplicateDriveFolder');

    if (section === 'manual') return list.filter(e => e.type === 'importFieldConflict' || e.type === 'manualValueConflict' || e.type === 'manualBudgetDiffers' || e.type === 'jobNumberConflict');

    return list;

  }



  async runAll(): Promise<void> {

    await this.importSeed.runFullImport();

  }



  async runQbSync(): Promise<void> {

    await this.qbSync.syncFromWorkbook(true);

  }

  async runInvoicePacket(): Promise<void> {

    await this.invoicePacket.importFromSeed(true);

  }

  async runWipForecast(): Promise<void> {

    await this.wipForecast.importFromSeed();

  }

  async runWipSetup(): Promise<void> {

    await this.wipSetup.importFromSeed();

  }

  async runArAging(): Promise<void> {

    await this.arAging.importFromSeed();

  }

  async runBillingSov(): Promise<void> {

    await this.billingSov.importFromSeed();

  }

}


