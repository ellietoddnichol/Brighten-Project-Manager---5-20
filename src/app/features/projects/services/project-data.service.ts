import { Injectable, inject, signal, computed } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { GoogleSheetsService } from '@core/services/google-sheets.service';
import { ProjectCalculationsService } from '@features/projects/services/project-calculations.service';
import { WorkbookCacheService } from '@core/services/workbook-cache.service';
import { DataService } from '@core/services/data.service';
import { OPTIONAL_FINANCIAL_WORKBOOK } from '@app/config/pay-app-billing.config';
import { environment, FinancialDataSource } from '@app/config/environment';
import {
  normalizePayAppBillingData,
  normalizePayAppBillingFromSeed,
  payAppDashboardKpis,
  PayAppBillingSeed,
} from '@features/financials/utils/pay-app-billing-parser';
import {
  NormalizedBreakdown,
  NormalizedChangeLog,
  NormalizedInvoice,
  NormalizedMonthlyBilling,
  NormalizedProject,
  NormalizedProposal,
  NormalizedWorkbookData,
} from '@app/models/normalized-workbook';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { ProjectSubcontractor, Subcontractor, SubcontractorDocument, SubcontractorInvoice } from '@app/models/subcontractor.types';
import { CertifiedPayrollException } from '@app/models/certified-payroll.types';
import { ChangeOrder, Billing, Project } from '@app/models/types';
import { workbookToLegacyCollections } from '@shared/utils/sheet-normalizers';
import { computePortfolioMetrics, PortfolioMetrics } from '@shared/utils/financial';
import { collectAllActionItems, ActionItem } from '@shared/utils/action-items';
import { dedupeProjectsForDisplay } from '@features/projects/utils/project-dedupe';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';

/**
 * App-facing financial data facade.
 *
 * Priority:
 * 1. Firestore (source sync, QBO sync, manual edits) — projects, COs, billings
 * 2. Optional financial workbook (Google Sheet) — overrides billings/monthly when connected
 * 3. Bundled pay-app seed JSON — fallback when Firestore has no billing rows yet
 */
@Injectable({ providedIn: 'root' })
export class ProjectDataService {
  private googleSheets = inject(GoogleSheetsService);
  private calculations = inject(ProjectCalculationsService);
  private cache = inject(WorkbookCacheService);
  private dataService = inject(DataService);
  private cprData = inject(CertifiedPayrollDataService);
  private laborData = inject(LaborDataService);
  private lifecycle = inject(ProjectLifecycleService);

  private workbookOverlay = signal<NormalizedWorkbookData | null>(null);
  private seedData = signal<NormalizedWorkbookData | null>(null);
  private seedKpis = signal<PayAppBillingSeed['dashboardKpis'] | undefined>(undefined);
  private seedLoaded = signal(false);

  readonly loading = signal(false);
  readonly workbookError = signal<string | null>(null);
  readonly lastWorkbookRefreshAt = signal<Date | null>(null);
  readonly missingTabs = signal<string[]>([]);

  readonly hasOptionalFinancialWorkbook = signal(this.googleSheets.isConfigured());

  /** @deprecated Use hasOptionalFinancialWorkbook */
  readonly configured = this.hasOptionalFinancialWorkbook;

  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // Firestore streams (Master + seed + QBO sync)
  private firestoreProjects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });
  private firestoreChangeOrders = toSignal(this.dataService.getChangeOrders(), { initialValue: [] as ChangeOrder[] });
  private firestoreBillings = toSignal(this.dataService.getBillings(), { initialValue: [] as Billing[] });
  private firestorePos = toSignal(this.dataService.getPOs(), { initialValue: [] });
  private firestoreArRecords = toSignal(this.dataService.getArRecords(), { initialValue: [] });
  private firestoreBudgetLines = toSignal(this.dataService.getBudgetLines(), { initialValue: [] });
  private firestoreFiles = toSignal(this.dataService.getProjectFiles(), { initialValue: [] });
  private firestoreReqDocs = toSignal(this.dataService.getRequiredDocuments(), { initialValue: [] });
  private firestoreIssues = toSignal(this.dataService.getProjectIssues(), { initialValue: [] });
  private firestoreTasks = toSignal(this.dataService.getProjectTasks(), { initialValue: [] });
  private firestoreMilestones = toSignal(this.dataService.getMilestones(), { initialValue: [] });
  private firestoreLaborActuals = toSignal(this.dataService.getProjectLaborActuals(), { initialValue: [] as ProjectLaborActual[] });
  private firestoreLaborCodeMappings = toSignal(this.dataService.getLaborCodeMappings(), { initialValue: [] });
  private cprExceptions = toSignal(this.cprData.getExceptions(), { initialValue: [] as CertifiedPayrollException[] });
  private firestoreSubcontractors = toSignal(this.dataService.getSubcontractors(), { initialValue: [] as Subcontractor[] });
  private firestoreProjectSubs = toSignal(this.dataService.getProjectSubcontractors(), { initialValue: [] as ProjectSubcontractor[] });
  private firestoreSubDocs = toSignal(this.dataService.getSubcontractorDocuments(), { initialValue: [] as SubcontractorDocument[] });
  private firestoreSubInvoices = toSignal(this.dataService.getSubcontractorInvoices(), { initialValue: [] as SubcontractorInvoice[] });
  private firestoreProjectFolders = toSignal(this.dataService.getProjectFolders(), { initialValue: [] });
  private firestoreChangeRequests = toSignal(this.dataService.getChangeRequests(), { initialValue: [] });
  private firestoreSubmittals = toSignal(this.dataService.getSubmittals(), { initialValue: [] });
  private firestoreDailyLogs = toSignal(this.dataService.getDailyLogs(), { initialValue: [] });

  readonly financialSource = computed((): FinancialDataSource => {
    if (this.workbookOverlay() && this.hasOptionalFinancialWorkbook()) return 'workbook';
    if ((this.firestoreBillings()?.length ?? 0) > 0 || (this.firestoreChangeOrders()?.length ?? 0) > 0) {
      return 'firestore';
    }
    return 'seed';
  });

  readonly statusMessage = computed((): string => {
    switch (this.financialSource()) {
      case 'workbook':
        return 'Financial data from optional financial workbook (live Google Sheet).';
      case 'firestore':
        if (this.hasOptionalFinancialWorkbook()) {
          return 'Financial data loaded from imported reports and Firestore. Optional workbook connected but using Firestore until refreshed.';
        }
        return 'Financial data loaded from seed/imported reports. Optional financial workbook not connected.';
      case 'seed':
        return 'Financial data loaded from seed/imported reports. Optional financial workbook not connected.';
    }
  });

  readonly projects = computed((): Project[] => {
    const deduped = dedupeProjectsForDisplay(this.firestoreProjects() ?? []);
    if (deduped.length) return deduped;
    return this.overlayLegacy().projects;
  });

  readonly changeOrders = computed((): ChangeOrder[] => {
    const fs = this.firestoreChangeOrders() ?? [];
    if (fs.length) return fs;
    return this.overlayLegacy().changeOrders;
  });

  readonly billings = computed((): Billing[] => {
    if (this.workbookOverlay() && this.hasOptionalFinancialWorkbook()) {
      return this.overlayLegacy().billings;
    }
    const fs = this.firestoreBillings() ?? [];
    if (fs.length) return fs;
    return this.overlayLegacy().billings;
  });

  readonly metrics = computed((): PortfolioMetrics | null => {
    const projects = this.projects();
    if (!projects.length && !this.billings().length) return null;

    if (this.financialSource() === 'workbook' || this.financialSource() === 'seed') {
      const overlay = this.workbookOverlay() ?? this.seedData();
      if (overlay && this.financialSource() === 'workbook') {
        return payAppDashboardKpis(overlay, this.seedKpis());
      }
      if (overlay && this.financialSource() === 'seed' && !this.firestoreBillings()?.length) {
        return payAppDashboardKpis(overlay, this.seedKpis());
      }
    }

    return computePortfolioMetrics(projects, this.changeOrders(), this.billings());
  });

  readonly normalizedProjects = computed((): NormalizedProject[] =>
    (this.workbookOverlay() ?? this.seedData())?.projects ?? [],
  );

  readonly breakdown = computed((): NormalizedBreakdown[] =>
    (this.workbookOverlay() ?? this.seedData())?.breakdown ?? [],
  );

  readonly changes = computed((): NormalizedChangeLog[] =>
    (this.workbookOverlay() ?? this.seedData())?.changes ?? [],
  );

  readonly invoices = computed((): NormalizedInvoice[] =>
    (this.workbookOverlay() ?? this.seedData())?.invoices ?? [],
  );

  readonly proposals = computed((): NormalizedProposal[] =>
    (this.workbookOverlay() ?? this.seedData())?.proposals ?? [],
  );

  readonly monthlyBilling = computed((): NormalizedMonthlyBilling[] =>
    (this.workbookOverlay() ?? this.seedData())?.monthlyBilling ?? [],
  );

  readonly attentionItems = computed((): ActionItem[] => {
    const firestoreItems = collectAllActionItems({
      projects: this.projects(),
      changeOrders: this.changeOrders(),
      billings: this.billings(),
      pos: this.firestorePos() ?? [],
      budgetLines: this.firestoreBudgetLines() ?? [],
      arRecords: this.firestoreArRecords() ?? [],
      laborActuals: this.firestoreLaborActuals() ?? [],
      cprExceptions: this.cprExceptions() ?? [],
      subcontractors: this.firestoreSubcontractors() ?? [],
      projectSubcontractors: this.firestoreProjectSubs() ?? [],
      subcontractorDocuments: this.firestoreSubDocs() ?? [],
      subcontractorInvoices: this.firestoreSubInvoices() ?? [],
      foremanBonusRecords: this.dataService.foremanBonusRecordsSnapshot(),
      projectForemanAssignments: this.dataService.projectForemanAssignmentsSnapshot(),
      projectFolders: this.firestoreProjectFolders() ?? [],
      changeRequests: this.firestoreChangeRequests() ?? [],
      submittals: this.firestoreSubmittals() ?? [],
      dailyLogs: this.firestoreDailyLogs() ?? [],
      files: this.firestoreFiles() ?? [],
      requiredDocuments: this.firestoreReqDocs() ?? [],
      issues: this.firestoreIssues() ?? [],
      tasks: this.firestoreTasks() ?? [],
      milestones: this.firestoreMilestones() ?? [],
      normalizedLaborEntries: this.laborData.normalizedEntries(),
      laborCodeMappings: this.firestoreLaborCodeMappings(),
      lifecycleByProjectId: this.lifecycle.snapshotMap(),
    });

    const overlay = this.workbookOverlay() ?? this.seedData();
    const payAppItems = overlay ? this.buildPayAppAttentionItems(overlay) : [];

    const merged = [...firestoreItems];
    for (const item of payAppItems) {
      if (!merged.some(m => m.id === item.id)) merged.push(item);
    }
    return merged.slice(0, 12);
  });

  /** @deprecated Use workbookError */
  readonly error = this.workbookError;

  projects$ = toObservable(this.projects);
  changeOrders$ = toObservable(this.changeOrders);
  billings$ = toObservable(this.billings);

  configureOptionalFinancialWorkbookId(id: string): void {
    environment.setOptionalFinancialWorkbookId(id);
    this.hasOptionalFinancialWorkbook.set(!!id.trim());
  }

  /** @deprecated */
  configureWorkbookId(id: string): void {
    this.configureOptionalFinancialWorkbookId(id);
  }

  getOptionalWorkbookUrl(): string | null {
    const id = this.googleSheets.getSpreadsheetId();
    return id ? OPTIONAL_FINANCIAL_WORKBOOK.url(id) : null;
  }

  /** @deprecated */
  getWorkbookUrl(): string | null {
    return this.getOptionalWorkbookUrl();
  }

  async initialize(): Promise<void> {
    if (!this.seedLoaded()) {
      await this.loadBundledSeed();
    }
    if (this.hasOptionalFinancialWorkbook()) {
      await this.refreshOptionalWorkbook({ useCacheFirst: true }).catch(() => undefined);
    }
  }

  /** Refresh only the optional financial workbook (never blocks the app). */
  async refreshOptionalWorkbook(options?: { useCacheFirst?: boolean }): Promise<void> {
    if (!this.googleSheets.isConfigured()) {
      this.workbookError.set(null);
      return;
    }

    this.loading.set(true);
    this.workbookError.set(null);

    const userId = this.cache.currentUserId();
    if (options?.useCacheFirst && userId) {
      const cached = await this.cache.loadCachedWorkbook(userId);
      if (cached) {
        this.workbookOverlay.set(cached);
        this.lastWorkbookRefreshAt.set(cached.fetchedAt);
        this.missingTabs.set(cached.missingTabs);
      }
    }

    try {
      const raw = await this.googleSheets.getAllPayAppBillingData();
      const normalized = normalizePayAppBillingData({
        projectMonthGrid: raw.projectMonthGrid,
        invoiceDetail: raw.invoiceDetail,
        projectMonthImport: raw.projectMonthImport,
        payAppUpdateList: raw.payAppUpdateList,
        no2026Billing: raw.no2026Billing,
        fetchedAt: raw.fetchedAt,
        missingTabs: raw.missingTabs,
      });
      this.workbookOverlay.set(normalized);
      this.lastWorkbookRefreshAt.set(normalized.fetchedAt);
      this.missingTabs.set(normalized.missingTabs);

      if (userId) {
        await this.cache.saveCachedWorkbook(userId, normalized);
        await this.cache.saveRefreshStatus(userId, {
          lastRefreshAt: normalized.fetchedAt.toISOString(),
          missingTabs: normalized.missingTabs,
          projectCount: normalized.projects.length,
          invoiceCount: normalized.invoices.length,
          changeCount: 0,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.workbookError.set(message);
      if (userId) {
        await this.cache.saveRefreshStatus(userId, { lastError: message });
      }
    } finally {
      this.loading.set(false);
    }
  }

  /** @deprecated Use refreshOptionalWorkbook */
  async refresh(options?: { useCacheFirst?: boolean }): Promise<void> {
    await this.initialize();
    await this.refreshOptionalWorkbook(options);
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    if (!this.googleSheets.isConfigured()) return;
    this.autoRefreshTimer = setInterval(() => {
      void this.refreshOptionalWorkbook();
    }, OPTIONAL_FINANCIAL_WORKBOOK.syncIntervalMs);
  }

  stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  getProjectSummaries(): NormalizedProject[] {
    return this.normalizedProjects();
  }

  getProjectDetail(projectId: string) {
    const fsProject = this.projects().find(
      p => p.id === projectId || p.seedProjectId === projectId,
    );
    const overlay = this.workbookOverlay() ?? this.seedData();
    const normalized = overlay?.projects.find(
      p => p.projectId === projectId || p.projectNo === projectId,
    ) ?? null;

    const changes = this.changeOrders()
      .filter(c => c.projectId === projectId || c.projectId === fsProject?.id)
      .map(c => ({
        id: c.id,
        projectId: c.projectId,
        changeNo: c.coNumber,
        title: c.title,
        description: c.description,
        status: c.status,
        submittedAmount: c.sellPrice ?? 0,
        approvedAmount: c.approvedAmount ?? 0,
        billedAmount: 0,
      })) as NormalizedChangeLog[];

    const invoices = this.billings()
      .filter(b => b.projectId === projectId || b.projectId === fsProject?.id)
      .map(b => ({
        id: b.id,
        projectId: b.projectId,
        projectNo: fsProject?.projectNumber ?? projectId,
        invoiceNo: b.payAppNumber,
        billingPeriod: b.billingPeriod,
        status: b.status,
        grossBilled: b.totalBilledToDate ?? b.workCompletedThisPeriod ?? 0,
        retainage: b.retainageAmount ?? 0,
        paid: b.amountPaid ?? 0,
        arBalance: Math.max(0, (b.totalBilledToDate ?? 0) - (b.amountPaid ?? 0)),
      })) as NormalizedInvoice[];

    return {
      project: normalized,
      legacyProject: fsProject ?? null,
      breakdown: overlay?.breakdown.filter(b => b.projectId === projectId) ?? [],
      changes,
      invoices,
      proposals: overlay?.proposals.filter(p => p.projectId === projectId) ?? [],
      monthlyBilling: overlay?.monthlyBilling.filter(m => m.projectId === projectId) ?? [],
      summary: normalized
        ? this.calculations.calculateProjectSummary(
            normalized,
            changes,
            invoices,
            overlay?.monthlyBilling.filter(m => m.projectId === projectId) ?? [],
          )
        : null,
    };
  }

  getBillingSummary(): PortfolioMetrics | null {
    return this.metrics();
  }

  getChangeSummary() {
    const cos = this.changeOrders();
    const pending = cos.filter(c => !['Approved', 'Rejected', 'Void'].includes(c.status));
    const approved = cos.filter(c => c.status === 'Approved');
    return {
      pending: pending.reduce((s, c) => s + (c.sellPrice || c.approvedAmount || 0), 0),
      approved: approved.reduce((s, c) => s + (c.approvedAmount || 0), 0),
      count: cos.length,
    };
  }

  getMonthlyBillingSeries() {
    const overlay = this.workbookOverlay() ?? this.seedData();
    return overlay ? this.calculations.buildMonthlyBillingSeries(overlay) : [];
  }

  private overlayLegacy = computed(() => {
    const overlay = this.workbookOverlay() ?? this.seedData();
    return overlay ? workbookToLegacyCollections(overlay) : { projects: [], changeOrders: [], billings: [] };
  });

  private async loadBundledSeed(): Promise<void> {
    try {
      const mod = await import('@app/data/pay-app-billing-seed.json');
      const seed = mod.default as PayAppBillingSeed;
      this.seedData.set(normalizePayAppBillingFromSeed(seed));
      this.seedKpis.set(seed.dashboardKpis);
      this.seedLoaded.set(true);
    } catch {
      this.seedLoaded.set(true);
    }
  }

  private buildPayAppAttentionItems(data: NormalizedWorkbookData): ActionItem[] {
    const items: ActionItem[] = [];
    for (const row of data.proposals) {
      if (row.title.includes('No 2026 billing') || row.status === 'Needs Review') {
        items.push({
          id: `no-bill-${row.projectId}`,
          projectId: row.projectId,
          projectName: row.projectNo,
          title: 'No 2026 billing',
          description: row.title,
          severity: 'warning',
          type: 'billing',
        });
      }
    }
    return items;
  }
}
