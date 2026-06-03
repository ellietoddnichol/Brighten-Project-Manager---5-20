import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { Project } from '@app/models/types';
import { ARRecord } from '@app/models/financial.types';
import {
  ArAgingImportResult,
  ArAgingSeed,
  ArAgingSeedRow,
} from '@app/models/ar-aging.types';
import arSeed from '@app/data/seeds/ar-aging-jun-2026-seed.json';
import { findProjectMatches } from '@features/projects/utils/project-dedupe';
import { normalizeJobNumber } from '@app/config/active-2026-jobs.config';
import {
  arAgingSummaryImportKey,
  derivePrimaryAgingBucket,
  normalizeWipForecastCustomer,
} from '@features/financials/utils/wip-forecast.parse';
import { isOpenArRecord } from '@features/financials/utils/wip.compute';

@Injectable({ providedIn: 'root' })
export class ArAgingImportService {
  private data = inject(DataService);

  running = signal(false);
  lastMessage = signal<string | null>(null);

  seed(): ArAgingSeed {
    return arSeed as ArAgingSeed;
  }

  async importFromSeed(): Promise<ArAgingImportResult> {
    if (this.running()) {
      return { arCreated: 0, arUpdated: 0, arClosed: 0, projectsPatched: 0, unmatched: 0 };
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: ArAgingImportResult = {
      arCreated: 0,
      arUpdated: 0,
      arClosed: 0,
      projectsPatched: 0,
      unmatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      const projects = this.data.projectsSnapshot();
      const asOfDate = this.seed().meta.asOfDate;

      for (const row of this.seed().rows) {
        const project = this.findProject(projects, row.jobNumber);
        if (!project) {
          result.unmatched++;
          continue;
        }

        await this.upsertArRow(row, project, asOfDate, result);
      }

      this.lastMessage.set(
        `AR aging import (${asOfDate}): ${result.arCreated} created, ${result.arUpdated} updated`
        + (result.arClosed ? `, ${result.arClosed} closed` : '')
        + (result.projectsPatched ? `, ${result.projectsPatched} project(s) patched` : '')
        + (result.unmatched ? `, ${result.unmatched} unmatched` : ''),
      );
      return result;
    } finally {
      this.running.set(false);
    }
  }

  private async upsertArRow(
    row: ArAgingSeedRow,
    project: Project,
    asOfDate: string,
    result: ArAgingImportResult,
  ): Promise<void> {
    const total = row.total ?? 0;
    const sourceRowId = arAgingSummaryImportKey(row.jobNumber);
    const existing = this.data.arRecordsSnapshot().find(r =>
      r.sourceRowId === sourceRowId
      || (r.source === 'QuickBooksArAging' && r.projectId === project.id && r.invoiceNumber === 'AR Aging Summary'),
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
      projectName: row.projectName ?? project.projectName,
      customer: normalizeWipForecastCustomer(row.customerGroup ?? project.customer),
      invoiceNumber: 'AR Aging Summary',
      invoiceDate: asOfDate,
      dueDate: asOfDate,
      originalAmount: total,
      paidAmount: 0,
      openBalance: total,
      agingBucket: derivePrimaryAgingBucket({
        jobNumber: row.jobNumber,
        currentAmount: row.current,
        days1To30: row.days1To30,
        days31To60: row.days31To60,
        days61To90: row.days61To90,
        days90Plus: row.days90Plus,
        totalOpen: total,
      }),
      status: 'Open',
      collectionStatus: existing?.collectionStatus ?? 'NotStarted',
      source: 'QuickBooksArAging',
      sourceRowId,
      currentAmount: row.current ?? 0,
      days1To30: row.days1To30 ?? 0,
      days31To60: row.days31To60 ?? 0,
      days61To90: row.days61To90 ?? 0,
      days90Plus: row.days90Plus ?? 0,
      totalOpen: total,
      lastSyncedAt: new Date().toISOString(),
      notes: `Imported from ${this.seed().meta.sourceFile}`,
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
      result.projectsPatched++;
    }
  }

  private findProject(projects: Project[], jobNumber: string): Project | undefined {
    const job = normalizeJobNumber(jobNumber);
    return findProjectMatches(projects, { projectNumber: job })[0];
  }
}
