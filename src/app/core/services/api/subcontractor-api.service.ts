import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { apiConfig, ApiDataSource } from '@app/config/api.config';
import { ApiListResponse, SubcontractorApiRow } from './project-api.types';
import {
  mapProjectSubcontractorApiRow,
  mapSubcontractorApiRow,
  mapSubcontractorInvoiceApiRow,
} from './subcontractor-api.mapper';
import {
  ProjectSubcontractor,
  Subcontractor,
  SubcontractorInvoice,
} from '@app/models/subcontractor.types';

@Injectable({ providedIn: 'root' })
export class SubcontractorApiService {
  private api = inject(ApiClientService);

  directoryLoading = signal(false);
  directoryError = signal<string | null>(null);
  directoryActiveSource = signal<ApiDataSource>('firestore');
  subcontractors = signal<Subcontractor[]>([]);

  invoicesLoading = signal(false);
  invoicesError = signal<string | null>(null);
  invoicesActiveSource = signal<ApiDataSource>('firestore');
  invoices = signal<SubcontractorInvoice[]>([]);

  projectSubsLoading = signal(false);
  projectSubsError = signal<string | null>(null);
  projectSubsActiveSource = signal<ApiDataSource>('firestore');
  projectSubcontractors = signal<ProjectSubcontractor[]>([]);
  projectSubsProjectId = signal<string | null>(null);

  isEnabled(): boolean {
    return apiConfig.useApiBackend;
  }

  async loadSubcontractors(): Promise<Subcontractor[]> {
    if (!this.isEnabled()) {
      this.directoryActiveSource.set('firestore');
      this.subcontractors.set([]);
      return [];
    }

    this.directoryLoading.set(true);
    this.directoryError.set(null);
    this.directoryActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ApiListResponse<SubcontractorApiRow>>('/api/subcontractors');
      const mapped = (resp.items ?? []).map(mapSubcontractorApiRow);
      this.subcontractors.set(mapped);
      this.directoryActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load subcontractors from API';
      this.directoryError.set(message);
      this.subcontractors.set([]);
      this.directoryActiveSource.set('firestore');
      console.warn('[SubcontractorApiService]', message);
      return [];
    } finally {
      this.directoryLoading.set(false);
    }
  }

  async loadInvoices(): Promise<SubcontractorInvoice[]> {
    if (!this.isEnabled()) {
      this.invoicesActiveSource.set('firestore');
      this.invoices.set([]);
      return [];
    }

    this.invoicesLoading.set(true);
    this.invoicesError.set(null);
    this.invoicesActiveSource.set('firestore');

    try {
      const resp = await this.api.get<ApiListResponse<SubcontractorApiRow>>('/api/subcontractors/invoices');
      const mapped = (resp.items ?? []).map(mapSubcontractorInvoiceApiRow);
      this.invoices.set(mapped);
      this.invoicesActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load subcontractor invoices from API';
      this.invoicesError.set(message);
      this.invoices.set([]);
      this.invoicesActiveSource.set('firestore');
      console.warn('[SubcontractorApiService] invoices', message);
      return [];
    } finally {
      this.invoicesLoading.set(false);
    }
  }

  async loadProjectSubcontractors(projectIdOrJob: string): Promise<ProjectSubcontractor[]> {
    if (!this.isEnabled()) {
      this.projectSubsActiveSource.set('firestore');
      this.projectSubcontractors.set([]);
      return [];
    }

    this.projectSubsLoading.set(true);
    this.projectSubsError.set(null);
    this.projectSubsActiveSource.set('firestore');
    this.projectSubsProjectId.set(projectIdOrJob);

    try {
      const resp = await this.api.get<ApiListResponse<SubcontractorApiRow>>(
        `/api/projects/${encodeURIComponent(projectIdOrJob)}/subcontractors`,
      );
      const mapped = (resp.items ?? []).map(mapProjectSubcontractorApiRow);
      this.projectSubcontractors.set(mapped);
      this.projectSubsActiveSource.set('api');
      return mapped;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project subcontractors from API';
      this.projectSubsError.set(message);
      this.projectSubcontractors.set([]);
      this.projectSubsActiveSource.set('firestore');
      console.warn('[SubcontractorApiService] project subs', message);
      return [];
    } finally {
      this.projectSubsLoading.set(false);
    }
  }
}
