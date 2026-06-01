import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TIME_DATA_SHEET } from '../config/time-data-sheet.config';
import { Project } from '../models/types';
import { auth } from '../firebase';
import { DataService } from './data.service';
import { SheetsService } from './sheets.service';
import { normalizeJobKey, parseJobLabel } from '../utils/master-sheet-parser';
import {
  filterTimeEntriesFromDate,
  jobHoursToProjectUpdate,
  lastWorkDateByJob,
  parseAllTimeRows,
  parseEmployeeRows,
  parseJobHoursRows,
  parsedEmployeeToFirestore,
  parsedTimeEntryToFirestore,
} from '../utils/time-data-sheet-parser';
import { isOverheadJob, isOverheadJobLabel } from '../utils/project';

export interface TimeDataSheetSyncResult {
  projectsUpdated: number;
  projectsSkipped: number;
  employeesSynced: number;
  timeEntriesSynced: number;
  timeEntriesSkipped: number;
  rowsRead: number;
  rowsImported: number;
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class TimeDataSheetSyncService {
  private dataService = inject(DataService);
  private sheetsService = inject(SheetsService);

  syncing = signal(false);
  lastSyncAt = signal<string | null>(null);
  lastSyncMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);
  lastRunStats = signal<{ rowsRead: number; rowsImported: number; errors: string[]; warnings: string[] } | null>(null);

  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private autoSyncStarted = false;

  startAutoSync(): void {
    if (this.autoSyncStarted) return;
    this.autoSyncStarted = true;
    void this.syncFromTimeDataSheet(false);
    this.autoSyncTimer = setInterval(
      () => void this.syncFromTimeDataSheet(false),
      TIME_DATA_SHEET.syncIntervalMs,
    );
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.autoSyncStarted = false;
  }

  async syncFromTimeDataSheet(manual = true): Promise<TimeDataSheetSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before syncing the Master Time Data sheet.');
    }
    if (this.syncing()) {
      throw new Error('Time data sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      const [jobHoursRows, allTimeRows, employeeRows] = await Promise.all([
        this.sheetsService.getValues(
          TIME_DATA_SHEET.spreadsheetId,
          `'${TIME_DATA_SHEET.sheets.jobHours}'!A:H`,
        ),
        this.sheetsService.getValues(
          TIME_DATA_SHEET.spreadsheetId,
          `'${TIME_DATA_SHEET.sheets.allTime}'!A:R`,
        ),
        this.sheetsService.getValues(
          TIME_DATA_SHEET.spreadsheetId,
          `'${TIME_DATA_SHEET.sheets.allEmployees}'!A:H`,
        ),
      ]);

      const syncedAt = new Date().toISOString();
      const sheetUrl = `${TIME_DATA_SHEET.url}#gid=${TIME_DATA_SHEET.primaryGid}`;

      const jobHours = parseJobHoursRows(jobHoursRows);
      const allTimeParsed = parseAllTimeRows(allTimeRows);
      const employees = parseEmployeeRows(employeeRows);
      const lastDateByJob = lastWorkDateByJob(allTimeParsed);

      const detailRows = manual
        ? allTimeParsed.filter(row => row.jobIdLabel)
        : filterTimeEntriesFromDate(
            allTimeParsed.filter(row => row.jobIdLabel),
            TIME_DATA_SHEET.autoSyncDetailFromDate,
          );

      const projects = await firstValueFrom(this.dataService.getProjects());
      let projectList = [...projects];
      let projectByKey = this.buildProjectLookup(projectList);

      for (const row of jobHours) {
        if (isOverheadJobLabel(row.jobIdLabel) && !this.findProjectForJob(row.jobIdLabel, row.projectNumber, projectByKey, projectList)) {
          await this.ensureOverheadProject(row.jobIdLabel, projectList, projectByKey);
        }
      }
      for (const row of detailRows) {
        if (row.jobIdLabel && isOverheadJobLabel(row.jobIdLabel) && !this.findProjectForJob(row.jobIdLabel, row.projectNumber ?? '', projectByKey, projectList)) {
          await this.ensureOverheadProject(row.jobIdLabel, projectList, projectByKey);
        }
      }
      projectByKey = this.buildProjectLookup(projectList);

      let projectsUpdated = 0;
      let projectsSkipped = 0;

      for (const row of jobHours) {
        const project = this.findProjectForJob(row.jobIdLabel, row.projectNumber, projectByKey, projectList);
        if (!project) {
          projectsSkipped++;
          continue;
        }

        const lastTimelogDate = lastDateByJob.get(normalizeJobKey(row.jobIdLabel));
        const payload = jobHoursToProjectUpdate(row, syncedAt, sheetUrl, lastTimelogDate);
        await firstValueFrom(this.dataService.updateProject(project.id, payload));
        projectsUpdated++;
      }

      let employeesSynced = 0;
      for (const employee of employees) {
        await this.dataService.upsertEmployee(parsedEmployeeToFirestore(employee, syncedAt, sheetUrl));
        employeesSynced++;
      }

      const timeEntryPayloads = detailRows.map(row => {
        const project = row.jobIdLabel
          ? this.findProjectForJob(row.jobIdLabel, row.projectNumber ?? '', projectByKey, projectList)
          : undefined;
        return parsedTimeEntryToFirestore(row, project?.id, syncedAt, sheetUrl);
      });
      const timeEntriesSynced = await this.dataService.upsertTimeEntries(timeEntryPayloads);

      const result: TimeDataSheetSyncResult = {
        projectsUpdated,
        projectsSkipped,
        employeesSynced,
        timeEntriesSynced,
        timeEntriesSkipped: allTimeParsed.length - detailRows.length,
        rowsRead: Math.max(0, allTimeRows.length - 1) + Math.max(0, jobHoursRows.length - 1),
        rowsImported: timeEntriesSynced + employeesSynced,
        syncedAt,
      };

      this.lastSyncAt.set(syncedAt);
      this.lastRunStats.set({
        rowsRead: result.rowsRead,
        rowsImported: result.rowsImported,
        errors: [],
        warnings: projectsSkipped ? [`${projectsSkipped} job(s) skipped`] : [],
      });
      this.lastSyncMessage.set(
        manual
          ? `Synced ${projectsUpdated} job hour totals, ${employeesSynced} employees, and ${timeEntriesSynced} time entries.`
          : `Auto-synced ${projectsUpdated} jobs and ${timeEntriesSynced} recent time entries.`,
      );
      return result;
    } catch (error: any) {
      const raw = error?.message ?? 'Master Time Data sync failed.';
      const message = /insufficient permissions/i.test(raw)
        ? 'Firestore blocked the sync (rules were updated — refresh the page and try again). If it still fails, sign out and sign back in with Google.'
        : raw.includes('Sheets API') || raw.includes('Sign in with Google')
          ? raw
          : raw;
      this.lastSyncError.set(message);
      throw error;
    } finally {
      this.syncing.set(false);
    }
  }

  private buildProjectLookup(projects: Project[]): Map<string, Project> {
    const map = new Map<string, Project>();
    for (const project of projects) {
      map.set(normalizeJobKey(project.projectNumber), project);
      map.set(normalizeJobKey(`${project.projectNumber} - ${project.projectName}`), project);
      map.set(normalizeJobKey(project.projectName), project);
      if (project.masterSheetJobId) {
        map.set(normalizeJobKey(project.masterSheetJobId), project);
      }
    }
    return map;
  }

  private overheadCode(jobIdLabel: string): string {
    return jobIdLabel.trim().toUpperCase().split(/\s*[-–—]/)[0];
  }

  private async ensureOverheadProject(
    jobIdLabel: string,
    projectList: Project[],
    byKey: Map<string, Project>,
  ): Promise<Project> {
    const code = this.overheadCode(jobIdLabel);
    const existing = this.findProjectForJob(code, code, byKey, projectList);
    if (existing) return existing;

    const created = await firstValueFrom(this.dataService.createProject({
      projectNumber: code,
      projectName: code,
      customer: 'Brighten Builders LLC',
      status: 'Active',
      dashboardGroup: 'Overhead',
      includeOnActiveDashboard: false,
      seedProjectId: `OVERHEAD_${code}`,
      scopeSummary: 'Overhead code — time and PO tracking only (not a field job).',
    }));

    const project = created as Project;
    projectList.push(project);
    byKey.set(normalizeJobKey(code), project);
    byKey.set(normalizeJobKey(`${code} - ${code}`), project);
    byKey.set(normalizeJobKey(code), project);
    return project;
  }

  private findProjectForJob(
    jobIdLabel: string,
    projectNumber: string,
    byKey: Map<string, Project>,
    projects: Project[],
  ): Project | undefined {
    const keys = [normalizeJobKey(jobIdLabel), normalizeJobKey(projectNumber)];
    for (const key of keys) {
      const match = byKey.get(key);
      if (match) return match;
    }

    if (isOverheadJobLabel(jobIdLabel) || isOverheadJobLabel(projectNumber)) {
      const code = this.overheadCode(jobIdLabel || projectNumber);
      return projects.find(p => isOverheadJob(p) && normalizeJobKey(p.projectNumber) === normalizeJobKey(code));
    }

    const { projectName } = parseJobLabel(jobIdLabel);
    return projects.find(p =>
      p.projectNumber === projectNumber ||
      normalizeJobKey(p.projectName) === normalizeJobKey(projectName),
    );
  }
}
