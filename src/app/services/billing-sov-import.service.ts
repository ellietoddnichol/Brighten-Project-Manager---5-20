import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { ImportDataService } from './import-data.service';
import { ImportReviewService } from './import-review.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { Billing, Project } from '../models/types';
import {
  BillingSovImportResult,
  BillingSovReviewItem,
  BillingSovSeed,
  BillingSovSummaryRow,
} from '../models/billing-sov-import.types';
import billingSovSeed from '../data/seeds/billing-sov-may-2026-seed.json';
import { findProjectMatches } from '../utils/project-dedupe';
import { normalizeJobNumber } from '../config/active-2026-jobs.config';
import {
  mergeImportProjectPatch,
  shouldApplyImportFinancialPatch,
} from '../utils/lifecycle-import.guard';

function billingImportKey(jobNumber: string, payAppNumber: string): string {
  return `billing-sov|${normalizeJobNumber(jobNumber)}|${payAppNumber.trim()}`;
}

function mapBillingStatus(raw?: string): Billing['status'] {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('waiting on a/r') || s.includes('waiting on ar')) return 'Invoiced';
  if (s.includes('paid')) return 'Paid';
  if (s.includes('approved')) return 'Approved';
  if (s.includes('past due')) return 'Past Due';
  if (s.includes('void')) return 'Void';
  return 'Submitted';
}

@Injectable({ providedIn: 'root' })
export class BillingSovImportService {
  private data = inject(DataService);
  private importData = inject(ImportDataService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  running = signal(false);
  lastMessage = signal<string | null>(null);

  seed(): BillingSovSeed {
    return billingSovSeed as BillingSovSeed;
  }

  async importFromSeed(): Promise<BillingSovImportResult> {
    if (this.running()) {
      return emptyResult();
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: BillingSovImportResult = {
      billingsCreated: 0,
      billingsUpdated: 0,
      sovLinesUpserted: 0,
      projectsPatched: 0,
      exceptions: 0,
      unmatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      const seed = this.seed();
      const projects = this.data.projectsSnapshot();
      const sourceFile = seed.meta.sourceFile;

      for (const row of seed.billingSummaries) {
        const project = this.findProject(projects, row.jobNumber);
        if (!project) {
          result.unmatched++;
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'BillingSovWorkbook',
            jobNumber: row.jobNumber,
            sourceFileName: sourceFile,
            message: `Billing/SOV import could not match J${row.jobNumber} ${row.projectName ?? ''}`,
          });
          result.exceptions++;
          continue;
        }

        await this.upsertBilling(row, project, result);
        await this.patchProjectFromSummary(row, project, result);
      }

      const sovPayload = seed.sovLines
        .map(line => {
          const project = this.findProject(projects, line.jobNumber);
          return {
            projectId: project?.id,
            jobNumber: normalizeJobNumber(line.jobNumber),
            payAppNumber: line.payAppNumber,
            lineNumber: line.lineNumber,
            costCode: line.costCode,
            description: line.description,
            scheduledValue: line.scheduledValue,
            previousCompleted: line.previousCompleted,
            thisPeriod: line.thisPeriod,
            storedMaterials: line.storedMaterials,
            percentComplete: line.percentComplete,
            billedAmount: line.totalCompleted,
            remainingAmount: line.balanceToFinish,
            retainage: line.retainage,
            categoryGuess: line.categoryGuess,
            confidence: line.confidence,
            reviewNote: line.reviewNote,
            sourceFileName: line.sourceFileName ?? sourceFile,
            sourceSheetName: 'SOV Lines Import',
          };
        });

      this.importData.upsertSovLines(sovPayload);
      result.sovLinesUpserted = sovPayload.length;

      for (const job of new Set(seed.sovLines.filter(l => l.confidence === 'Medium').map(l => l.jobNumber))) {
        this.importReview.addException({
          type: 'billingSovReview',
          source: 'BillingSovWorkbook',
          jobNumber: job,
          sourceFileName: sourceFile,
          message: `J${job}: SOV lines imported at Medium confidence — review scanned/OCR source before locking`,
        });
        result.exceptions++;
      }

      for (const item of seed.reviewItems) {
        this.addReviewException(item, sourceFile, result);
      }

      for (const row of seed.billingSummaries) {
        if (row.appContractOverride != null && row.payAppContractSum != null
          && row.appContractOverride !== row.payAppContractSum) {
          this.importReview.addException({
            type: 'payAppContractMismatch',
            source: 'BillingSovWorkbook',
            jobNumber: row.jobNumber,
            sourceFileName: row.sourceFileName ?? sourceFile,
            message: `J${row.jobNumber}: pay app contract $${row.payAppContractSum.toLocaleString()} vs app override $${row.appContractOverride.toLocaleString()} — stored separately`,
          });
          result.exceptions++;
        }
      }

      this.lastMessage.set(
        `Billing/SOV import (${seed.meta.asOfDate}): ${result.billingsCreated} pay apps created, `
        + `${result.billingsUpdated} updated, ${result.sovLinesUpserted} SOV lines, `
        + `${result.projectsPatched} project(s) patched`
        + (result.unmatched ? `, ${result.unmatched} unmatched` : '')
        + (result.exceptions ? `, ${result.exceptions} review item(s)` : ''),
      );

      this.importReview.logRun({
        label: 'Billing / SOV baseline (May 2026)',
        created: result.billingsCreated + result.sovLinesUpserted,
        updated: result.billingsUpdated + result.projectsPatched,
        skipped: 0,
        exceptions: result.exceptions,
        message: this.lastMessage() ?? undefined,
      });

      return result;
    } finally {
      this.running.set(false);
    }
  }

  private async upsertBilling(
    row: BillingSovSummaryRow,
    project: Project,
    result: BillingSovImportResult,
  ): Promise<void> {
    const importSourceKey = billingImportKey(row.jobNumber, row.payAppNumber);
    const existing = this.data.billingsSnapshot().find(b =>
      b.importSourceKey === importSourceKey
      || (b.projectId === project.id && b.payAppNumber === row.payAppNumber),
    );

    const periodLabel = row.periodStart && row.periodEnd
      ? `${row.periodStart} – ${row.periodEnd}`
      : row.periodEnd ?? row.periodStart ?? '';

    const payload: Partial<Billing> = {
      projectId: project.id,
      payAppNumber: row.payAppNumber,
      billingPeriod: periodLabel,
      billingPeriodStart: row.periodStart ?? undefined,
      billingPeriodEnd: row.periodEnd ?? undefined,
      status: mapBillingStatus(row.billingStatus),
      importSourceKey,
      payAppContractSum: row.payAppContractSum,
      originalContractAmount: row.originalContract,
      approvedChangeOrderAmount: row.netChangeOrders,
      currentContractAmount: row.payAppContractSum,
      scheduledValue: row.sovScheduledTotal ?? row.payAppContractSum,
      previousApplications: row.previousCertificates,
      currentApplication: row.currentDue,
      workCompletedThisPeriod: row.currentDue,
      totalBilledToDate: row.completedToDate,
      completedToDate: row.completedToDate,
      retainageAmount: row.currentRetainage ?? row.retainageToDate,
      retainagePercent: row.retainagePercent != null ? row.retainagePercent * 100 : undefined,
      netDue: row.currentDue,
      balanceToFinishIncludingRetainage: row.balanceToFinish,
      percentCompleteCalculated: row.percentComplete,
      sourceFileName: row.sourceFileName,
      sourceType: row.sourceType,
      billingNotes: row.notes,
      reviewFlag: row.reviewFlag,
      reviewLocked: false,
    };

    if (existing) {
      await firstValueFrom(this.data.updateBilling(existing.id, payload));
      result.billingsUpdated++;
    } else {
      await firstValueFrom(this.data.createBilling(payload));
      result.billingsCreated++;
    }
  }

  private async patchProjectFromSummary(
    row: BillingSovSummaryRow,
    project: Project,
    result: BillingSovImportResult,
  ): Promise<void> {
    const snap = this.lifecycle.forProject(project);
    if (!shouldApplyImportFinancialPatch(project, snap)) return;

    const incoming: Partial<Project> = {
      billedToDate: row.completedToDate,
      wipPercentComplete: row.percentComplete != null ? row.percentComplete * 100 : undefined,
    };

    if (row.retainagePercent != null) {
      incoming.retainagePercent = row.retainagePercent * 100;
    }

    if (row.appContractOverride != null) {
      incoming.originalContractAmount = row.appContractOverride;
    } else if (row.payAppContractSum != null && !project.originalContractAmount) {
      incoming.originalContractAmount = row.payAppContractSum;
    }

    const { patch, conflicts } = mergeImportProjectPatch(project, incoming);
    for (const c of conflicts) {
      this.importReview.addException({
        type: 'importFieldConflict',
        source: 'BillingSovWorkbook',
        jobNumber: row.jobNumber,
        sourceFileName: row.sourceFileName ?? this.seed().meta.sourceFile,
        message: `Billing/SOV import skipped manual ${String(c.field)} on J${row.jobNumber}`,
      });
      result.exceptions++;
    }

    if (Object.keys(patch).length) {
      await firstValueFrom(this.data.updateProject(project.id, patch));
      result.projectsPatched++;
    }
  }

  private addReviewException(
    item: BillingSovReviewItem,
    sourceFile: string,
    result: BillingSovImportResult,
  ): void {
    this.importReview.addException({
      type: 'billingSovReview',
      source: 'BillingSovWorkbook',
      jobNumber: item.jobNumber,
      sourceFileName: sourceFile,
      message: `[${item.priority ?? 'Review'}] J${item.jobNumber}: ${item.issue}`,
    });
    result.exceptions++;
  }

  private findProject(projects: Project[], jobNumber: string): Project | undefined {
    const job = normalizeJobNumber(jobNumber);
    return findProjectMatches(projects, { projectNumber: job })[0];
  }
}

function emptyResult(): BillingSovImportResult {
  return {
    billingsCreated: 0,
    billingsUpdated: 0,
    sovLinesUpserted: 0,
    projectsPatched: 0,
    exceptions: 0,
    unmatched: 0,
  };
}
