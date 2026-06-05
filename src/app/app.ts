import { Component, inject, effect } from '@angular/core';
import { AuthService } from '@core/services/auth.service';
import { AppShellComponent } from '@app/components/layout/app-shell';
import { MasterSheetSyncService } from '@core/services/master-sheet-sync.service';
import { PoSheetSyncService } from '@core/services/po-sheet-sync.service';
import { TimeDataSheetSyncService } from '@core/services/time-data-sheet-sync.service';
import { ProjectDedupeService } from '@core/services/project-dedupe.service';
import { ProjectDataService } from '@features/projects/services/project-data.service';
import { DataService } from '@core/services/data.service';
import { SubcontractorSeedService } from '@features/subcontractors/services/subcontractor-seed.service';
import { QuickBooksSyncSheetsService } from '@core/services/quickbooks-sync-sheets.service';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { CertifiedPayrollService } from '@features/labor/services/certified-payroll.service';
import { DriveWebhooksService } from '@core/services/drive-webhooks.service';

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
  private driveWebhooks = inject(DriveWebhooksService);
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
            this.driveWebhooks.start();
            void this.driveWebhooks.registerQBSpreadsheetWatch().catch(err => {
              console.warn('QB spreadsheet watch registration failed:', err);
            });
          });
        } else {
          this.projectData.startAutoRefresh();
          this.masterSheetSync.startAutoSync();
          this.poSheetSync.startAutoSync();
          this.timeDataSheetSync.startAutoSync();
          this.qbSync.startAutoSync();
          this.driveWebhooks.start();
        }
      } else {
        this.startupCleanupDone = false;
        this.projectData.stopAutoRefresh();
        this.laborData.stopAutoRefresh();
        this.masterSheetSync.stopAutoSync();
        this.poSheetSync.stopAutoSync();
        this.timeDataSheetSync.stopAutoSync();
        this.qbSync.stopAutoSync();
        this.driveWebhooks.stop();
      }
    });
  }

  async login() {
    try {
      await this.authService.login();
    } catch {
      // loginError is set on AuthService for display
    }
  }

  async logout() {
    await this.authService.logout();
  }
}

