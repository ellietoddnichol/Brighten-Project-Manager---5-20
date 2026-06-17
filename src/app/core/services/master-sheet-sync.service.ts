import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MASTER_SHEET } from '@app/config/master-sheet.config';
import { Project } from '@app/models/types';
import { auth } from '@app/firebase';
import { DataService } from '@core/services/data.service';
import { SheetsService } from '@core/services/sheets.service';
import {
  findTimeForJob,
  masterJobToProjectUpdate,
  normalizeJobKey,
  parseMasterJobRows,
  parseTimelogRows,
} from '@shared/utils/master-sheet-parser';
import { ProjectDedupeService } from '@core/services/project-dedupe.service';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { mergeImportProjectPatch } from '@shared/utils/lifecycle-import.guard';
import { ImportReviewService } from '@core/services/import-review.service';
import { qbSyncConfig } from '@app/config/qb-sync.config';
import { MASTER_SHEET_SYNCED_PROJECT_FIELDS } from '@shared/utils/master-sheet-fields';

/** On manual project updates, only refresh sheet link + timelog hours — not identity fields edited in the app. */
function masterSheetPayloadForUpdate(payload: Partial<Project>): Partial<Project> {
  if (!qbSyncConfig.isManualMode()) return payload;
  const keep = new Set<keyof Project>([
    'masterSheetJobId',
    'masterSheetStatus',
    'masterSheetSyncedAt',
    'masterSheetUrl',
    'regularHours',
    'overtimeHours',
    'doubleTimeHours',
    'totalLaborHours',
    'lastTimelogDate',
    'timelogEntryCount',
  ]);
  const safe = { ...payload };
  for (const field of MASTER_SHEET_SYNCED_PROJECT_FIELDS) {
    if (!keep.has(field)) delete (safe as Record<string, unknown>)[field];
  }
  delete safe.status;
  delete safe.superintendent;
  return safe;
}

export interface MasterSheetSyncResult {
  updated: number;
  created: number;
  withTime: number;
  rowsRead: number;
  rowsImported: number;
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MasterSheetSyncService {
  private dataService = inject(DataService);
  private sheetsService = inject(SheetsService);
  private projectDedupe = inject(ProjectDedupeService);
  private importReview = inject(ImportReviewService);

  syncing = signal(false);
  lastSyncAt = signal<string | null>(null);
  lastSyncMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);
  lastRunStats = signal<{ rowsRead: number; rowsImported: number; errors: string[]; warnings: string[] } | null>(null);

  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private autoSyncStarted = false;

  /** Start periodic read-only sync while the user is signed in. */
  startAutoSync(): void {
    if (this.autoSyncStarted) return;
    this.autoSyncStarted = true;
    void this.syncFromMasterSheet(false);
    this.autoSyncTimer = setInterval(() => void this.syncFromMasterSheet(false), MASTER_SHEET.syncIntervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.autoSyncStarted = false;
  }

  /**
   * Pull latest jobs + timelogs from Google Sheets into Firestore.
   * Never writes back to the spreadsheet.
   */
  async syncFromMasterSheet(manual = true): Promise<MasterSheetSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before syncing the Master Data Sheet.');
    }
    if (this.syncing()) {
      throw new Error('Sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      const [jobRows, timeRows] = await Promise.all([
        this.sheetsService.getValues(
          MASTER_SHEET.spreadsheetId,
          `'${MASTER_SHEET.sheets.masterJobList}'!A:P`,
        ),
        this.sheetsService.getValues(
          MASTER_SHEET.spreadsheetId,
          `'${MASTER_SHEET.sheets.timelogs}'!A:Q`,
        ),
      ]);

      const jobs = parseMasterJobRows(jobRows);
      const timeByJob = parseTimelogRows(timeRows);
      const rowsRead = Math.max(0, jobRows.length - 1) + Math.max(0, timeRows.length - 1);
      const syncedAt = new Date().toISOString();
      let existing = await this.dataService.waitForProjectsLoaded();

      let updated = 0;
      let created = 0;
      let withTime = 0;

      for (const job of jobs) {
        const time = findTimeForJob(job, timeByJob);
        if (time) withTime++;

        const payload = masterJobToProjectUpdate(job, time, syncedAt);
        payload.masterSheetUrl = MASTER_SHEET.url;

        const masterKey = normalizeJobKey(job.masterSheetJobId);
        const matches = findProjectMatches(existing, {
          projectNumber: job.projectNumber,
          masterSheetJobId: job.masterSheetJobId,
          projectName: job.projectName,
        });

        let match = matches.length ? pickCanonicalProject(matches) : undefined;

        if (!match && job.projectNumber) {
          match = existing.find(p =>
            normalizeJobKey(`${p.projectNumber} - ${p.projectName}`) === masterKey ||
            normalizeJobKey(p.projectName) === normalizeJobKey(job.projectName),
          );
        }

        if (match) {
          const incoming = masterSheetPayloadForUpdate(payload);
          const { patch, conflicts } = mergeImportProjectPatch(match, incoming);
          for (const c of conflicts) {
            this.importReview.addException({
              type: 'importFieldConflict',
              source: 'MasterSheet',
              jobNumber: match.projectNumber,
              message: `Master Sheet import skipped manual field ${String(c.field)} (current: ${String(c.currentValue)}, import: ${String(c.incomingValue)})`,
            });
          }
          await firstValueFrom(this.dataService.updateProject(match.id, patch));
          updated++;

          for (const duplicate of matches.filter(p => p.id !== match!.id)) {
            await this.dataService.reassignProjectReferences(duplicate.id, match.id);
            await firstValueFrom(this.dataService.deleteProject(duplicate.id));
            existing = existing.filter(p => p.id !== duplicate.id);
          }
        } else {
          const createdProject = await firstValueFrom(this.dataService.createProject({
            ...payload,
            customer: payload.customer ?? 'Brighten Builders LLC',
          }));
          existing = [...existing, createdProject as Project];
          created++;
        }
      }

      await this.projectDedupe.dedupeProjects();

      const result: MasterSheetSyncResult = {
        updated,
        created,
        withTime,
        rowsRead,
        rowsImported: updated + created,
        syncedAt,
      };
      this.lastSyncAt.set(syncedAt);
      this.lastRunStats.set({ rowsRead, rowsImported: updated + created, errors: [], warnings: [] });
      this.lastSyncMessage.set(
        manual
          ? `Synced ${updated + created} jobs from Master Data Sheet (${withTime} with time logged).`
          : `Auto-synced ${updated + created} jobs (${withTime} with time).`,
      );
      return result;
    } catch (error: any) {
      const message = error?.message ?? 'Master sheet sync failed.';
      this.lastSyncError.set(message);
      throw error;
    } finally {
      this.syncing.set(false);
    }
  }
}
