/** Runtime API configuration — no database credentials in the browser. */
const API_BASE_URL_KEY = 'brighten.apiBaseUrl';
const USE_API_BACKEND_KEY = 'brighten.useApiBackend';

const LOCAL_API_BASE_URL = 'http://localhost:8080';
const LOCAL_API_PORT = '8080';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** Dev API always listens on :8080 — never the Angular dev-server port. */
function defaultApiBaseUrl(): string {
  if (typeof window === 'undefined') return LOCAL_API_BASE_URL;
  const { hostname, protocol } = window.location;
  if (isLocalHost(hostname)) return LOCAL_API_BASE_URL;
  return `${protocol}//${hostname}:${LOCAL_API_PORT}`;
}

function isLocalApiUrl(url: string): boolean {
  try {
    return isLocalHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const apiConfig = {
  get baseUrl(): string {
    const fallback = defaultApiBaseUrl();
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(API_BASE_URL_KEY);
      if (stored?.trim()) {
        const normalized = stored.trim().replace(/\/+$/, '');
        if (typeof window !== 'undefined' && !isLocalHost(window.location.hostname) && isLocalApiUrl(normalized)) {
          return fallback;
        }
        return normalized;
      }
    }
    return fallback;
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
