import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '@app/config/api.config';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);

  get baseUrl(): string {
    return apiConfig.baseUrl;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await firstValueFrom(this.http.get<T>(url));
    } catch (err) {
      throw this.wrapError(err, url);
    }
  }

  private wrapError(err: unknown, url: string): Error {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { error?: string } | null;
      const detail = body?.error ?? err.statusText ?? 'Request failed';
      return new Error(`${url}: ${detail}`);
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
