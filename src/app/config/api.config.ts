/** Runtime API configuration — no database credentials in the browser. */
const API_BASE_URL_KEY = 'brighten.apiBaseUrl';
const USE_API_BACKEND_KEY = 'brighten.useApiBackend';

const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export const apiConfig = {
  get baseUrl(): string {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(API_BASE_URL_KEY);
      if (stored?.trim()) return stored.trim().replace(/\/+$/, '');
    }
    return DEFAULT_API_BASE_URL;
  },

  setBaseUrl(url: string): void {
    if (typeof localStorage === 'undefined') return;
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed) {
      localStorage.setItem(API_BASE_URL_KEY, trimmed);
    } else {
      localStorage.removeItem(API_BASE_URL_KEY);
    }
  },

  /** When true, read-only project list prefers Cloud SQL API over Firestore. */
  get useApiBackend(): boolean {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(USE_API_BACKEND_KEY);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    }
    return true;
  },

  setUseApiBackend(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(USE_API_BACKEND_KEY, String(enabled));
  },
};

export type ApiDataSource = 'api' | 'firestore';
