import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { QuickBooksSyncSheetsService } from '../services/quickbooks-sync-sheets.service';
import { TimeDataSheetSyncService } from '../services/time-data-sheet-sync.service';
import { DriveFolderSeedService } from '../services/drive-folder-seed.service';
import { BillingSovImportService } from '../services/billing-sov-import.service';
import { QbInvoicePacketImportService } from '../services/qb-invoice-packet-import.service';
import { LaborCodeMappingService } from '../services/labor-code-mapping.service';
import { DataService } from '../services/data.service';
import { SettingsLaborCodes } from './settings-labor-codes';
import { SettingsDriveFolders } from './settings-drive-folders';

@Component({
  selector: 'app-settings-import-center',
  standalone: true,
  imports: [CommonModule, RouterLink, SettingsLaborCodes, SettingsDriveFolders],
  template: `
    <section id="import-center" class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-900">Import Center</h2>
        <p class="text-sm text-slate-500 mt-1 max-w-3xl">
          Active imports only — use when a new file arrives. Each import previews differences, protects manual fields,
          and logs the source file and date.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        @for (action of actions; track action.id) {
          <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">{{ action.title }}</h3>
              <p class="text-xs text-slate-500 mt-1">{{ action.when }}</p>
            </div>
            <p class="text-sm text-slate-600 flex-1">{{ action.description }}</p>
            <button type="button" (click)="run(action.id)" [disabled]="running()"
                    class="self-start text-xs font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
              {{ action.buttonLabel }}
            </button>
          </article>
        }
      </div>

      @if (message()) {
        <p class="text-sm text-emerald-700">{{ message() }}</p>
      }
      @if (error()) {
        <p class="text-sm text-rose-700">{{ error() }}</p>
      }

      <details class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">Drive folder links</summary>
        <div class="px-2 pb-4">
          <app-settings-drive-folders />
        </div>
      </details>

      <details class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">Labor code mapping</summary>
        <div class="px-2 pb-4">
          <app-settings-labor-codes />
        </div>
      </details>

      <p class="text-xs text-slate-400">
        Pay app / invoice file upload UI lives on each project's Financials → Billing tab.
        <a routerLink="/projects" class="text-indigo-600 underline">Open Projects</a>
      </p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsImportCenterComponent {
  private qbSync = inject(QuickBooksSyncSheetsService);
  private timeSync = inject(TimeDataSheetSyncService);
  private driveSeed = inject(DriveFolderSeedService);
  private billingSov = inject(BillingSovImportService);
  private invoicePacket = inject(QbInvoicePacketImportService);
  private laborCodes = inject(LaborCodeMappingService);
  private data = inject(DataService);

  message = signal<string | null>(null);
  error = signal<string | null>(null);

  readonly actions = [
    {
      id: 'billing',
      title: 'Import new pay app / SOV',
      when: 'When a new G702/G703 or billing workbook arrives',
      description: 'Imports billing summary and SOV lines with review flags. Does not overwrite protected contract fields.',
      buttonLabel: 'Run billing/SOV import (seed)',
    },
    {
      id: 'invoice',
      title: 'Upload invoice packet',
      when: 'QuickBooks invoice PDF batch',
      description: 'Invoice-only imports for T&M and small jobs.',
      buttonLabel: 'Import invoice packet',
    },
    {
      id: 'qb',
      title: 'Refresh QuickBooks data',
      when: 'QBO workbook updated or AR needs refresh',
      description: 'Updates invoices, payments, AR, and project cost detail from the sync workbook.',
      buttonLabel: 'Refresh QBO',
    },
    {
      id: 'labor',
      title: 'Refresh Timekeeper labor',
      when: 'Master Time Sheet updated',
      description: 'Updates labor hours and labor actuals — not part of project setup.',
      buttonLabel: 'Refresh labor',
    },
    {
      id: 'drive',
      title: 'Check Drive folder links',
      when: 'New jobs or folder list update',
      description: 'Confirms Drive folder IDs on project records. Files stay in Google Drive.',
      buttonLabel: 'Sync Drive links',
    },
    {
      id: 'labor-codes',
      title: 'Discover labor codes',
      when: 'New codes appear on time sheet',
      description: 'Classify labor codes from the Master Time Sheet.',
      buttonLabel: 'Discover codes',
    },
  ];

  running(): boolean {
    return this.qbSync.syncing() || this.timeSync.syncing()
      || this.billingSov.running() || this.invoicePacket.running();
  }

  async run(id: string): Promise<void> {
    this.message.set(null);
    this.error.set(null);
    try {
      switch (id) {
        case 'qb':
          await this.qbSync.syncFromWorkbook(true);
          this.message.set(this.qbSync.lastMessage() ?? 'QuickBooks refreshed.');
          break;
        case 'labor':
          await this.timeSync.syncFromTimeDataSheet(true);
          this.message.set(this.timeSync.lastSyncMessage() ?? 'Labor refreshed.');
          break;
        case 'drive':
          await this.driveSeed.syncDriveFolderIds();
          this.message.set('Drive folder links checked.');
          break;
        case 'billing':
          await this.billingSov.importFromSeed();
          this.message.set(this.billingSov.lastMessage() ?? 'Billing/SOV import complete.');
          break;
        case 'invoice':
          await this.invoicePacket.importFromSeed(true);
          this.message.set(this.invoicePacket.lastMessage() ?? 'Invoice packet imported.');
          break;
        case 'labor-codes': {
          const rows = this.laborCodes.discoveryRowsFromEntries([], this.data.projectLaborActualsSnapshot());
          await this.laborCodes.discoverFromMasterTimeSheet(rows);
          this.message.set('Labor codes discovered from time sheet.');
          break;
        }
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed.');
    }
  }
}
