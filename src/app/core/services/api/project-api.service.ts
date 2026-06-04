import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { mapDashboardRowsToProjects, mapDashboardRowToProject } from './project-api.mapper';
import {
  ApiHealthResponse,
  ApiItemResponse,
  ApiListResponse,
  ProjectDashboardApiRow,
} from './project-api.types';
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
}
