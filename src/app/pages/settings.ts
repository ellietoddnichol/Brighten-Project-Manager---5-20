import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { SeedService } from '../services/seed.service';
import { MasterSheetSyncService } from '../services/master-sheet-sync.service';
import { PoSheetSyncService } from '../services/po-sheet-sync.service';
import { ProjectDedupeService } from '../services/project-dedupe.service';
import { TimeDataSheetSyncService } from '../services/time-data-sheet-sync.service';
import { QboSyncService } from '../services/qbo-sync.service';
import { ProjectCostsService } from '../services/project-costs.service';
import { ProjectDataService } from '../services/project-data.service';
import { QuickBooksSyncSheetsService } from '../services/quickbooks-sync-sheets.service';
import { QuickBooksSyncDataService } from '../services/quickbooks-sync-data.service';
import { SyncHealthService } from '../services/sync-health.service';
import { ImportReviewService } from '../services/import-review.service';
import { DataService } from '../services/data.service';
import { ProjectLifecycleService } from '../services/project-lifecycle.service';
import { SubcontractorSeedService } from '../services/subcontractor-seed.service';
import { MASTER_SHEET } from '../config/master-sheet.config';
import { PO_SHEET } from '../config/po-sheet.config';
import { TIME_DATA_SHEET } from '../config/time-data-sheet.config';
import { OPTIONAL_FINANCIAL_WORKBOOK } from '../config/pay-app-billing.config';
import { environment } from '../config/environment';
import { SettingsLaborCodes } from './settings-labor-codes';
import { SettingsSeedCompleteness } from './settings-seed-completeness';
import { SettingsDriveFolders } from './settings-drive-folders';
import { SettingsImportReview } from './settings-import-review';
import { SettingsSyncHealthComponent } from './settings-sync-health';
import { SettingsFeatureSetupComponent } from './settings-feature-setup';
import { PageHeaderComponent } from '../components/ui/page-header';
import { StatCardComponent } from '../components/ui/stat-card';
import { CompactStatStripComponent } from '../components/ui/compact-stat-strip';
import { SegmentedControlComponent } from '../components/ui/segmented-control';
import { StatusChipComponent } from '../components/ui/status-chip';
import { downloadCsv } from '../utils/csv-export';
import { Project } from '../models/types';
import {
  buildSettingsOverviewRows,
  countSetupMissing,
  SETTINGS_SEGMENT_OPTIONS,
  settingsFragmentForSegment,
  settingsHubCsvRows,
  settingsSegmentFromFragment,
  SettingsSegmentId,
  summarizeSettingsHub,
} from '../utils/settings-hub.compute';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    RouterModule,
    PageHeaderComponent,
    StatCardComponent,
    CompactStatStripComponent,
    SegmentedControlComponent,
    StatusChipComponent,
    SettingsLaborCodes,
    SettingsSeedCompleteness,
    SettingsDriveFolders,
    SettingsImportReview,
    SettingsSyncHealthComponent,
    SettingsFeatureSetupComponent,
  ],
  template: `
    <div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
      <app-page-header
        title="Settings"
        subtitle="Sources, setup, sync health, and app configuration"
        primaryActionLabel="Re-sync sources"
        (primaryAction)="resyncSources()">
        <button type="button" (click)="setSegment('sourceReview')"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Source Review
        </button>
        <button type="button" (click)="exportSetupReport()"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Export setup report
        </button>
        <button type="button" (click)="setSegment('advanced')"
                class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50">
          Advanced
        </button>
      </app-page-header>

      @if (hubMessage()) {
        <p class="text-sm text-emerald-700 -mt-2">{{ hubMessage() }}</p>
      }
      @if (hubError()) {
        <p class="text-sm text-rose-700 -mt-2">{{ hubError() }}</p>
      }

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button type="button" (click)="setSegment('syncHealth')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Sources Connected" [value]="sourcesLabel()" icon="link" />
        </button>
        <button type="button" (click)="setSegment('sourceReview')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Source Review Items" [value]="num(summary().sourceReviewItems)" icon="rule"
                         [trend]="summary().sourceReviewItems ? 'Review unmatched' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('setup')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Setup Missing" [value]="num(summary().setupMissing)" icon="build"
                         [trend]="summary().setupMissing ? 'Active jobs' : undefined" [trendPositive]="false" />
        </button>
        <button type="button" (click)="setSegment('syncHealth')" class="text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <app-stat-card label="Sync Warnings" [value]="num(summary().syncWarnings)" icon="warning"
                         [trend]="summary().syncWarnings ? 'Check sources' : undefined" [trendPositive]="false" />
        </button>
      </div>

      @if (compactStats().length) {
        <app-compact-stat-strip [stats]="compactStats()" />
      }

      <app-segmented-control [options]="segmentOptions()" [value]="segment()" (select)="setSegment($event)" />

      @switch (segment()) {
        @case ('overview') {
          <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100">
              <h2 class="text-sm font-bold text-slate-900">Admin actions</h2>
              <p class="text-xs text-slate-500 mt-0.5">Sync sources, discover data, and fix setup gaps</p>
            </div>
            <div class="divide-y divide-slate-100">
              @for (row of overviewRows(); track row.id) {
                <div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50/80">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-semibold text-slate-900">{{ row.category }}</span>
                      <app-status-chip
                        [tone]="row.severity === 'error' ? 'red' : (row.severity === 'warning' ? 'amber' : 'slate')">
                        {{ row.status }}
                      </app-status-chip>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">{{ row.explanation }}</p>
                  </div>
                  <button type="button" (click)="setSegment(row.segment)"
                          class="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg">
                    {{ row.nextAction }}
                  </button>
                </div>
              }
            </div>
          </section>
        }
        @case ('syncHealth') {
          <app-settings-sync-health />
        }
        @case ('setup') {
          <app-settings-seed-completeness />
        }
        @case ('sourceReview') {
          <app-settings-import-review />
        }
        @case ('laborCodes') {
          <app-settings-labor-codes />
        }
        @case ('driveLinks') {
          <app-settings-drive-folders />
        }
        @case ('quickbooks') {
          <section id="quickbooks-sync" class="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
            <h2 class="text-xl font-bold mb-2">QuickBooks Sync</h2>
            <p class="text-sm text-slate-500 mb-4 max-w-2xl">
              Live accounting data from the QuickBooks Project Mgmt Sync Workbook — billing, AR, vendor balances,
              bill payments, and project cost detail.
            </p>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 text-sm">
              <div class="bg-slate-50 rounded-xl border p-3">
                <p class="text-[10px] uppercase font-bold text-slate-500">Last sync</p>
                <p>{{ qbSyncData.lastRun()?.completedAt ? (qbSyncData.lastRun()!.completedAt | date:'short') : 'Never' }}</p>
              </div>
              <div class="bg-slate-50 rounded-xl border p-3">
                <p class="text-[10px] uppercase font-bold text-slate-500">Tabs found</p>
                <p>{{ qbSyncData.lastRun()?.tabsRead?.length ?? 0 }}</p>
              </div>
              <div class="bg-slate-50 rounded-xl border p-3">
                <p class="text-[10px] uppercase font-bold text-slate-500">Rows imported</p>
                <p>{{ qbSyncData.lastRun()?.rowsImported ?? 0 }}</p>
              </div>
              <div class="bg-slate-50 rounded-xl border p-3">
                <p class="text-[10px] uppercase font-bold text-slate-500">AR aging rows</p>
                <p>{{ qbSyncData.arAging().length }}</p>
              </div>
            </div>
            @if (qbMissingArAging()) {
              <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
                Missing AR Aging Summary tab — AR cannot be fully synced until the workbook includes aging data.
              </div>
            }
            @if (!qbSyncData.hasDetailCostTab()) {
              <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-4">
                Missing Project Cost Detail / Bill Details — actual job cost detail will be limited until this tab syncs.
              </div>
            }
            <button type="button" (click)="syncQbWorkbook()" [disabled]="qbSheetsSync.syncing()"
                    class="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {{ qbSheetsSync.syncing() ? 'Syncing…' : 'Re-sync QuickBooks workbook' }}
            </button>
            @if (qbSheetsSync.lastMessage()) {
              <p class="mt-3 text-sm text-emerald-700">{{ qbSheetsSync.lastMessage() }}</p>
            }
            @if (qbSheetsSync.lastSyncError()) {
              <p class="mt-3 text-sm text-rose-700">{{ qbSheetsSync.lastSyncError() }}</p>
            }
          </section>
        }
        @case ('features') {
          <app-settings-feature-setup />
        }
        @case ('advanced') {
          <section id="advanced" class="bg-white p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 class="text-xl font-bold">Advanced</h2>
              <p class="text-sm text-slate-500">Optional workbooks, manual source sync, legacy exports, and dev-only tools.</p>
            </div>

            <section class="rounded-xl border border-slate-200 p-6">
              <h3 class="text-lg font-bold mb-2">Optional Financial Workbook</h3>
              <p class="text-sm text-slate-500 mb-4">Not required for normal operation. Connect only if you want live WIP/billing tabs from a Google Sheet.</p>
              <input type="text" [(ngModel)]="workbookId" placeholder="Google Sheet ID (optional)"
                     class="w-full px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-200 text-sm mb-3 font-mono" />
              <div class="flex flex-wrap gap-3">
                <button type="button" (click)="saveWorkbookId()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold">Save sheet ID</button>
                <button type="button" (click)="refreshWorkbook()" [disabled]="projectData.loading() || !workbookId.trim()"
                        class="border px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Refresh workbook</button>
              </div>
              @if (workbookMessage()) {
                <p class="mt-3 text-sm" [class.text-emerald-700]="workbookSuccess()" [class.text-rose-700]="!workbookSuccess()">{{ workbookMessage() }}</p>
              }
            </section>

            <section class="rounded-xl border border-slate-200 p-6">
              <h3 class="text-lg font-bold mb-2">Master Data Sheet</h3>
              <p class="text-sm text-slate-500 mb-3">Read-only sync for jobs, contacts, and addresses.</p>
              <button type="button" (click)="syncMasterSheet()" [disabled]="masterSync.syncing()"
                      class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {{ masterSync.syncing() ? 'Syncing…' : 'Sync Master Sheet' }}
              </button>
            </section>

            <section class="rounded-xl border border-slate-200 p-6">
              <h3 class="text-lg font-bold mb-2">Purchase Order Sheet</h3>
              <button type="button" (click)="syncPoSheet()" [disabled]="poSync.syncing()"
                      class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {{ poSync.syncing() ? 'Syncing…' : 'Sync PO Sheet' }}
              </button>
            </section>

            <section class="rounded-xl border border-slate-200 p-6">
              <h3 class="text-lg font-bold mb-2">Master Time Data Sheet</h3>
              <button type="button" (click)="syncTimeDataSheet()" [disabled]="timeSync.syncing()"
                      class="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                {{ timeSync.syncing() ? 'Syncing…' : 'Sync Master Time Sheet' }}
              </button>
            </section>

            <section class="rounded-xl border border-slate-200 p-6">
              <h3 class="text-lg font-bold mb-2">Legacy QBO exports</h3>
              <p class="text-sm text-slate-500 mb-3">Optional legacy report imports — prefer QuickBooks Sync Workbook when available.</p>
              <div class="flex flex-wrap gap-3">
                <button type="button" (click)="syncQboReports()" [disabled]="qboSync.syncing()"
                        class="border px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Sync QBO reports</button>
                <button type="button" (click)="syncProjectCosts()" [disabled]="projectCosts.syncing()"
                        class="border px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Sync project costs detail</button>
              </div>
            </section>

            <section class="rounded-xl border border-rose-200 bg-rose-50/40 p-6">
              <h3 class="text-lg font-bold mb-2">Demo project data (dev only)</h3>
              <p class="text-sm text-slate-600 mb-4">Bundled demo data for development — not the production workflow.</p>
              <div class="flex flex-wrap gap-3">
                <button type="button" (click)="loadDemoData()" [disabled]="seeding()"
                        class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
                  Load demo data
                </button>
                <button type="button" (click)="removeDuplicateProjects()" [disabled]="dedupe.running()"
                        class="border px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Remove duplicate projects</button>
              </div>
              @if (message()) {
                <p class="mt-3 text-sm" [class.text-emerald-700]="success()" [class.text-rose-700]="!success()">{{ message() }}</p>
              }
            </section>

            <section id="job-cost-budgets" class="rounded-xl border border-slate-200 p-6 opacity-80">
              <h3 class="text-lg font-bold mb-2">Budget Workbook Import</h3>
              <p class="text-sm text-slate-500 mb-3"><strong>Next phase — on hold.</strong> Budget workbooks will import from actual job files later.</p>
              <button type="button" disabled class="bg-slate-200 text-slate-500 px-4 py-2 rounded-lg text-sm font-semibold cursor-not-allowed">
                Import budget workbooks (coming soon)
              </button>
            </section>
          </section>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private syncHealth = inject(SyncHealthService);
  private importReview = inject(ImportReviewService);
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private subDiscovery = inject(SubcontractorSeedService);

  seedService = inject(SeedService);
  masterSync = inject(MasterSheetSyncService);
  poSync = inject(PoSheetSyncService);
  timeSync = inject(TimeDataSheetSyncService);
  qboSync = inject(QboSyncService);
  qbSheetsSync = inject(QuickBooksSyncSheetsService);
  qbSyncData = inject(QuickBooksSyncDataService);
  projectCosts = inject(ProjectCostsService);
  dedupe = inject(ProjectDedupeService);
  projectData = inject(ProjectDataService);

  segment = signal<SettingsSegmentId>('overview');
  hubMessage = signal<string | null>(null);
  hubError = signal<string | null>(null);
  resyncing = signal(false);

  workbookId = environment.optionalFinancialWorkbookId;
  workbookMessage = signal<string | null>(null);
  workbookSuccess = signal(false);
  message = signal<string | null>(null);
  success = signal(false);

  private projects = toSignal(this.data.getProjects(), { initialValue: [] as Project[] });

  setupMissing = computed(() =>
    countSetupMissing(this.projects() ?? [], p => this.lifecycle.forProject(p)),
  );

  driveIssuesActive = computed(() =>
    (this.projects() ?? []).filter(p => {
      const snap = this.lifecycle.forProject(p);
      return snap.includeInDefaultScope && !snap.includeInArchive && !(p.driveFolderId || p.driveFolderUrl);
    }).length,
  );

  laborReviewCount = computed(() =>
    this.importReview.unresolved().filter(e =>
      e.type.includes('labor') || e.type === 'unmappedLaborCode' || e.type === 'unassignedLaborCode',
    ).length,
  );

  summary = computed(() => summarizeSettingsHub({
    syncRows: this.syncHealth.rows(),
    sourceReviewCount: this.importReview.unresolvedCount(),
    setupMissing: this.setupMissing(),
  }));

  overviewRows = computed(() => buildSettingsOverviewRows({
    syncRows: this.syncHealth.rows(),
    sourceReviewCount: this.importReview.unresolvedCount(),
    setupMissing: this.setupMissing(),
    driveIssuesActive: this.driveIssuesActive(),
    unmappedLaborCodes: this.laborReviewCount(),
  }));

  compactStats = computed(() => {
    const qb = this.qbSyncData.lastRun();
    return [
      { label: 'Master Time Sheet', value: this.timeSync.lastSyncAt() ? 'Synced' : 'Not synced', alert: !this.timeSync.lastSyncAt() },
      { label: 'QuickBooks', value: qb?.completedAt ? 'Synced' : 'Not synced', alert: !qb?.completedAt },
      { label: 'Drive Links', value: String(this.data.projectFoldersSnapshot().length) },
      { label: 'Labor Codes', value: this.data.projectLaborActualsSnapshot().length ? 'Synced' : 'Review' },
      { label: 'Subcontractor Discovery', value: String(this.data.subcontractorsSnapshot().length) },
      { label: 'Firestore Records', value: String(this.data.projectsSnapshot().length) + ' jobs' },
      { label: 'Budget Import', value: 'Coming Soon' },
    ];
  });

  segmentOptions = computed(() => {
    const opts = SETTINGS_SEGMENT_OPTIONS.map(o => ({ ...o, badge: undefined as number | undefined }));
    const reviewIdx = opts.findIndex(o => o.id === 'sourceReview');
    const count = this.importReview.unresolvedCount();
    if (reviewIdx >= 0 && count) opts[reviewIdx].badge = count;
    return opts;
  });

  qbMissingArAging = computed(() =>
    this.qbSyncData.arAging().length === 0
    && (this.qbSyncData.lastRun()?.tabsMissing ?? []).some(t => t.toLowerCase().includes('ar aging')),
  );

  seeding = this.seedService.seeding;

  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed()).subscribe(fragment => {
      const fromFragment = settingsSegmentFromFragment(fragment);
      if (fromFragment) this.segment.set(fromFragment);
    });
  }

  ngOnInit(): void {
    this.workbookId = environment.optionalFinancialWorkbookId;
  }

  num(value: number): string {
    return String(value);
  }

  sourcesLabel(): string {
    const s = this.summary();
    return `${s.sourcesConnected}/${s.sourcesTotal}`;
  }

  setSegment(segment: SettingsSegmentId): void {
    this.segment.set(segment);
    void this.router.navigate([], {
      relativeTo: this.route,
      fragment: settingsFragmentForSegment(segment),
      replaceUrl: true,
    });
  }

  exportSetupReport(): void {
    downloadCsv(
      `settings-setup-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Metric', 'Value'],
      settingsHubCsvRows(this.summary(), this.overviewRows()),
    );
  }

  async resyncSources(): Promise<void> {
    this.resyncing.set(true);
    this.hubMessage.set(null);
    this.hubError.set(null);
    try {
      await this.syncTimeDataSheet();
      await this.syncQbWorkbook();
      this.hubMessage.set('Master Time Sheet and QuickBooks workbook re-synced.');
    } catch (err) {
      this.hubError.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.resyncing.set(false);
    }
  }

  saveWorkbookId(): void {
    this.projectData.configureOptionalFinancialWorkbookId(this.workbookId.trim());
    this.workbookMessage.set(this.workbookId.trim() ? 'Optional workbook saved.' : 'Optional workbook cleared.');
    this.workbookSuccess.set(true);
  }

  async refreshWorkbook(): Promise<void> {
    this.projectData.configureOptionalFinancialWorkbookId(this.workbookId.trim());
    await this.projectData.refreshOptionalWorkbook();
    if (this.projectData.workbookError()) {
      this.workbookMessage.set(this.projectData.workbookError());
      this.workbookSuccess.set(false);
    } else {
      this.workbookMessage.set('Optional workbook refreshed.');
      this.workbookSuccess.set(true);
    }
  }

  async syncMasterSheet(): Promise<void> {
    try { await this.masterSync.syncFromMasterSheet(true); } catch { /* surfaced via service */ }
  }

  async syncPoSheet(): Promise<void> {
    try { await this.poSync.syncFromPoSheet(true); } catch { /* surfaced via service */ }
  }

  async syncTimeDataSheet(): Promise<void> {
    try { await this.timeSync.syncFromTimeDataSheet(true); } catch { /* surfaced via service */ }
  }

  async syncQbWorkbook(): Promise<void> {
    try { await this.qbSheetsSync.syncFromWorkbook(true); } catch { /* surfaced via service */ }
  }

  async syncQboReports(): Promise<void> {
    try { await this.qboSync.syncFromQboReports(); } catch { /* surfaced via service */ }
  }

  async syncProjectCosts(): Promise<void> {
    try { await this.projectCosts.syncFromProjectCosts(); } catch { /* surfaced via service */ }
  }

  async loadDemoData(): Promise<void> {
    this.message.set(null);
    try {
      await this.seedService.seedDemoData();
      this.message.set(this.seedService.seedMessage());
      this.success.set(true);
    } catch {
      this.message.set(this.seedService.seedMessage() ?? 'Failed to load demo data.');
      this.success.set(false);
    }
  }

  async removeDuplicateProjects(): Promise<void> {
    try {
      await this.dedupe.dedupeProjects();
      this.message.set(this.dedupe.lastMessage());
      this.success.set(true);
    } catch {
      this.message.set(this.dedupe.lastError() ?? 'Failed to remove duplicates.');
      this.success.set(false);
    }
  }
}
