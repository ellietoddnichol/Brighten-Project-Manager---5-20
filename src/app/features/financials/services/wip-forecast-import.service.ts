import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { Project } from '@app/models/types';
import { ARRecord } from '@app/models/financial.types';
import {
  WipForecastArRow,
  WipForecastImportResult,
  WipForecastProjectRow,
  WipForecastSeed,
} from '@app/models/wip-forecast.types';
import forecastSeed from '@app/data/seeds/wip-forecast-may-2026-seed.json';
import { findProjectMatches } from '@features/projects/utils/project-dedupe';
import {
  inferImportedProjectCreateFields,
  mergeImportProjectPatch,
  sanitizeImportProjectPatch,
  shouldApplyImportFinancialPatch,
  shouldCreateProjectFromImport,
} from '@shared/utils/lifecycle-import.guard';
import {
  arForecastImportKey,
  derivePrimaryAgingBucket,
  isWaitingOnArStatus,
  normalizeWipForecastCustomer,
  projectNameFromForecastRow,
  projectPatchFromWipForecastRow,
  wipForecastImportKey,
} from '@features/financials/utils/wip-forecast.parse';
import { isOpenArRecord } from '@features/financials/utils/wip.compute';

@Injectable({ providedIn: 'root' })
export class WipForecastImportService {
  private data = inject(DataService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  running = signal(false);
  lastMessage = signal<string | null>(null);

  seed(): WipForecastSeed {
    return forecastSeed as WipForecastSeed;
  }

  async importFromSeed(): Promise<WipForecastImportResult> {
    if (this.running()) {
      return emptyResult();
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: WipForecastImportResult = {
      projectsPatched: 0,
      projectsCreated: 0,
      arCreated: 0,
      arUpdated: 0,
      arClosed: 0,
      exceptions: 0,
      unmatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      const seed = this.seed();
      let projects = this.data.projectsSnapshot();
      const projectByJob = new Map<string, Project>();

      for (const row of seed.projects) {
        if (!row.jobNumber) continue;
        const project = await this.ensureProject(row, projects, result);
        if (!project) {
          result.unmatched++;
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'WipForecast',
            jobNumber: row.jobNumber,
            sourceFileName: seed.meta.sourceFile,
            message: `WIP forecast row could not match J${row.jobNumber} ${row.projectLabel ?? ''}`,
          });
          result.exceptions++;
          continue;
        }
        projectByJob.set(row.jobNumber, project);
        projects = this.data.projectsSnapshot();
      }

      for (const row of seed.arAging) {
        if (!row.jobNumber) continue;
        const project = projectByJob.get(row.jobNumber)
          ?? this.findProject(projects, row.jobNumber);
        if (!project) {
          result.unmatched++;
          continue;
        }
        await this.upsertArRow(row, project, seed.meta.asOfDate, result);
      }

      for (const row of seed.projects) {
        if (!row.jobNumber || (row.openAr ?? 0) <= 0) continue;
        if (seed.arAging.some(a => a.jobNumber === row.jobNumber)) continue;
        const project = projectByJob.get(row.jobNumber);
        if (!project) continue;
        await this.upsertArFromForecastRow(row, project, seed.meta.asOfDate, result);
      }

      this.lastMessage.set(
        `WIP forecast (${seed.meta.asOfDate}): ${result.projectsCreated} projects created, `
        + `${result.projectsPatched} updated, ${result.arCreated + result.arUpdated} AR rows synced.`,
      );
      this.importReview.logRun({
        label: 'WIP Forecast workbook',
        created: result.projectsCreated + result.arCreated,
        updated: result.projectsPatched + result.arUpdated,
        skipped: 0,
        exceptions: result.exceptions,
        message: this.lastMessage() ?? undefined,
      });
      return result;
    } finally {
      this.running.set(false);
    }
  }

  private async ensureProject(
    row: WipForecastProjectRow,
    projects: Project[],
    result: WipForecastImportResult,
  ): Promise<Project | null> {
    let match = this.findProject(projects, row.jobNumber!);
    if (!match && shouldCreateProjectFromImport(row.jobNumber!)) {
      try {
        const created = await firstValueFrom(this.data.createProject({
          projectNumber: row.jobNumber!,
          projectName: projectNameFromForecastRow(row),
          customer: normalizeWipForecastCustomer(row.customer) ?? 'Brighten Builders LLC',
          ...inferImportedProjectCreateFields(row.jobNumber!),
          ...sanitizeImportProjectPatch(projectPatchFromWipForecastRow(row)),
        }));
        match = created as Project;
        result.projectsCreated++;
        return match;
      } catch {
        return null;
      }
    }
    if (!match) return null;

    const snap = this.lifecycle.forProject(match);
    if (!shouldApplyImportFinancialPatch(match, snap)) return match;

    const incoming = projectPatchFromWipForecastRow(row);
    const { patch, conflicts } = mergeImportProjectPatch(match, incoming);
    for (const c of conflicts) {
      this.importReview.addException({
        type: 'importFieldConflict',
        source: 'WipForecast',
        jobNumber: row.jobNumber,
        sourceFileName: this.seed().meta.sourceFile,
        message: `WIP forecast skipped manual ${String(c.field)} on J${row.jobNumber}`,
      });
      result.exceptions++;
    }
    if (Object.keys(patch).length) {
      await firstValueFrom(this.data.updateProject(match.id, patch));
      result.projectsPatched++;
    }
    return { ...match, ...patch };
  }

  private async upsertArRow(
    row: WipForecastArRow,
    project: Project,
    asOfDate: string,
    result: WipForecastImportResult,
  ): Promise<void> {
    const total = row.totalOpen ?? 0;
    const sourceRowId = arForecastImportKey(row.jobNumber!);
    const existing = this.data.arRecordsSnapshot().find(r =>
      r.sourceRowId === sourceRowId
      || (r.source === 'WipForecast' && r.projectId === project.id && r.invoiceNumber === 'Forecast Summary'),
    );

    if (total <= 0) {
      if (existing && isOpenArRecord(existing.status)) {
        await firstValueFrom(this.data.updateArRecord(existing.id, {
          status: 'Paid',
          openBalance: 0,
          paidAmount: existing.originalAmount,
          collectionStatus: 'Closed',
        }));
        result.arClosed++;
      }
      return;
    }

    const payload: Partial<ARRecord> = {
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      customer: normalizeWipForecastCustomer(project.customer),
      invoiceNumber: 'Forecast Summary',
      invoiceDate: asOfDate,
      dueDate: asOfDate,
      originalAmount: total,
      paidAmount: 0,
      openBalance: total,
      agingBucket: derivePrimaryAgingBucket(row),
      status: 'Open',
      collectionStatus: existing?.collectionStatus ?? 'NotStarted',
      source: 'WipForecast',
      sourceRowId,
      currentAmount: row.currentAmount ?? 0,
      days1To30: row.days1To30 ?? 0,
      days31To60: row.days31To60 ?? 0,
      days61To90: row.days61To90 ?? 0,
      days90Plus: row.days90Plus ?? 0,
      totalOpen: total,
      lastSyncedAt: new Date().toISOString(),
      notes: row.treatment ?? (isWaitingOnArStatus(row.status) ? 'Collections only' : 'Open receivable'),
    };

    if (existing) {
      await firstValueFrom(this.data.updateArRecord(existing.id, payload));
      result.arUpdated++;
    } else {
      await firstValueFrom(this.data.createArRecord(payload));
      result.arCreated++;
    }

    if ((project.currentAR ?? 0) !== total) {
      await firstValueFrom(this.data.updateProject(project.id, { currentAR: total }));
    }
  }

  private async upsertArFromForecastRow(
    row: WipForecastProjectRow,
    project: Project,
    asOfDate: string,
    result: WipForecastImportResult,
  ): Promise<void> {
    await this.upsertArRow(
      {
        jobNumber: row.jobNumber,
        projectLabel: row.projectLabel,
        status: row.status,
        totalOpen: row.openAr,
        currentAmount: row.openAr,
      },
      project,
      asOfDate,
      result,
    );
  }

  private findProject(projects: Project[], jobNumber: string): Project | undefined {
    const matches = findProjectMatches(projects, { projectNumber: jobNumber });
    return matches[0];
  }
}

function emptyResult(): WipForecastImportResult {
  return {
    projectsPatched: 0,
    projectsCreated: 0,
    arCreated: 0,
    arUpdated: 0,
    arClosed: 0,
    exceptions: 0,
    unmatched: 0,
  };
}
