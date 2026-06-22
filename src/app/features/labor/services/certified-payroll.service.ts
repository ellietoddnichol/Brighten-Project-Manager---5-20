import { Injectable, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { loadMockDataJson } from '@core/utils/mock-data-loader';
import { environment } from '@app/config/environment';
import { CERTIFIED_PAYROLL_EXPORT_MESSAGE } from '@app/config/certified-payroll-sheet.config';
import {
  CertifiedPayrollDashboardKpis,
  StoredClassificationRate,
  StoredFringeRate,
} from '@app/models/certified-payroll.types';
import { ClassificationRateRecord } from '@app/models/labor.types';
import { Project } from '@app/models/types';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';
import { CertifiedPayrollDataService } from '@features/labor/services/certified-payroll-data.service';
import { CertifiedPayrollExportService } from '@features/labor/services/certified-payroll-export.service';
import { CertifiedPayrollGeneratorService } from '@features/labor/services/certified-payroll-generator.service';
import { CertifiedPayrollTasksService } from '@features/labor/services/certified-payroll-tasks.service';
import { DataService } from '@core/services/data.service';
import { LaborDataService } from '@features/labor/services/labor-data.service';
import { ProjectLaborActualService } from '@features/labor/services/project-labor-actual.service';

@Injectable({ providedIn: 'root' })
export class CertifiedPayrollService {
  private dataService = inject(DataService);
  private cprData = inject(CertifiedPayrollDataService);
  private generator = inject(CertifiedPayrollGeneratorService);
  private tasks = inject(CertifiedPayrollTasksService);
  private exporter = inject(CertifiedPayrollExportService);
  private laborData = inject(LaborDataService);
  private laborActuals = inject(ProjectLaborActualService);

  loading = signal(false);
  lastMessage = signal<string | null>(null);
  lastError = signal<string | null>(null);

  private projects = toSignal(this.dataService.getProjects(), { initialValue: [] as Project[] });
  private weeks = toSignal(this.cprData.getWeeks(), { initialValue: [] });
  private exceptions = toSignal(this.cprData.getExceptions(), { initialValue: [] });
  private tasksList = toSignal(this.cprData.getTasks(), { initialValue: [] });
  private entries = toSignal(this.cprData.getEntries(), { initialValue: [] });

  certifiedProjects = computed(() => (this.projects() ?? []).filter(isCertifiedPayrollProject));

  dashboardKpis = computed((): CertifiedPayrollDashboardKpis => {
    const openExceptions = this.exceptions().filter(e => !e.resolved).length;
    const openTasks = this.tasksList().filter(t => t.status !== 'Complete' && t.status !== 'Canceled').length;
    const weeks = this.weeks();
    return {
      certifiedProjects: this.certifiedProjects().length,
      openTasks,
      draftWeeks: weeks.filter(w => w.status === 'draft').length,
      blockedWeeks: weeks.filter(w => w.status === 'blocked').length,
      readyWeeks: weeks.filter(w => w.status === 'ready').length,
      openExceptions,
      exportConfigured: this.exporter.exportConfigured(),
    };
  });

  exportBanner = computed(() =>
    this.exporter.exportConfigured() ? null : CERTIFIED_PAYROLL_EXPORT_MESSAGE,
  );

  async initialize(): Promise<void> {
    const projects = this.dataService.getProjectsSnapshot();
    await this.seedRatesFromLaborModule();
    await this.tasks.ensureTasksForProjects(projects);
    for (const project of projects.filter(isCertifiedPayrollProject)) {
      const openExceptions = this.cprData.getExceptionsSnapshot().filter(e => e.projectId === project.id && !e.resolved).length;
      const readyWeeks = this.cprData.getWeeksSnapshot().filter(w => w.projectId === project.id && w.status === 'ready').length;
      this.tasks.syncTaskProgress(project, openExceptions, readyWeeks);
    }
  }

  async ensureComplianceForProject(project: Project): Promise<void> {
    if (!isCertifiedPayrollProject(project)) return;
    await this.tasks.ensureTasksForProject(project);
  }

  async generateDrafts(projectId?: string): Promise<void> {
    this.loading.set(true);
    this.lastError.set(null);
    try {
      if (!this.laborData.normalizedEntries().length) {
        await this.laborData.refreshFromSheets(false);
      } else {
        await this.laborActuals.refreshFromApprovedTime(this.dataService.getProjectsSnapshot());
      }
      const result = await this.generator.generateWeeklyDrafts(this.dataService.getProjectsSnapshot(), projectId);
      this.lastMessage.set(
        `Generated ${result.weeksCreated} week(s), ${result.entriesCreated} entries, ${result.exceptionsCreated} exceptions. ` +
        'CPR weeks use Sun–Sat with Saturday week ending (matches Apps Script).',
      );
      for (const project of this.certifiedProjects()) {
        if (projectId && project.id !== projectId) continue;
        const openExceptions = this.cprData.getExceptionsSnapshot().filter(e => e.projectId === project.id && !e.resolved).length;
        const readyWeeks = this.cprData.getWeeksSnapshot().filter(w => w.projectId === project.id && w.status === 'ready').length;
        this.tasks.syncTaskProgress(project, openExceptions, readyWeeks);
      }
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : 'Failed to generate certified payroll drafts.');
    } finally {
      this.loading.set(false);
    }
  }

  async exportWeek(weekId: string): Promise<void> {
    const week = this.cprData.getWeeksSnapshot().find(w => w.id === weekId);
    const project = this.dataService.getProjectsSnapshot().find(p => p.id === week?.projectId);
    if (!week || !project) return;

    this.loading.set(true);
    this.lastError.set(null);
    try {
      const result = await this.exporter.exportWeek(project, week);
      this.lastMessage.set(result.message);
      if (!result.success && !this.exporter.exportConfigured()) {
        this.lastError.set(result.message);
      }
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      this.loading.set(false);
    }
  }

  configureSheetId(sheetId: string): void {
    environment.setCertifiedPayrollSheetId(sheetId);
  }

  getSheetId(): string {
    return environment.certifiedPayrollSheetId;
  }

  weeksForProject(projectId: string) {
    return this.weeks().filter(w => w.projectId === projectId).sort((a, b) => b.weekEnding.localeCompare(a.weekEnding));
  }

  entriesForWeek(weekId: string) {
    return this.entries().filter(e => e.weekId === weekId);
  }

  tasksForProject(projectId: string) {
    return this.tasksList().filter(t => t.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  exceptionsForProject(projectId: string, weekId?: string) {
    return this.exceptions().filter(e =>
      e.projectId === projectId
      && !e.resolved
      && (weekId ? e.weekId === weekId : true),
    );
  }

  async markWeeksSubmitted(weekIds: string[]): Promise<void> {
    this.loading.set(true);
    this.lastError.set(null);
    try {
      for (const id of weekIds) {
        const week = this.cprData.getWeeksSnapshot().find(w => w.id === id);
        if (week && week.status !== 'exported') {
          await this.cprData.upsertWeek({ ...week, status: 'submitted' });
        }
      }
      this.lastMessage.set(`Marked ${weekIds.length} week(s) as submitted.`);
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : 'Failed to mark weeks submitted.');
    } finally {
      this.loading.set(false);
    }
  }

  private async seedRatesFromLaborModule(): Promise<void> {
    const rates = this.laborData.classificationRates();
    const classificationRates: StoredClassificationRate[] = rates.map((rate, index) => ({
      id: `rate-${index}-${rate.classification}`.toLowerCase().replace(/\s+/g, '-'),
      unionArea: rate.unionArea,
      classification: rate.classification,
      baseRate: rate.baseRate,
      fringeRate: rate.fringeRate,
      totalPackage: rate.totalPackage,
      effectiveDate: rate.effectiveDate,
      source: rate.source ?? 'labor-module',
    }));
    const fringeRates: StoredFringeRate[] = rates.map((rate, index) => ({
      id: `fringe-${index}-${rate.classification}`.toLowerCase().replace(/\s+/g, '-'),
      unionArea: rate.unionArea,
      classification: rate.classification,
      fringeRate: rate.fringeRate,
      effectiveDate: rate.effectiveDate,
      source: rate.source ?? 'labor-module',
    }));

    if (!classificationRates.length) {
      const seed = await loadMockDataJson<{ classificationRates: ClassificationRateRecord[] }>('labor-rates-seed.json');
      for (const rate of seed.classificationRates) {
        classificationRates.push({
          id: `seed-${rate.classification}`.toLowerCase().replace(/\s+/g, '-'),
          unionArea: rate.unionArea,
          classification: rate.classification,
          baseRate: rate.baseRate,
          fringeRate: rate.fringeRate,
          totalPackage: rate.totalPackage,
          effectiveDate: rate.effectiveDate,
          source: 'seed',
        });
        fringeRates.push({
          id: `seed-fringe-${rate.classification}`.toLowerCase().replace(/\s+/g, '-'),
          unionArea: rate.unionArea,
          classification: rate.classification,
          fringeRate: rate.fringeRate,
          effectiveDate: rate.effectiveDate,
          source: 'seed',
        });
      }
    }

    await this.cprData.seedRatesIfEmpty(classificationRates, fringeRates);
  }
}
