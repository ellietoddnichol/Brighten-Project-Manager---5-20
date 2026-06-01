import { Component, inject, effect } from '@angular/core';
import { AuthService } from './services/auth.service';
import { AppShellComponent } from './components/layout/app-shell';
import { MasterSheetSyncService } from './services/master-sheet-sync.service';
import { PoSheetSyncService } from './services/po-sheet-sync.service';
import { TimeDataSheetSyncService } from './services/time-data-sheet-sync.service';
import { ProjectDedupeService } from './services/project-dedupe.service';
import { ProjectDataService } from './services/project-data.service';
import { DataService } from './services/data.service';
import { SubcontractorSeedService } from './services/subcontractor-seed.service';
import { QuickBooksSyncSheetsService } from './services/quickbooks-sync-sheets.service';
import { LaborDataService } from './services/labor-data.service';
import { CertifiedPayrollService } from './services/certified-payroll.service';

@Component({
  selector: 'app-root',
  imports: [AppShellComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  today = new Date();

  authService = inject(AuthService);
  private masterSheetSync = inject(MasterSheetSyncService);
  private poSheetSync = inject(PoSheetSyncService);
  private timeDataSheetSync = inject(TimeDataSheetSyncService);
  private projectDedupe = inject(ProjectDedupeService);
  private projectData = inject(ProjectDataService);
  private dataService = inject(DataService);
  private subcontractorDiscovery = inject(SubcontractorSeedService);
  private qbSync = inject(QuickBooksSyncSheetsService);
  private laborData = inject(LaborDataService);
  private certifiedPayroll = inject(CertifiedPayrollService);
  private startupCleanupDone = false;
  user = this.authService.user;
  authLoaded = this.authService.authLoaded;

  constructor() {
    effect(() => {
      if (this.authService.user()) {
        if (!this.startupCleanupDone) {
          this.startupCleanupDone = true;
          void this.projectData.initialize().finally(() => {
            this.projectData.startAutoRefresh();
          });
          void this.dataService.waitForProjectsLoaded().then(async () => {
            await this.projectDedupe.dedupeProjects();
            try {
              await this.subcontractorDiscovery.importIfNeeded();
            } catch (err) {
              console.warn('Subcontractor source cache skipped:', err);
            }
            void this.laborData.initialize();
            void this.certifiedPayroll.initialize();
          }).finally(() => {
            this.masterSheetSync.startAutoSync();
            this.poSheetSync.startAutoSync();
            this.timeDataSheetSync.startAutoSync();
            this.qbSync.startAutoSync();
          });
        } else {
          this.projectData.startAutoRefresh();
          this.masterSheetSync.startAutoSync();
          this.poSheetSync.startAutoSync();
          this.timeDataSheetSync.startAutoSync();
          this.qbSync.startAutoSync();
        }
      } else {
        this.startupCleanupDone = false;
        this.projectData.stopAutoRefresh();
        this.laborData.stopAutoRefresh();
        this.masterSheetSync.stopAutoSync();
        this.poSheetSync.stopAutoSync();
        this.timeDataSheetSync.stopAutoSync();
        this.qbSync.stopAutoSync();
      }
    });
  }

  async login() {
    await this.authService.login();
  }

  async logout() {
    await this.authService.logout();
  }
}

