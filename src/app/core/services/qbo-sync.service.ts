import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import qboBundle from '@app/data/qbo-reports-seed.json';
import { QboReportsBundle } from '@app/data/qbo-reports.types';
import { auth } from '@app/firebase';
import { DataService } from '@core/services/data.service';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { qboRecordToProjectUpdate } from '@shared/utils/qbo-reports-mapper';

const QBO_DATA = qboBundle as QboReportsBundle;

export interface QboSyncResult {
  updated: number;
  skipped: number;
  unmatched: string[];
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class QboSyncService {
  private dataService = inject(DataService);

  syncing = signal(false);
  lastSyncAt = signal<string | null>(null);
  lastSyncMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);

  qboMeta = QBO_DATA.meta;
  recordCount = QBO_DATA.records.length;

  async syncFromQboReports(): Promise<QboSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before syncing QuickBooks reports.');
    }
    if (this.syncing()) {
      throw new Error('QBO sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      const projects = await this.dataService.waitForProjectsLoaded();
      const syncedAt = new Date().toISOString();
      let updated = 0;
      let skipped = 0;
      const unmatched: string[] = [];

      for (const record of QBO_DATA.records) {
        let matches = findProjectMatches(projects, {
          projectNumber: record.jobNumber ?? undefined,
          projectName: record.qboLabel,
        });

        if (!matches.length && record.slug && record.slug !== record.jobNumber) {
          const byName = projects.filter(p =>
            p.projectName?.trim().toLowerCase() === record.slug,
          );
          if (byName.length) matches = byName;
        }

        if (!matches.length) {
          unmatched.push(record.qboLabel);
          skipped++;
          continue;
        }

        const project = pickCanonicalProject(matches);
        const payload = qboRecordToProjectUpdate(record, syncedAt);
        await firstValueFrom(this.dataService.updateProject(project.id, payload));
        updated++;
      }

      const result: QboSyncResult = {
        updated,
        skipped,
        unmatched,
        syncedAt,
      };

      this.lastSyncAt.set(syncedAt);
      const unmatchedNote = unmatched.length
        ? ` ${unmatched.length} QBO job${unmatched.length === 1 ? '' : 's'} not matched in app (${unmatched.slice(0, 3).join('; ')}${unmatched.length > 3 ? '…' : ''}).`
        : '';
      this.lastSyncMessage.set(
        `Synced QBO actuals for ${updated} project${updated === 1 ? '' : 's'} (as of ${QBO_DATA.meta.asOfDate}).${unmatchedNote}`,
      );

      return result;
    } catch (error: any) {
      const message = error?.message ?? 'QuickBooks sync failed.';
      this.lastSyncError.set(message);
      throw error;
    } finally {
      this.syncing.set(false);
    }
  }
}
