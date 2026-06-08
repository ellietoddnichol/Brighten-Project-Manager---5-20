import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { mapDashboardRowsToProjects, mapDashboardRowToProject } from './project-api.mapper';
import { mapFinancialSummaryResponse, ProjectSqlFinancialSummary } from './project-financial-api.mapper';
import { mapBudgetResponse, ProjectSqlBudget } from './project-budget-api.mapper';
import { mapLaborResponse, ProjectSqlLabor } from './project-labor-api.mapper';
import {
  mapPayAppDetailResponse,
  mapPayAppsResponse,
  ProjectSqlPayApp,
  ProjectSqlPayAppDetail,
} from './project-pay-app-api.mapper';
import {
  ApiHealthResponse,
  ApiItemResponse,
  ApiListResponse,
  ProjectApiUpdateBody,
  ProjectDashboardApiRow,
  ProjectFinancialSummaryApiResponse,
  ProjectBudgetApiResponse,
  ProjectPayAppDetailApiResponse,
  ProjectPayAppsApiResponse,
} from './project-api.types';
import type { ProjectApiUpdatePayload } from './project-api-update';
import { Project } from '@app/models/types';
import { apiConfig, ApiDataSource } from '@app/config/api.config';

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private api = inject(ApiClientService);

  loading = signal(false);
  error = signal<string | null>(null);
  lastLoadedAt = signal<string | null>(null);
  activeSource = signal<ApiDataSource>('firestore');
  projects = signal<Project[]>([]);

  detailLoading = signal(false);
  detailError = signal<string | null>(null);
  detailActiveSource = signal<ApiDataSource>('firestore');
  detailProject = signal<Project | null>(null);
  detailProjectId = signal<string | null>(null);

  financialLoading = signal(false);
  financialError = signal<string | null>(null);
  financialActiveSource = signal<ApiDataSource>('firestore');
  financialSummary = signal<ProjectSqlFinancialSummary | null>(null);
  financialProjectId = signal<string | null>(null);

  budgetLoading = signal(false);
  budgetError = signal<string | null>(null);
  budgetActiveSource = signal<ApiDataSource>('firestore');
  budgetSummary = signal<ProjectSqlBudget | null>(null);
  budgetProjectId = signal<string | null>(null);

  payAppsLoading = signal(false);
  payAppsError = signal<string | null>(null);
  payAppsActiveSource = signal<ApiDataSource>('firestore');
  payApps = signal<ProjectSqlPayApp[]>([]);
  payAppsProjectId = signal<string | null>(null);
  payAppDetailLoading = signal(false);
  payAppDetailError = signal<string | null>(null);
  payAppDetail = signal<ProjectSqlPayAppDetail | null>(null);

  laborLoading = signal(false);
  laborError = signal<string | null>(null);
  laborActiveSource = signal<ApiDataSource>('firestore');
  labor = signal<ProjectSqlLabor | null>(null);
  laborProjectId = signal<string | null>(null);

  isEnabled(): boolean {
    return apiConfig.useApiBackend;
  }

  async checkHealth(): Promise<ApiHealthResponse> {
    return this.api.get<ApiHealthResponse>('/api/health');
  }

  /** Load project list from Cloud SQL API. Falls back silently on failure. */
  async loadProjects(): Promise<Project[]> {
    if (!this.isEnabled()) {
      this.activeSource.set('firestore');
      return [];
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const resp = await this.api.get<ApiListResponse<ProjectDashboardApiRow>>('/api/projects');
      const mapped = mapDashboardRowsToProjects(resp.items ?? []);
      this.projects.set(mapped);
      this.activeSource.set('api');
      this.lastLoadedAt.set(new Date().toISOString());
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects from API';
      this.error.set(message);
      this.activeSource.set('firestore');
      console.warn('[ProjectApiService]', message);
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  async getProject(idOrJob: string): Promise<Project | null> {
    try {
      const resp = await this.api.get<ApiItemResponse<ProjectDashboardApiRow>>(
        `/api/projects/${encodeURIComponent(idOrJob)}`,
      );
      return mapDashboardRowToProject(resp.item);
    } catch {
      return null;
    }
  }

  /** Load one project for detail shell/header. Falls back silently on failure. */
  async loadProjectDetail(idOrJob: string): Promise<Project | null> {
    this.detailProjectId.set(idOrJob);

    if (!this.isEnabled()) {
      this.detailActiveSource.set('firestore');
      this.detailError.set(null);
      this.detailProject.set(null);
      return null;
    }

    this.detailLoading.set(true);
    this.detailError.set(null);
    this.detailProject.set(null);
    this.detailActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ApiItemResponse<ProjectDashboardApiRow>>(
        `/api/projects/${encodeURIComponent(idOrJob)}`,
      );
      const project = mapDashboardRowToProject(resp.item);
      this.detailProject.set(project);
      this.detailActiveSource.set('api');
      return project;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project from API';
      this.detailError.set(message);
      this.detailActiveSource.set('firestore');
      this.detailProject.set(null);
      console.warn('[ProjectApiService] detail', message);
      return null;
    } finally {
      this.detailLoading.set(false);
    }
  }

  /**
   * Persist project edits to Cloud SQL. Throws on failure — no Firestore fallback.
   */
  async updateProject(idOrJob: string, patch: ProjectApiUpdatePayload): Promise<Project> {
    const resp = await this.api.patch<ApiItemResponse<ProjectDashboardApiRow>>(
      `/api/projects/${encodeURIComponent(idOrJob)}`,
      patch as ProjectApiUpdateBody,
    );
    const project = mapDashboardRowToProject(resp.item);
    this.detailProject.set(project);
    this.detailProjectId.set(idOrJob);
    this.detailActiveSource.set('api');
    this.detailError.set(null);

    const list = this.projects();
    const idx = list.findIndex(
      p => p.id === project.id || p.projectNumber === project.projectNumber,
    );
    if (idx >= 0) {
      const next = [...list];
      next[idx] = project;
      this.projects.set(next);
    }

    return project;
  }

  /** Load SQL-backed financial summary. Falls back to existing computed/Firestore path on failure. */
  async loadProjectFinancials(idOrJob: string): Promise<ProjectSqlFinancialSummary | null> {
    this.financialProjectId.set(idOrJob);

    if (!this.isEnabled()) {
      this.financialActiveSource.set('firestore');
      this.financialError.set(null);
      this.financialSummary.set(null);
      return null;
    }

    this.financialLoading.set(true);
    this.financialError.set(null);
    this.financialActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ProjectFinancialSummaryApiResponse>(
        `/api/projects/${encodeURIComponent(idOrJob)}/financials`,
      );
      const mapped = mapFinancialSummaryResponse(resp);
      this.financialSummary.set(mapped);
      this.financialActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project financials from API';
      this.financialError.set(message);
      this.financialSummary.set(null);
      this.financialActiveSource.set('firestore');
      console.warn('[ProjectApiService] financials', message);
      return null;
    } finally {
      this.financialLoading.set(false);
    }
  }

  /** Load SQL-backed pay app headers. Read-only; no Firestore write fallback. */
  async loadProjectPayApps(idOrJob: string): Promise<ProjectSqlPayApp[]> {
    this.payAppsProjectId.set(idOrJob);

    if (!this.isEnabled()) {
      this.payAppsActiveSource.set('firestore');
      this.payAppsError.set(null);
      this.payApps.set([]);
      this.payAppDetail.set(null);
      return [];
    }

    this.payAppsLoading.set(true);
    this.payAppsError.set(null);
    this.payAppsActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ProjectPayAppsApiResponse>(
        `/api/projects/${encodeURIComponent(idOrJob)}/pay-apps`,
      );
      const mapped = mapPayAppsResponse(resp);
      this.payApps.set(mapped);
      this.payAppsActiveSource.set('api');
      if (!mapped.some(item => item.id === this.payAppDetail()?.id)) {
        this.payAppDetail.set(null);
      }
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project pay apps from API';
      this.payAppsError.set(message);
      this.payApps.set([]);
      this.payAppDetail.set(null);
      this.payAppsActiveSource.set('firestore');
      console.warn('[ProjectApiService] pay apps', message);
      return [];
    } finally {
      this.payAppsLoading.set(false);
    }
  }

  /** Load one SQL-backed pay app with SOV lines. Read-only. */
  async loadProjectPayAppDetail(idOrJob: string, payAppId: string): Promise<ProjectSqlPayAppDetail | null> {
    if (!this.isEnabled()) {
      this.payAppDetailError.set(null);
      this.payAppDetail.set(null);
      return null;
    }

    this.payAppDetailLoading.set(true);
    this.payAppDetailError.set(null);

    try {
      const resp = await this.api.get<ProjectPayAppDetailApiResponse>(
        `/api/projects/${encodeURIComponent(idOrJob)}/pay-apps/${encodeURIComponent(payAppId)}`,
      );
      const mapped = mapPayAppDetailResponse(resp);
      this.payAppDetail.set(mapped);
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pay app detail from API';
      this.payAppDetailError.set(message);
      this.payAppDetail.set(null);
      console.warn('[ProjectApiService] pay app detail', message);
      return null;
    } finally {
      this.payAppDetailLoading.set(false);
    }
  }

  /** Load SQL-backed budget lines. Falls back silently on failure. */
  async loadProjectBudget(idOrJob: string): Promise<ProjectSqlBudget | null> {
    this.budgetProjectId.set(idOrJob);

    if (!this.isEnabled()) {
      this.budgetActiveSource.set('firestore');
      this.budgetError.set(null);
      this.budgetSummary.set(null);
      return null;
    }

    this.budgetLoading.set(true);
    this.budgetError.set(null);
    this.budgetActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ProjectBudgetApiResponse>(
        `/api/projects/${encodeURIComponent(idOrJob)}/budget`,
      );
      const mapped = mapBudgetResponse(resp);
      this.budgetSummary.set(mapped);
      this.budgetActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project budget from API';
      this.budgetError.set(message);
      this.budgetSummary.set(null);
      this.budgetActiveSource.set('firestore');
      console.warn('[ProjectApiService] budget', message);
      return null;
    } finally {
      this.budgetLoading.set(false);
    }
  }

  /** Create 80% target budget lines in SQL when none exist yet. */
  async confirmEstimatedBudget(idOrJob: string): Promise<{ inserted: number; totalBudget: number }> {
    const resp = await this.api.post<{ ok: boolean; inserted: number; totalBudget: number }>(
      `/api/projects/${encodeURIComponent(idOrJob)}/budget/confirm-estimate`,
      {},
    );
    await Promise.all([
      this.loadProjectFinancials(idOrJob),
      this.loadProjectBudget(idOrJob),
    ]);
    return { inserted: resp.inserted, totalBudget: resp.totalBudget };
  }

  /** Create a single budget line in SQL. */
  async createBudgetLine(idOrJob: string, line: BudgetLineWriteInput): Promise<void> {
    await this.api.post(`/api/projects/${encodeURIComponent(idOrJob)}/budget/lines`, line);
    await this.loadProjectBudget(idOrJob);
  }

  /** Bulk-import budget lines (e.g. from a pasted spreadsheet/CSV) in SQL. */
  async importBudgetLines(idOrJob: string, lines: BudgetLineWriteInput[]): Promise<{ imported: number }> {
    const resp = await this.api.post<{ ok: boolean; imported: number }>(
      `/api/projects/${encodeURIComponent(idOrJob)}/budget/lines/import`,
      { lines },
    );
    await this.loadProjectBudget(idOrJob);
    return { imported: resp.imported };
  }

  /** Update an existing SQL budget line. */
  async updateBudgetLine(idOrJob: string, lineId: string, line: BudgetLineWriteInput): Promise<void> {
    await this.api.patch(`/api/projects/${encodeURIComponent(idOrJob)}/budget/lines/${encodeURIComponent(lineId)}`, line);
    await this.loadProjectBudget(idOrJob);
  }

  /** Delete a SQL budget line. */
  async deleteBudgetLine(idOrJob: string, lineId: string): Promise<void> {
    await this.api.delete(`/api/projects/${encodeURIComponent(idOrJob)}/budget/lines/${encodeURIComponent(lineId)}`);
    await this.loadProjectBudget(idOrJob);
  }

  /** Load SQL-backed labor entries. Falls back silently on failure. */
  async loadProjectLabor(idOrJob: string): Promise<ProjectSqlLabor | null> {
    this.laborProjectId.set(idOrJob);

    if (!this.isEnabled()) {
      this.laborActiveSource.set('firestore');
      this.laborError.set(null);
      this.labor.set(null);
      return null;
    }

    this.laborLoading.set(true);
    this.laborError.set(null);
    this.laborActiveSource.set('firestore');

    try {
      const resp = await this.api.get<{ ok: boolean; projectId: string; summary?: Record<string, unknown> | null; entries?: Array<Record<string, unknown>>; entryCount?: number }>(
        `/api/projects/${encodeURIComponent(idOrJob)}/labor`,
      );
      const mapped = mapLaborResponse(resp);
      this.labor.set(mapped);
      this.laborActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project labor from API';
      this.laborError.set(message);
      this.labor.set(null);
      this.laborActiveSource.set('firestore');
      console.warn('[ProjectApiService] labor', message);
      return null;
    } finally {
      this.laborLoading.set(false);
    }
  }

  /** Create a single labor entry in SQL. */
  async createLaborEntry(idOrJob: string, entry: LaborEntryWriteInput): Promise<void> {
    await this.api.post(`/api/projects/${encodeURIComponent(idOrJob)}/labor`, entry);
    await this.loadProjectLabor(idOrJob);
  }

  /** Bulk-import labor entries (e.g. from a pasted spreadsheet/CSV) in SQL. */
  async importLaborEntries(idOrJob: string, entries: LaborEntryWriteInput[]): Promise<{ imported: number }> {
    const resp = await this.api.post<{ ok: boolean; imported: number }>(
      `/api/projects/${encodeURIComponent(idOrJob)}/labor/import`,
      { entries },
    );
    await this.loadProjectLabor(idOrJob);
    return { imported: resp.imported };
  }

  /** Update an existing SQL labor entry. */
  async updateLaborEntry(idOrJob: string, entryId: string, entry: LaborEntryWriteInput): Promise<void> {
    await this.api.patch(`/api/projects/${encodeURIComponent(idOrJob)}/labor/${encodeURIComponent(entryId)}`, entry);
    await this.loadProjectLabor(idOrJob);
  }

  /** Delete a SQL labor entry. */
  async deleteLaborEntry(idOrJob: string, entryId: string): Promise<void> {
    await this.api.delete(`/api/projects/${encodeURIComponent(idOrJob)}/labor/${encodeURIComponent(entryId)}`);
    await this.loadProjectLabor(idOrJob);
  }
}

export interface LaborEntryWriteInput {
  workDate: string;
  employeeName: string;
  classification?: string | null;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  hourlyRate?: number | null;
  laborCost?: number | null;
  notes?: string | null;
}

export interface BudgetLineWriteInput {
  costCode: string;
  category: string;
  description?: string | null;
  budgetAmount?: number | null;
  actualToDate?: number | null;
  committedAmount?: number | null;
  projectedFinalCost?: number | null;
  varianceAmount?: number | null;
  status?: string | null;
  notes?: string | null;
}
