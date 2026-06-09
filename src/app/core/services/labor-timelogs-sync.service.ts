import { Injectable, inject, signal } from '@angular/core';
import { SheetsService } from './sheets.service';
import { ApiClientService } from './api/api-client.service';
import { TIME_DATA_SHEET } from '@app/config/time-data-sheet.config';

export interface TimelogSyncResult {
  imported: number;
  skipped: number;
  unmatchedJobs: string[];
}

export interface TimelogSyncRow {
  jobId: string;
  workDate: string;
  employeeName: string;
  classification?: string | null;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class LaborTimelogsSyncService {
  private sheets = inject(SheetsService);
  private api = inject(ApiClientService);

  syncing = signal(false);
  syncError = signal<string | null>(null);
  syncResult = signal<TimelogSyncResult | null>(null);
  lastSyncedAt = signal<string | null>(null);

  /** Default spreadsheet + tab from app config — user can override via the UI. */
  readonly defaultSpreadsheetId = TIME_DATA_SHEET.spreadsheetId;
  readonly defaultTab = 'Timelogs';

  /** Read the Timelogs sheet and import all rows into Cloud SQL labor_entries. */
  async syncFromSheet(
    spreadsheetId = this.defaultSpreadsheetId,
    tabName = this.defaultTab,
    approvedOnly = true,
  ): Promise<TimelogSyncResult> {
    this.syncing.set(true);
    this.syncError.set(null);
    this.syncResult.set(null);

    try {
      const raw = await this.sheets.getValues(spreadsheetId, tabName);
      if (!raw || raw.length < 2) {
        throw new Error('No data rows found in the sheet. Make sure the tab name is correct.');
      }

      const header = raw[0].map(h => h?.trim().toLowerCase() ?? '');
      const rows = this.parseRows(raw.slice(1), header, approvedOnly);

      if (rows.length === 0) {
        throw new Error('No valid rows parsed from the sheet. Check that the tab has data rows.');
      }

      const resp = await this.api.post<{ ok: boolean; imported: number; skipped: number; unmatchedJobs: string[] }>(
        '/api/labor/timelogs-import',
        { rows },
      );

      const result: TimelogSyncResult = {
        imported: resp.imported ?? 0,
        skipped: resp.skipped ?? 0,
        unmatchedJobs: resp.unmatchedJobs ?? [],
      };
      this.syncResult.set(result);
      this.lastSyncedAt.set(new Date().toISOString());
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Timelogs sync failed';
      this.syncError.set(message);
      throw err;
    } finally {
      this.syncing.set(false);
    }
  }

  private parseRows(rows: string[][], header: string[], approvedOnly: boolean): TimelogSyncRow[] {
    // Column index lookup — tolerates minor header variations
    const idx = (names: string[]): number =>
      names.reduce((found, n) => (found >= 0 ? found : header.findIndex(h => h.includes(n))), -1);

    const colDate     = idx(['date']);
    const colName     = idx(['employee name', 'employee']);
    const colJob      = idx(['job id', 'job #', 'job number']);
    const colClass    = idx(['classification']);
    const colReg      = idx(['regular time', 'regular hours', 'reg']);
    const colOT       = idx(['overtime', 'ot hours']);
    const colDT       = idx(['double time', 'dt hours']);
    const colCode     = idx(['labor code', 'code']);
    const colNotes    = idx(['notes']);
    const colApproval = idx(['approval', 'status']);

    const get = (row: string[], col: number): string =>
      col >= 0 ? (row[col] ?? '').trim() : '';

    const toNum = (v: string): number => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };

    const formatDate = (v: string): string => {
      if (!v) return '';
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      // Excel serial number or Date string — parse via JS
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
      return v;
    };

    const results: TimelogSyncRow[] = [];
    for (const row of rows) {
      if (row.every(c => !c)) continue;

      const approval = get(row, colApproval).toLowerCase();
      if (approvedOnly && approval && !approval.includes('approved')) continue;

      const jobRaw = get(row, colJob);
      if (!jobRaw) continue;

      // Skip non-project rows (PTO, OFFICE, SHOP)
      const jobPrefix = jobRaw.split(' - ')[0].trim();
      if (!jobPrefix || !/^\d/.test(jobPrefix)) continue;

      const workDate = formatDate(get(row, colDate));
      if (!workDate) continue;

      const employeeName = get(row, colName);
      if (!employeeName) continue;

      const laborCode = get(row, colCode);
      const notesRaw  = get(row, colNotes);
      const notes = [laborCode, notesRaw].filter(Boolean).join(' | ') || null;

      results.push({
        jobId: jobPrefix,
        workDate,
        employeeName,
        classification: get(row, colClass) || null,
        regularHours:   toNum(get(row, colReg)),
        overtimeHours:  toNum(get(row, colOT)),
        doubleTimeHours: toNum(get(row, colDT)),
        notes,
      });
    }
    return results;
  }
}
