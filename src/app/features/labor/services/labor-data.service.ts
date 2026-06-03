import { Injectable, inject, signal, computed, Injector } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import {
  ClassificationRateRecord,
  EmployeeRecord,
  LaborRefreshStatus,
  MonthlyLaborAccrual,
  NormalizedLaborEntry,
  QbLaborActual,
} from '@app/models/labor.types';
import { Project } from '@app/models/types';
import { LABOR_SHEET } from '@app/config/labor-sheet.config';
import { createLazyJsonLoader } from '@core/utils/mock-data-loader';
import { SheetsService } from '@core/services/sheets.service';
import { DataService } from '@core/services/data.service';
import { LaborRateService } from '@features/labor/services/labor-rate.service';
import { LaborCalculationsService } from '@features/labor/services/labor-calculations.service';
import { ProjectCostsService } from '@features/projects/services/project-costs.service';
import {
  classificationRatesFromSeed,
  parseClassificationRateRows,
  parseEmployeeSummaryRows,
  parseFringeRateRows,
  parseTimekeeperRows,
} from '@features/labor/utils/labor-normalizers';
import { normalizeJobKey, parseJobLabel } from '@shared/utils/master-sheet-parser';
import { auth } from '@app/firebase';
import { effectiveClassification, resolveLaborCodeMapping } from '@features/labor/utils/labor-code-mapping.compute';

const laborRatesSeedLoader = createLazyJsonLoader<{ classificationRates: ClassificationRateRecord[] }>('labor-rates-seed.json');

interface LaborCachePayload {
  generatedAt: string;
  refreshStatus: LaborRefreshStatus;
  employees: EmployeeRecord[];
  classificationRates: ClassificationRateRecord[];
  normalizedEntries: NormalizedLaborEntry[];
  monthlyAccruals: MonthlyLaborAccrual[];
  qbActuals: QbLaborActual[];
}

@Injectable({ providedIn: 'root' })
export class LaborDataService {
  private sheetsService = inject(SheetsService);
  private dataService = inject(DataService);
  private rateService = inject(LaborRateService);
  private calculations = inject(LaborCalculationsService);
  private projectCosts = inject(ProjectCostsService);
  private injector = inject(Injector);

  loading = signal(false);
  refreshStatus = signal<LaborRefreshStatus>({
    source: 'seed',
    timekeeperRowCount: 0,
    approvedRowCount: 0,
    employeeCount: 0,
    rateCount: 0,
  });

  employees = signal<EmployeeRecord[]>([]);
  classificationRates = signal<ClassificationRateRecord[]>([]);
  normalizedEntries = signal<NormalizedLaborEntry[]>([]);
  monthlyAccruals = signal<MonthlyLaborAccrual[]>([]);
  qbActuals = signal<QbLaborActual[]>([]);

  private firestoreProjects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });
  private laborCodeMappings = toSignal(this.dataService.getLaborCodeMappings(), { initialValue: [] });
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    void laborRatesSeedLoader.get().then(seed =>
      this.classificationRates.set(classificationRatesFromSeed(seed)),
    );
  }

  private async laborRatesSeed() {
    return laborRatesSeedLoader.get();
  }

  overviewKpis = computed(() =>
    this.calculations.buildOverviewKpis(
      this.normalizedEntries(),
      this.monthlyAccruals(),
    ),
  );

  exceptions = computed(() =>
    this.calculations.detectExceptions(
      this.normalizedEntries(),
      this.monthlyAccruals(),
      this.employees(),
      this.firestoreProjects() ?? [],
      this.laborCodeMappings(),
    ),
  );

  employeeRows = computed(() => {
    const timekeeperNames = new Set(
      this.normalizedEntries().map(e => e.employeeName?.toLowerCase()).filter(Boolean),
    );
    const fromSheet = this.employees();
    if (fromSheet.length) {
      return fromSheet.map(emp => ({
        ...emp,
        timekeeperMatch: timekeeperNames.has(emp.employeeName.toLowerCase()),
      }));
    }
    return [...timekeeperNames].filter((name): name is string => !!name).map(name => ({
      employeeName: name.replace(/\b\w/g, c => c.toUpperCase()),
      timekeeperMatch: true,
      status: 'Active',
    } as EmployeeRecord));
  });

  rateRows = computed(() =>
    this.classificationRates().map(rate => ({
      unionArea: rate.unionArea,
      classification: rate.classification,
      baseRate: rate.baseRate,
      fringeRate: rate.fringeRate,
      totalPackage: rate.totalPackage,
      effectiveDate: rate.effectiveDate,
      source: rate.source ?? 'classification',
    })),
  );

  async initialize(): Promise<void> {
    this.loadCache();
    if (auth.currentUser) {
      await this.refreshFromSheets(false);
      this.startAutoRefresh();
    }
  }

  startAutoRefresh(): void {
    if (this.autoRefreshTimer) return;
    this.autoRefreshTimer = setInterval(
      () => void this.refreshFromSheets(false),
      LABOR_SHEET.syncIntervalMs,
    );
  }

  stopAutoRefresh(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  async refreshFromSheets(manual = true): Promise<void> {
    if (!auth.currentUser) {
      throw new Error('Sign in to refresh labor data from Google Sheets.');
    }
    if (this.loading()) return;

    this.loading.set(true);
    try {
      const sheetMeta = await this.sheetsService.getSpreadsheetSheets(LABOR_SHEET.spreadsheetId);
      const titles = sheetMeta.map(s => s.title);

      const timekeeperTab = this.resolveTab(titles, LABOR_SHEET.tabs.timekeeper);
      const employeeTab = this.resolveTab(titles, LABOR_SHEET.tabs.employeeSummary);
      const classificationTab = this.resolveTab(titles, LABOR_SHEET.tabs.classificationRates);
      const fringeTab = this.resolveTab(titles, LABOR_SHEET.tabs.fringeRates);

      const requests: Promise<string[][]>[] = [];
      if (timekeeperTab) requests.push(this.sheetsService.getValues(LABOR_SHEET.spreadsheetId, `'${timekeeperTab}'!A:Z`));
      if (employeeTab) requests.push(this.sheetsService.getValues(LABOR_SHEET.spreadsheetId, `'${employeeTab}'!A:Z`));
      if (classificationTab) requests.push(this.sheetsService.getValues(LABOR_SHEET.spreadsheetId, `'${classificationTab}'!A:Z`));
      if (fringeTab) requests.push(this.sheetsService.getValues(LABOR_SHEET.spreadsheetId, `'${fringeTab}'!A:Z`));

      const results = await Promise.all(requests);
      let idx = 0;
      const timekeeperRows = timekeeperTab ? results[idx++] : [];
      const employeeRows = employeeTab ? results[idx++] : [];
      const classificationRows = classificationTab ? results[idx++] : [];
      const fringeRows = fringeTab ? results[idx++] : [];

      const rawTimekeeper = timekeeperTab
        ? parseTimekeeperRows(timekeeperRows, LABOR_SHEET.approvedStatusValues)
        : [];

      const parsedEmployees = employeeTab ? parseEmployeeSummaryRows(employeeRows) : [];
      let parsedRates = classificationTab
        ? parseClassificationRateRows(classificationRows)
        : classificationRatesFromSeed(await this.laborRatesSeed());

      if (fringeTab && fringeRows.length) {
        const fringeParsed = parseFringeRateRows(fringeRows);
        parsedRates = this.mergeFringeRates(parsedRates, fringeParsed);
      }

      if (!parsedRates.length) {
        parsedRates = classificationRatesFromSeed(await this.laborRatesSeed());
      }

      const projects = await firstValueFrom(this.dataService.getProjects());
      const projectLookup = this.buildProjectLookup(projects);

      const mappings = this.laborCodeMappings();

      const normalized = rawTimekeeper.map(entry => {
        const mapping = resolveLaborCodeMapping(entry.laborCode, mappings);
        const classification = effectiveClassification(entry, mapping) ?? entry.classification;
        const enrichedEntry = { ...entry, classification };
        const project = this.findProject(enrichedEntry.jobIdLabel, enrichedEntry.projectNumber, projectLookup, projects);
        const rate = this.rateService.matchRate(
          enrichedEntry.employeeName,
          enrichedEntry.classification,
          parsedEmployees,
          parsedRates,
        );
        return this.calculations.normalizeEntry(enrichedEntry, rate, project);
      });

      const qbActuals = this.calculations.deriveQbLaborActuals(projects, this.projectCosts.monthlyLabor());
      const accruals = this.calculations.buildMonthlyAccruals(normalized, qbActuals);

      this.employees.set(parsedEmployees);
      this.classificationRates.set(parsedRates);
      this.normalizedEntries.set(normalized);
      this.monthlyAccruals.set(accruals);
      this.qbActuals.set(qbActuals);

      const status: LaborRefreshStatus = {
        lastRefreshAt: new Date().toISOString(),
        source: timekeeperTab ? 'google-sheets' : 'seed',
        timekeeperRowCount: timekeeperRows.length > 1 ? timekeeperRows.length - 1 : 0,
        approvedRowCount: rawTimekeeper.length,
        employeeCount: parsedEmployees.length,
        rateCount: parsedRates.length,
      };
      this.refreshStatus.set(status);
      this.saveCache({
        generatedAt: status.lastRefreshAt!,
        refreshStatus: status,
        employees: parsedEmployees,
        classificationRates: parsedRates,
        normalizedEntries: normalized,
        monthlyAccruals: accruals,
        qbActuals,
      });

      const { ProjectLaborActualService } = await import('./project-labor-actual.service');
      await this.injector.get(ProjectLaborActualService).refreshFromApprovedTime(projects);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Labor refresh failed';
      this.refreshStatus.update(s => ({ ...s, error: message }));
      if (manual) throw err;
    } finally {
      this.loading.set(false);
    }
  }

  private resolveTab(available: string[], candidates: readonly string[]): string | null {
    for (const candidate of candidates) {
      const match = available.find(t => t.toLowerCase() === candidate.toLowerCase());
      if (match) return match;
    }
    return null;
  }

  private mergeFringeRates(
    rates: ClassificationRateRecord[],
    fringeRates: { unionArea: string; classification: string; fringeRate: number }[],
  ): ClassificationRateRecord[] {
    return rates.map(rate => {
      const fringe = fringeRates.find(f =>
        f.classification.toLowerCase() === rate.classification.toLowerCase()
        && f.unionArea.toLowerCase() === rate.unionArea.toLowerCase(),
      );
      if (!fringe) return rate;
      return {
        ...rate,
        fringeRate: fringe.fringeRate,
        totalPackage: rate.baseRate + fringe.fringeRate,
      };
    });
  }

  private buildProjectLookup(projects: Project[]): Map<string, Project> {
    const map = new Map<string, Project>();
    for (const project of projects) {
      map.set(normalizeJobKey(project.projectNumber), project);
      map.set(normalizeJobKey(`${project.projectNumber} - ${project.projectName}`), project);
      if (project.masterSheetJobId) map.set(normalizeJobKey(project.masterSheetJobId), project);
    }
    return map;
  }

  private findProject(
    jobIdLabel: string | undefined,
    projectNumber: string | undefined,
    lookup: Map<string, Project>,
    projects: Project[],
  ): Project | undefined {
    if (jobIdLabel) {
      const byLabel = lookup.get(normalizeJobKey(jobIdLabel));
      if (byLabel) return byLabel;
    }
    if (projectNumber) {
      const byNumber = lookup.get(normalizeJobKey(projectNumber));
      if (byNumber) return byNumber;
      return projects.find(p => p.projectNumber === projectNumber);
    }
    if (jobIdLabel) {
      const { projectNumber: num } = parseJobLabel(jobIdLabel);
      return lookup.get(normalizeJobKey(num)) ?? projects.find(p => p.projectNumber === num);
    }
    return undefined;
  }

  private loadCache(): void {
    try {
      const raw = localStorage.getItem(LABOR_SHEET.cacheKey);
      if (!raw) return;
      const cache = JSON.parse(raw) as LaborCachePayload;
      this.employees.set(cache.employees ?? []);
      this.classificationRates.set(cache.classificationRates ?? this.classificationRates());
      this.normalizedEntries.set(cache.normalizedEntries ?? []);
      this.monthlyAccruals.set(cache.monthlyAccruals ?? []);
      this.qbActuals.set(cache.qbActuals ?? []);
      if (cache.refreshStatus) {
        this.refreshStatus.set({ ...cache.refreshStatus, source: 'cache' });
      }
    } catch {
      // ignore bad cache
    }
  }

  private saveCache(payload: LaborCachePayload): void {
    try {
      localStorage.setItem(LABOR_SHEET.cacheKey, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }
}
