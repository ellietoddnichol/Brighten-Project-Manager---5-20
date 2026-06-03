import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { createLazyJsonLoader } from '@core/utils/mock-data-loader';
import { ProjectCostsSeedBundle, ProjectCostMonthlyLabor, ProjectCostSummary } from '@app/data/project-costs.types';
import { ProjectCostTransactionRecord } from '@app/models/import.types';
import { auth } from '@app/firebase';
import { DataService } from '@core/services/data.service';
import { ImportDataService } from '@core/services/import-data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { projectCostSummaryToProjectUpdate } from '@features/projects/utils/project-costs-parser';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { sanitizeImportProjectPatch, shouldApplyImportFinancialPatch } from '@shared/utils/lifecycle-import.guard';

const projectCostsSeedLoader = createLazyJsonLoader<ProjectCostsSeedBundle>('project-costs-seed.json');

export interface ProjectCostsSyncResult {
  updated: number;
  skipped: number;
  unmatched: string[];
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectCostsService {
  private dataService = inject(DataService);
  private importData = inject(ImportDataService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  syncing = signal(false);
  lastSyncAt = signal<string | null>(null);
  lastSyncMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);

  seedMeta = signal<ProjectCostsSeedBundle['meta'] | null>(null);
  projectCount = signal(0);
  transactionCount = signal(0);
  monthlyLabor = signal<ProjectCostMonthlyLabor[]>([]);
  projectSummaries = signal<ProjectCostSummary[]>([]);
  transactions = signal<ProjectCostTransactionRecord[]>([]);
  transactionsLoaded = signal(false);

  constructor() {
    void this.bootstrapSeed();
  }

  private async bootstrapSeed(): Promise<void> {
    const SEED = await projectCostsSeedLoader.get();
    this.seedMeta.set(SEED.meta);
    this.projectCount.set(SEED.projects.length);
    this.transactionCount.set(SEED.meta.transactionCount ?? 0);
    this.monthlyLabor.set(SEED.monthlyLabor);
    this.projectSummaries.set(SEED.projects);
  }

  async loadTransactionsIfNeeded(): Promise<void> {
    if (this.transactionsLoaded()) return;
    try {
      const resp = await fetch('/mock-data/seeds/project-cost-transactions-seed.json');
      if (!resp.ok) return;
      const data = await resp.json() as { transactions: Array<Record<string, unknown>> };
      this.transactions.set((data.transactions ?? []).map(t => ({
        id: String(t['importKey'] ?? ''),
        source: 'QuickBooksProjectCostDetail' as const,
        jobNumber: t['jobNumber'] as string | undefined,
        projectName: t['projectName'] as string | undefined,
        vendor: t['vendor'] as string | undefined,
        transactionType: t['transactionType'] as string | undefined,
        transactionDate: t['transactionDate'] as string | undefined,
        transactionNumber: t['transactionNumber'] as string | undefined,
        accountType: t['accountType'] as string | undefined,
        account: t['account'] as string | undefined,
        className: t['className'] as string | undefined,
        description: t['description'] as string | undefined,
        amount: Number(t['amount'] ?? 0),
        costCategory: (t['costCategory'] ?? 'Other') as ProjectCostTransactionRecord['costCategory'],
        retainageFlag: Boolean(t['retainageFlag']),
        importKey: String(t['importKey'] ?? ''),
        status: t['costCategory'] === 'Other' ? 'NeedsReview' as const : 'Imported' as const,
      })));
      this.importData.upsertProjectCostTransactions(this.transactions());
      this.transactionsLoaded.set(true);
    } catch {
      // optional runtime load
    }
  }

  getQbLaborActualForProject(projectNo: string, month?: string): number | undefined {
    const normalized = projectNo.replace(/^J/i, '');
    if (month) {
      const row = this.monthlyLabor().find(
        m => m.jobNumber === normalized && m.month === month,
      );
      return row?.laborCost;
    }
    const summary = this.projectSummaries().find(p => p.jobNumber === normalized);
    return summary?.laborCost;
  }

  async syncFromProjectCosts(): Promise<ProjectCostsSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in before syncing project costs detail.');
    }
    if (this.syncing()) {
      throw new Error('Project costs sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);

    try {
      await this.loadTransactionsIfNeeded();
      const SEED = await projectCostsSeedLoader.get();
      const projects = await this.dataService.waitForProjectsLoaded();
      const lifecycleMap = this.lifecycle.snapshotMap();
      const syncedAt = new Date().toISOString();
      let updated = 0;
      let skipped = 0;
      const unmatched: string[] = [];

      for (const summary of SEED.projects) {
        const matches = findProjectMatches(projects, {
          projectNumber: summary.jobNumber,
          projectName: summary.qboLabel,
        });

        if (!matches.length) {
          unmatched.push(summary.qboLabel);
          skipped++;
          continue;
        }

        const project = pickCanonicalProject(matches);
        this.importData.linkTransactionsToProject(summary.jobNumber, project.id);
        const snap = lifecycleMap.get(project.id);
        if (shouldApplyImportFinancialPatch(project, snap)) {
          const payload = sanitizeImportProjectPatch(projectCostSummaryToProjectUpdate(summary, syncedAt));
          await firstValueFrom(this.dataService.updateProject(project.id, payload));
          updated++;
        }
        this.importData.setProjectFlags({
          jobNumber: summary.jobNumber,
          projectId: project.id,
          actualCostsImported: true,
          importedAt: syncedAt,
        });
      }

      const result: ProjectCostsSyncResult = { updated, skipped, unmatched, syncedAt };
      this.lastSyncAt.set(syncedAt);

      const unmatchedNote = unmatched.length
        ? ` ${unmatched.length} QBO job${unmatched.length === 1 ? '' : 's'} not matched (${unmatched.slice(0, 3).join('; ')}${unmatched.length > 3 ? '…' : ''}).`
        : '';

      this.lastSyncMessage.set(
        `Synced QBO project costs for ${updated} project${updated === 1 ? '' : 's'} (${SEED.meta.periodLabel ?? SEED.meta.asOfDate}).${unmatchedNote}`,
      );

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Project costs sync failed';
      this.lastSyncError.set(message);
      throw err;
    } finally {
      this.syncing.set(false);
    }
  }
}
