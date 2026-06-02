import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeedService } from '../services/seed.service';
import { MasterSheetSyncService } from '../services/master-sheet-sync.service';
import { PoSheetSyncService } from '../services/po-sheet-sync.service';
import { ProjectDedupeService } from '../services/project-dedupe.service';
import { TimeDataSheetSyncService } from '../services/time-data-sheet-sync.service';
import { QboSyncService } from '../services/qbo-sync.service';
import { ProjectCostsService } from '../services/project-costs.service';
import { ProjectDataService } from '../services/project-data.service';
import { WipSetupImportService } from '../services/wip-setup-import.service';
import { BillingSovImportService } from '../services/billing-sov-import.service';
import { ArAgingImportService } from '../services/ar-aging-import.service';
import { WipForecastImportService } from '../services/wip-forecast-import.service';
import { DriveFolderSeedService } from '../services/drive-folder-seed.service';
import { ImportSeedService } from '../services/import-seed.service';
import { environment } from '../config/environment';
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
          Do not run during normal daily use unless directed. 2026 baseline imports are archived here after verification.
        </p>
      </div>

      <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
        <h3 class="text-sm font-bold text-slate-900">Archived 2026 baseline imports</h3>
        <p class="text-xs text-slate-500">Already applied for initial 2026 job setup. Re-run only if directed.</p>
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="runWipSetup()" [disabled]="wipSetup.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            {{ wipSetup.running() ? 'Applying…' : 'Import 2026 WIP Setup Baseline' }}
          </button>
          <button type="button" (click)="runBillingSov()" [disabled]="billingSov.running()"
                  class="text-xs font-semibold border border-slate-300 px-3 py-2 rounded-lg disabled:opacity-50">
            {{ billingSov.running() ? 'Importing…' : 'Import May 2026 Billing/SOV Baseline' }}
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
        <h3 class="text-sm font-bold text-slate-900">Optional financial workbook</h3>
        <input type="text" [(ngModel)]="workbookId" placeholder="Google Sheet ID (optional)"
               class="w-full px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-mono" />
        <div class="flex flex-wrap gap-2">
          <button type="button" (click)="saveWorkbook()" class="text-xs font-semibold bg-blue-600 text-white px-3 py-2 rounded-lg">Save</button>
          <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading()"
                  class="text-xs font-semibold border px-3 py-2 rounded-lg disabled:opacity-50">Refresh</button>
        </div>
      </article>

      <article class="bg-white rounded-xl border border-rose-200 bg-rose-50/30 p-5 space-y-3">
        <h3 class="text-sm font-bold text-rose-950">Developer / dangerous</h3>
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

      <details class="bg-white rounded-xl border border-slate-200 shadow-sm">
        <summary class="px-5 py-4 cursor-pointer text-sm font-bold text-slate-900">Feature rollout matrix</summary>
        <div class="px-2 pb-4">
          <app-settings-feature-setup />
        </div>
      </details>
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

  workbookId = environment.optionalFinancialWorkbookId;
  baselineMessage = signal<string | null>(null);
  devMessage = signal<string | null>(null);
  devOk = signal(true);

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
}
