import { Injectable, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

interface SheetsApiErrorInfo {
  detail: string;
  insufficientScopes: boolean;
}

async function readSheetsApiError(response: Response): Promise<SheetsApiErrorInfo> {
  try {
    const body = await response.json();
    const message = body?.error?.message as string | undefined;
    if (message) {
      const insufficientScopes = response.status === 403 && /insufficient.*(authentication )?scopes/i.test(message);
      if (response.status === 403 && message.includes('has not been used')) {
        return {
          detail: 'Google Sheets API is not enabled. Enable it in Google Cloud Console for project "brighten-project-manager".',
          insufficientScopes: false,
        };
      }
      if (response.status === 403) {
        return { detail: `Sheets access denied — ${message}`, insufficientScopes };
      }
      return { detail: message, insufficientScopes: false };
    }
  } catch {
    // ignore
  }
  return { detail: response.statusText || `HTTP ${response.status}`, insufficientScopes: false };
}

export interface SpreadsheetSheetMeta {
  sheetId: number;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private authService = inject(AuthService);

  /** Read-only — the app never writes to Google Sheets. */
  async getSpreadsheetSheets(spreadsheetId: string, allowRetry = true): Promise<SpreadsheetSheetMeta[]> {
    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Sign in with Google to read Google Sheets.');
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorInfo = await readSheetsApiError(response);
      if ((response.status === 401 || errorInfo.insufficientScopes) && allowRetry) {
        this.authService.clearAccessToken();
        const refreshed = await this.authService.refreshDriveAccess();
        if (!refreshed) {
          throw new Error('Google Sheets session expired or missing permissions. Use Re-authorize Drive in project setup or sign out and back in.');
        }
        return this.getSpreadsheetSheets(spreadsheetId, false);
      }
      throw new Error(`Sheets API error: ${errorInfo.detail}`);
    }

    const data = await response.json();
    return (data.sheets ?? []).map((sheet: { properties?: { sheetId?: number; title?: string } }) => ({
      sheetId: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? '',
    }));
  }

  /** Read-only — the app never writes to Google Sheets. */
  async getValues(spreadsheetId: string, range: string, allowRetry = true): Promise<string[][]> {
    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Sign in with Google to read the Master Data Sheet.');
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorInfo = await readSheetsApiError(response);
      if ((response.status === 401 || errorInfo.insufficientScopes) && allowRetry) {
        this.authService.clearAccessToken();
        const refreshed = await this.authService.refreshDriveAccess();
        if (!refreshed) {
          throw new Error('Google Sheets session expired or missing permissions. Use Re-authorize Drive in project setup or sign out and back in.');
        }
        return this.getValues(spreadsheetId, range, false);
      }
      throw new Error(`Sheets API error: ${errorInfo.detail}`);
    }

    const data = await response.json();
    return (data.values as string[][]) || [];
  }

  /** Append draft rows to certified payroll export sheet only. */
  async appendValues(spreadsheetId: string, range: string, rows: string[][], allowRetry = true): Promise<void> {
    const token = await this.authService.getAccessToken();
    if (!token) {
      throw new Error('Sign in with Google to export certified payroll drafts.');
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    });

    if (!response.ok) {
      const errorInfo = await readSheetsApiError(response);
      if ((response.status === 401 || errorInfo.insufficientScopes) && allowRetry) {
        this.authService.clearAccessToken();
        const refreshed = await this.authService.refreshDriveAccess();
        if (!refreshed) {
          throw new Error('Google Sheets session expired or missing permissions. Use Re-authorize Drive in project setup or sign out and back in.');
        }
        return this.appendValues(spreadsheetId, range, rows, false);
      }
      throw new Error(`Sheets API error: ${errorInfo.detail}`);
    }
  }
}
