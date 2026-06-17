import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiConfig } from '@app/config/api.config';
import { AuthService } from '@core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  get baseUrl(): string {
    return apiConfig.baseUrl;
  }

  async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await firstValueFrom(this.http.get<T>(url, { headers: await this.authHeaders() }));
    } catch (err) {
      throw this.wrapError(err, url);
    }
  }

  async post<T>(path: string, body: unknown = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await firstValueFrom(this.http.post<T>(url, body, { headers: await this.authHeaders() }));
    } catch (err) {
      throw this.wrapError(err, url);
    }
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await firstValueFrom(this.http.patch<T>(url, body, { headers: await this.authHeaders() }));
    } catch (err) {
      throw this.wrapError(err, url);
    }
  }


  async delete<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      return await firstValueFrom(this.http.delete<T>(url, { headers: await this.authHeaders() }));
    } catch (err) {
      throw this.wrapError(err, url);
    }
  }

  private async authHeaders(): Promise<HttpHeaders> {
    const token = await this.auth.getIdToken();
    if (!token) return new HttpHeaders();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
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
