import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeedService } from '@core/services/seed.service';
import { MasterSheetSyncService } from '@core/services/master-sheet-sync.service';
import { PoSheetSyncService } from '@core/services/po-sheet-sync.service';
import { ProjectDedupeService } from '@core/services/project-dedupe.service';
import { TimeDataSheetSyncService } from '@core/services/time-data-sheet-sync.service';
import { QboSyncService } from '@core/services/qbo-sync.service';
import { ProjectCostsService } from '@features/projects/services/project-costs.service';
import { ProjectDataService } from '@features/projects/services/project-data.service';
import { WipSetupImportService } from '@features/financials/services/wip-setup-import.service';
import { BillingSovImportService } from '@features/financials/services/billing-sov-import.service';
import { ArAgingImportService } from '@features/financials/services/ar-aging-import.service';
import { WipForecastImportService } from '@features/financials/services/wip-forecast-import.service';
import { DriveFolderSeedService } from '@features/subcontractors/services/drive-folder-seed.service';
import { ImportSeedService } from '@core/services/import-seed.service';
import { DriveWebhooksService } from '@core/services/drive-webhooks.service';
import { GlobalNeedsService } from '@core/services/global-needs.service';
import { apiConfig } from '@app/config/api.config';
import { setWorkCompAuditEnabled } from '@app/config/feature-setup.config';
import { environment } from '@app/config/environment';
import { SettingsFeatureSetupComponent } from './settings-feature-setup';

@Component({
  selector: 'app-settings-advanced-tools',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsFeatureSetupComponent],
  template: `
    <section id="advanced" class="space-y-6">
      <div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <h2 class="text-lg font-bold text-amber-950">Advanced / one-time tools</h2>
        <p class="text-sm text-amber-900/90 mt-1">
          Do not run during normal daily use unless directed. Baseline imports are archived here — run only if resetting or recovering data.
        </p>
      </div>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-900">Archived baseline imports</h3>
        <p class="text-xs text-slate-500">Already applied for initial job setup. Re-run only if directed or resetting data.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="runWipSetup()" [disabled]="wipSetup.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            {{ wipSetup.running() ? 'Applying…' : 'Import WIP Setup Baseline' }}
          </button>
          <button type="button" (click)="runBillingSov()" [disabled]="billingSov.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            {{ billingSov.running() ? 'Importing…' : 'Import Billing/SOV Baseline' }}
          </button>
          <button type="button" (click)="runDriveSeed()" [disabled]="busy()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            Import Drive Folder Seed
          </button>
          <button type="button" (click)="runWipForecast()" [disabled]="wipForecast.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            Rebuild Forecast Seed
          </button>
          <button type="button" (click)="runArAging()" [disabled]="arAging.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            Import AR Aging Baseline
          </button>
          <button type="button" (click)="runFullImport()" [disabled]="importSeed.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            Re-run all source imports
          </button>
        </div>
        @if (baselineMessage()) {
          <p class="text-sm text-emerald-700">{{ baselineMessage() }}</p>
        }
      </article>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-900">Manual sheet sync</h3>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="syncMaster()" [disabled]="masterSync.syncing()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Sync Master Sheet</button>
          <button type="button" (click)="syncPo()" [disabled]="poSync.syncing()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Sync PO Sheet</button>
          <button type="button" (click)="syncTime()" [disabled]="timeSync.syncing()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Sync Master Time Sheet</button>
        </div>
      </article>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-900">Webhook integration</h3>
        <p class="text-xs text-slate-500">
          Must match <code class="font-mono">DRIVE_WEBHOOK_CHANNEL_TOKEN</code> on the Cloud Run API.
          Used when registering the QB export spreadsheet Drive watch.
        </p>
        <label class="block text-xs font-semibold text-slate-700">Drive Webhook Token</label>
        <input type="password" [(ngModel)]="driveWebhookToken" placeholder="Same secret as API env var"
               class="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-mono" />
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="saveDriveWebhookToken()"
                  class="text-xs font-semibold bg-slate-900 text-white px-3 py-2 rounded-lg">Save token</button>
          <button type="button" (click)="registerDriveWatch()" [disabled]="driveWatchBusy()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">
            {{ driveWatchBusy() ? 'Registering…' : 'Register QB spreadsheet watch' }}
          </button>
        </div>
        @if (webhookMessage()) {
          <p class="text-sm text-emerald-700">{{ webhookMessage() }}</p>
        }
      </article>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-900">Optional financial workbook</h3>
        <input type="text" [(ngModel)]="workbookId" placeholder="Google Sheet ID (optional)"
               class="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-mono" />
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="saveWorkbook()" class="text-xs font-semibold bg-slate-900 text-white px-3 py-2 rounded-lg">Save</button>
          <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Refresh</button>
        </div>
      </article>

      <article class="bg-white rounded-xl border border-rose-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-rose-950">Developer tools</h3>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="loadDemo()" [disabled]="seedService.seeding()"
                  class="text-xs font-semibold bg-orange-500 text-white px-3 py-2 rounded-lg disabled:opacity-50">Load demo data</button>
          <button type="button" (click)="dedupe()" [disabled]="dedupeService.running()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Remove duplicate projects</button>
          <button type="button" (click)="syncLegacyQbo()" [disabled]="qboSync.syncing()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Legacy QBO reports</button>
          <button type="button" (click)="syncCosts()" [disabled]="projectCosts.syncing()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Project costs detail</button>
        </div>
        @if (devMessage()) {
          <p class="text-sm" [class.text-emerald-700]="devOk()" [class.text-rose-700]="!devOk()">{{ devMessage() }}</p>
        }
      </article>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <app-settings-feature-setup />
      </article>

      <article class="bg-white rounded-xl border border-rose-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-rose-950">Danger zone</h3>
        <p class="text-xs text-slate-500">These actions affect local preferences and cached data only — not Firestore project records.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="confirmClearCache()"
                  class="text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors">
            Clear All Cache
          </button>
          <button type="button" (click)="confirmResetDefaults()"
                  class="text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors">
            Reset to defaults
          </button>
        </div>
        @if (dangerMessage()) {
          <p class="text-sm text-emerald-700">{{ dangerMessage() }}</p>
        }
      </article>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsAdvancedToolsComponent {
  wipSetup = inject(WipSetupImportService);
  billingSov = inject(BillingSovImportService);
  wipForecast = inject(WipForecastImportService);
  arAging = inject(ArAgingImportService);
  driveSeed = inject(DriveFolderSeedService);
  importSeed = inject(ImportSeedService);
  masterSync = inject(MasterSheetSyncService);
  poSync = inject(PoSheetSyncService);
  timeSync = inject(TimeDataSheetSyncService);
  qboSync = inject(QboSyncService);
  projectCosts = inject(ProjectCostsService);
  projectData = inject(ProjectDataService);
  seedService = inject(SeedService);
  dedupeService = inject(ProjectDedupeService);
  driveWebhooks = inject(DriveWebhooksService);
  private globalNeeds = inject(GlobalNeedsService);

  workbookId = environment.optionalFinancialWorkbookId;
  driveWebhookToken = this.driveWebhooks.getChannelToken();
  baselineMessage = signal<string | null>(null);
  devMessage = signal<string | null>(null);
  devOk = signal(true);
  webhookMessage = signal<string | null>(null);
  dangerMessage = signal<string | null>(null);
  driveWatchBusy = signal(false);

  busy(): boolean {
    return this.wipSetup.running() || this.billingSov.running() || this.importSeed.running();
  }

  async runWipSetup(): Promise<void> {
    await this.wipSetup.importFromSeed();
    this.baselineMessage.set(this.wipSetup.lastMessage());
  }

  async runBillingSov(): Promise<void> {
    await this.billingSov.importFromSeed();
    this.baselineMessage.set(this.billingSov.lastMessage());
  }

  async runDriveSeed(): Promise<void> {
    await this.driveSeed.syncDriveFolderIds();
    this.baselineMessage.set('Drive folder seed applied.');
  }

  async runWipForecast(): Promise<void> {
    await this.wipForecast.importFromSeed();
    this.baselineMessage.set(this.wipForecast.lastMessage());
  }

  async runArAging(): Promise<void> {
    await this.arAging.importFromSeed();
    this.baselineMessage.set(this.arAging.lastMessage());
  }

  async runFullImport(): Promise<void> {
    await this.importSeed.runFullImport();
    this.baselineMessage.set(this.importSeed.lastMessage());
  }

  async syncMaster(): Promise<void> { await this.masterSync.syncFromMasterSheet(true); }
  async syncPo(): Promise<void> { await this.poSync.syncFromPoSheet(true); }
  async syncTime(): Promise<void> { await this.timeSync.syncFromTimeDataSheet(true); }

  saveWorkbook(): void {
    this.projectData.configureOptionalFinancialWorkbookId(this.workbookId.trim());
    this.devMessage.set('Workbook ID saved.');
    this.devOk.set(true);
  }

  async refreshWorkbook(): Promise<void> {
    await this.projectData.refreshOptionalWorkbook();
    this.devMessage.set(this.projectData.workbookError() ?? 'Workbook refreshed.');
    this.devOk.set(!this.projectData.workbookError());
  }

  async loadDemo(): Promise<void> {
    await this.seedService.seedDemoData();
    this.devMessage.set(this.seedService.seedMessage());
    this.devOk.set(true);
  }

  async dedupe(): Promise<void> {
    await this.dedupeService.dedupeProjects();
    this.devMessage.set(this.dedupeService.lastMessage());
    this.devOk.set(true);
  }

  async syncLegacyQbo(): Promise<void> { await this.qboSync.syncFromQboReports(); }
  async syncCosts(): Promise<void> { await this.projectCosts.syncFromProjectCosts(); }

  saveDriveWebhookToken(): void {
    this.driveWebhooks.setChannelToken(this.driveWebhookToken);
    this.webhookMessage.set('Drive webhook token saved locally.');
  }

  async registerDriveWatch(): Promise<void> {
    this.driveWatchBusy.set(true);
    this.webhookMessage.set(null);
    try {
      this.driveWebhooks.setChannelToken(this.driveWebhookToken);
      await this.driveWebhooks.registerQBSpreadsheetWatch(true);
      this.webhookMessage.set('QB spreadsheet Drive watch registered (check Firestore drive-watch-channels).');
    } catch (err) {
      this.webhookMessage.set(err instanceof Error ? err.message : 'Drive watch registration failed');
    } finally {
      this.driveWatchBusy.set(false);
    }
  }

  confirmClearCache(): void {
    if (!confirm('Clear all cached data in localStorage and sessionStorage? The page will reload.')) {
      return;
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }
    location.reload();
  }

  confirmResetDefaults(): void {
    if (!confirm('Reset all app settings to defaults? Local preferences will be cleared but Firestore data is unchanged.')) {
      return;
    }
    this.resetSettingsToDefaults();
    this.dangerMessage.set('Settings reset to defaults. Reload the page if navigation looks stale.');
  }

  private resetSettingsToDefaults(): void {
    this.globalNeeds.setShowAllTools(true);
    this.globalNeeds.resetPinnedTools();
    setWorkCompAuditEnabled(false);
    apiConfig.setBaseUrl('');
    apiConfig.setUseApiBackend(true);
    this.driveWebhooks.setChannelToken('');
    this.driveWebhookToken = '';
    environment.setOptionalFinancialWorkbookId('');
    this.workbookId = '';
  }
}
