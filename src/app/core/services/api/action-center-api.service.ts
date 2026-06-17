import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import {
  mapActionCenterRowsToPriorities,
  mapBackendReadinessRows,
  BackendReadinessSummary,
} from './action-center-api.mapper';
import {
  ActionCenterApiRow,
  ApiListResponse,
  BackendReadinessApiRow,
} from './project-api.types';
import { HomePriorityItem } from '@shared/utils/home-hub.compute';
import { apiConfig, ApiDataSource } from '@app/config/api.config';

@Injectable({ providedIn: 'root' })
export class ActionCenterApiService {
  private api = inject(ApiClientService);

  actionCenterLoading = signal(false);
  actionCenterError = signal<string | null>(null);
  actionCenterActiveSource = signal<ApiDataSource>('firestore');
  priorities = signal<HomePriorityItem[]>([]);

  backendReadinessLoading = signal(false);
  backendReadinessError = signal<string | null>(null);
  backendReadinessActiveSource = signal<ApiDataSource>('firestore');
  backendReadiness = signal<BackendReadinessSummary[]>([]);

  isEnabled(): boolean {
    return apiConfig.useApiBackend;
  }

  async loadActionCenter(): Promise<HomePriorityItem[]> {
    if (!this.isEnabled()) {
      this.actionCenterActiveSource.set('firestore');
      this.actionCenterError.set(null);
      this.priorities.set([]);
      return [];
    }

    this.actionCenterLoading.set(true);
    this.actionCenterError.set(null);
    this.actionCenterActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ApiListResponse<ActionCenterApiRow>>('/api/action-center');
      const mapped = mapActionCenterRowsToPriorities(resp.items ?? []);
      this.priorities.set(mapped);
      this.actionCenterActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load action center from API';
      this.actionCenterError.set(message);
      this.priorities.set([]);
      this.actionCenterActiveSource.set('firestore');
      console.warn('[ActionCenterApiService]', message);
      return [];
    } finally {
      this.actionCenterLoading.set(false);
    }
  }

  async loadBackendReadiness(): Promise<BackendReadinessSummary[]> {
    if (!this.isEnabled()) {
      this.backendReadinessActiveSource.set('firestore');
      this.backendReadinessError.set(null);
      this.backendReadiness.set([]);
      return [];
    }

    this.backendReadinessLoading.set(true);
    this.backendReadinessError.set(null);
    this.backendReadinessActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ApiListResponse<BackendReadinessApiRow>>('/api/backend-readiness');
      const mapped = mapBackendReadinessRows(resp.items ?? []);
      this.backendReadiness.set(mapped);
      this.backendReadinessActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load backend readiness from API';
      this.backendReadinessError.set(message);
      this.backendReadiness.set([]);
      this.backendReadinessActiveSource.set('firestore');
      console.warn('[ActionCenterApiService] backend-readiness', message);
      return [];
    } finally {
      this.backendReadinessLoading.set(false);
    }
  }
}
