import { Injectable, inject, signal } from '@angular/core';
import { DriveFolderSeedService } from './drive-folder-seed.service';
import { BudgetSeedService } from './budget-seed.service';
import { SubcontractorSeedService } from './subcontractor-seed.service';
import { ProjectCostsService } from './project-costs.service';
import { ImportReviewService } from './import-review.service';
import { auth } from '../firebase';

@Injectable({ providedIn: 'root' })
export class ImportSeedService {
  private driveSeed = inject(DriveFolderSeedService);
  private budgetSeed = inject(BudgetSeedService);
  private subcontractorDiscovery = inject(SubcontractorSeedService);
  private projectCosts = inject(ProjectCostsService);
  private importReview = inject(ImportReviewService);

  running = signal(false);
  lastMessage = signal<string | null>(null);
  sourceWarnings = signal<string[]>([]);

  /** Initialize source review without importing bundled dev/demo files. */
  async importAllIfNeeded(_force = false): Promise<void> {
    if (!auth.currentUser) return;
    this.checkSourceAvailability();
    try {
      await this.subcontractorDiscovery.importIfNeeded();
    } catch {
      // optional cache of QB cost transactions
    }
  }

  checkSourceAvailability(): void {
    const warnings: string[] = [];
    if (this.driveSeed.seedMeta.source.includes('partial')) {
      warnings.push('Drive folder CSV not linked — add clean_project_root_folder_ids.csv and link folders in Settings → Drive Folders.');
    }
    if (!this.budgetSeed.budgetImportMeta().projectCount) {
      warnings.push('No budget workbooks imported yet — import actual job budget workbooks in Settings → Job Cost Budgets.');
    }
    if (!this.subcontractorDiscovery.sourceDataAvailable()) {
      warnings.push('QuickBooks sync workbook not loaded — re-sync in Import Review before discovering subcontractors.');
    }
    this.sourceWarnings.set(warnings);
  }

  async runFullImport(options: {
    driveActive?: boolean;
    driveClosed?: boolean;
    driveForce?: boolean;
    budgets?: boolean;
    subcontractors?: boolean;
    projectCosts?: boolean;
  } = {}): Promise<void> {
    if (!auth.currentUser) throw new Error('Sign in to run source imports.');

    this.running.set(true);
    this.checkSourceAvailability();
    const parts: string[] = [];

    try {
      if (options.driveActive ?? true) {
        const active = await this.driveSeed.syncDriveFolderIds(false, 'active');
        parts.push(`Drive active: ${active.updated} linked`);
        this.importReview.logRun({
          label: 'Drive folders (active)',
          created: active.updated,
          updated: 0,
          skipped: active.skippedExisting,
          exceptions: active.unmatched.length,
          message: this.driveSeed.lastMessage() ?? undefined,
        });
      }

      if (options.driveClosed) {
        const closed = await this.driveSeed.syncDriveFolderIds(false, 'closed');
        parts.push(`Drive closed: ${closed.updated} linked`);
        this.importReview.logRun({
          label: 'Drive folders (closed/archive)',
          created: closed.updated,
          updated: 0,
          skipped: closed.skippedExisting,
          exceptions: closed.unmatched.length,
        });
      }

      if (options.driveForce) {
        const all = await this.driveSeed.syncDriveFolderIds(true, 'all');
        parts.push(`Drive force: ${all.updated} linked`);
      }

      if (options.budgets ?? true) {
        await this.budgetSeed.syncJobCostBudgets();
        parts.push(this.budgetSeed.lastMessage() ?? 'Budget workbooks imported');
        this.importReview.logRun({
          label: 'Budget workbooks',
          created: 0,
          updated: this.budgetSeed.budgetImportMeta().projectCount,
          skipped: 0,
          exceptions: 0,
          message: this.budgetSeed.lastMessage() ?? undefined,
        });
      }

      if (options.subcontractors ?? true) {
        const sub = await this.subcontractorDiscovery.discoverFromSources(false);
        parts.push(`Subs discovered: ${sub.created} new, ${sub.projectSubs} project links`);
        this.importReview.logRun({
          label: 'Subcontractor discovery (QuickBooks / Drive)',
          created: sub.created,
          updated: sub.updated,
          skipped: 0,
          exceptions: 0,
        });
      }

      if (options.projectCosts ?? true) {
        const costs = await this.projectCosts.syncFromProjectCosts();
        await this.projectCosts.loadTransactionsIfNeeded();
        parts.push(`Costs: ${costs.updated} projects`);
        this.importReview.logRun({
          label: 'Project cost detail',
          created: 0,
          updated: costs.updated,
          skipped: costs.skipped,
          exceptions: costs.unmatched.length,
          message: this.projectCosts.lastSyncMessage() ?? undefined,
        });
      }

      if (this.sourceWarnings().length) {
        parts.push(`${this.sourceWarnings().length} source warning(s)`);
      }

      this.lastMessage.set(parts.join(' · '));
    } finally {
      this.running.set(false);
    }
  }
}
