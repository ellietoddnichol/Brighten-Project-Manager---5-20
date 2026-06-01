import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PO_SHEET } from '../config/po-sheet.config';
import { Project } from '../models/types';
import { auth } from '../firebase';
import { DataService } from './data.service';
import { SheetsService } from './sheets.service';
import { normalizeJobKey, parseJobLabel } from '../utils/master-sheet-parser';
import { parsePoSheetRows, parsedPoToFirestore } from '../utils/po-sheet-parser';

export interface PoSheetSyncResult {
  updated: number;
  created: number;
  skippedNoProject: number;
  sheetName: string;
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class PoSheetSyncService {
  private dataService = inject(DataService);
  private sheetsService = inject(SheetsService);

  syncing = signal(false);
  lastSyncAt = signal<string | null>(null);
  lastSyncMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);
  lastSheetName = signal<string | null>(null);

  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private autoSyncStarted = false;

  startAutoSync(): void {
    if (this.autoSyncStarted) return;
    this.autoSyncStarted = true;
    void this.syncFromPoSheet(false);
    this.autoSyncTimer = setInterval(() => void this.syncFromPoSheet(false), PO_SHEET.syncIntervalMs);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.autoSyncStarted = false;
  }

  async syncFromPoSheet(manual = true): Promise<PoSheetSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before syncing the Purchase Order sheet.');
    }
    if (this.syncing()) {
      throw new Error('PO sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      const sheetName = await this.resolveSheetName();
      this.lastSheetName.set(sheetName);

      const rows = await this.sheetsService.getValues(
        PO_SHEET.spreadsheetId,
        `'${sheetName}'!A:M`,
      );

      const parsed = parsePoSheetRows(rows);
      const syncedAt = new Date().toISOString();
      const sheetUrl = `${PO_SHEET.url}#gid=${PO_SHEET.primaryGid}`;

      const [projects, existingPos] = await Promise.all([
        firstValueFrom(this.dataService.getProjects()),
        firstValueFrom(this.dataService.getPOs()),
      ]);

      const projectByKey = this.buildProjectLookup(projects);
      const poByNumber = new Map<string, typeof existingPos[number]>();
      for (const po of existingPos) {
        if (po.poNumber) {
          poByNumber.set(this.normalizePoNumber(po.poNumber), po);
        }
      }

      let updated = 0;
      let created = 0;
      let skippedNoProject = 0;

      for (const row of parsed) {
        const project = this.findProjectForJob(row.jobIdLabel, row.projectNumber, projectByKey, projects);
        if (!project) {
          skippedNoProject++;
          continue;
        }

        const payload = parsedPoToFirestore(row, project.id, syncedAt, sheetUrl, project);
        const existing = poByNumber.get(this.normalizePoNumber(row.poNumber));

        if (existing) {
          await firstValueFrom(this.dataService.updatePO(existing.id, payload));
          updated++;
        } else {
          const createdPo = await firstValueFrom(this.dataService.createPO(payload));
          poByNumber.set(this.normalizePoNumber(row.poNumber), createdPo);
          created++;
        }
      }

      const result: PoSheetSyncResult = {
        updated,
        created,
        skippedNoProject,
        sheetName,
        syncedAt,
      };

      this.lastSyncAt.set(syncedAt);
      this.lastSyncMessage.set(
        manual
          ? `Synced ${updated + created} POs from "${sheetName}" (${skippedNoProject} skipped — no matching project).`
          : `Auto-synced ${updated + created} POs from "${sheetName}".`,
      );
      return result;
    } catch (error: any) {
      const message = error?.message ?? 'Purchase Order sheet sync failed.';
      this.lastSyncError.set(message);
      throw error;
    } finally {
      this.syncing.set(false);
    }
  }

  private async resolveSheetName(): Promise<string> {
    try {
      const sheets = await this.sheetsService.getSpreadsheetSheets(PO_SHEET.spreadsheetId);
      const match = sheets.find(s => s.sheetId === PO_SHEET.primaryGid);
      if (match?.title) return match.title;
    } catch {
      // fall through to static names
    }

    for (const name of PO_SHEET.fallbackSheetNames) {
      try {
        await this.sheetsService.getValues(PO_SHEET.spreadsheetId, `'${name}'!A1:M1`);
        return name;
      } catch {
        // try next
      }
    }

    return PO_SHEET.fallbackSheetNames[0];
  }

  private normalizePoNumber(value: string): string {
    const raw = value.trim();
    const n = Number(raw);
    if (Number.isFinite(n) && !raw.includes('-')) {
      return String(Math.trunc(n));
    }
    return raw;
  }

  private buildProjectLookup(projects: Project[]): Map<string, Project> {
    const map = new Map<string, Project>();
    for (const project of projects) {
      map.set(normalizeJobKey(project.projectNumber), project);
      map.set(normalizeJobKey(`${project.projectNumber} - ${project.projectName}`), project);
      if (project.masterSheetJobId) {
        map.set(normalizeJobKey(project.masterSheetJobId), project);
      }
    }
    return map;
  }

  private findProjectForJob(
    jobIdLabel: string,
    projectNumber: string,
    byKey: Map<string, Project>,
    projects: Project[],
  ): Project | undefined {
    const keys = [
      normalizeJobKey(jobIdLabel),
      normalizeJobKey(projectNumber),
    ];
    for (const key of keys) {
      const match = byKey.get(key);
      if (match) return match;
    }

    const { projectName } = parseJobLabel(jobIdLabel);
    return projects.find(p =>
      p.projectNumber === projectNumber ||
      normalizeJobKey(p.projectName) === normalizeJobKey(projectName),
    );
  }
}
