import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { mapDashboardRowsToProjects, mapDashboardRowToProject } from './project-api.mapper';
import {
  ApiHealthResponse,
  ApiItemResponse,
  ApiListResponse,
  ProjectApiUpdateBody,
  ProjectDashboardApiRow,
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
}
