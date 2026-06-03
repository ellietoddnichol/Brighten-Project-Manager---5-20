import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { ImportDataService } from '@core/services/import-data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { Project, ProjectBudgetLine } from '@app/models/types';
import { auth } from '@app/firebase';
import seedBundle from '@app/data/job-cost-budget-seed.json';
import {
  JobCostBudgetProjectSeed,
  JobCostBudgetSeedBundle,
  JobCostPortfolioSummarySeed,
} from '@app/data/job-cost-budget.types';
import { findProjectMatches, normalizeProjectNumber, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import { ProjectBudgetSnapshot } from '@app/models/import.types';
import {
  inferImportedProjectCreateFields,
  sanitizeImportProjectPatch,
  shouldApplyImportFinancialPatch,
  shouldCreateProjectFromImport,
} from '@shared/utils/lifecycle-import.guard';
import { rollupJobCostBudgetLines } from '@features/financials/utils/job-cost-budget-parser';

const SEED = seedBundle as JobCostBudgetSeedBundle;

type BudgetImportBundle = {
  meta: { generatedAt: string; projectCount: number };
  imports: Array<{
    jobNumber: string;
    projectName?: string;
    sourceFileName: string;
    warnings: string[];
    snapshots: Array<Record<string, unknown>>;
    sovLines?: Array<{
      lineNumber?: number;
      description?: string;
      scheduledValue?: number;
      percentComplete?: number;
      billedAmount?: number;
      remainingAmount?: number;
    }>;
    current: JobCostBudgetProjectSeed & { sourceSheetName?: string; sourceFile?: string };
  }>;
};

const BUDGETS_IMPORTED_KEY = 'brighten.jobCostBudgetsImportedAt';

@Injectable({ providedIn: 'root' })
export class BudgetSeedService {
  private dataService = inject(DataService);
  private importData = inject(ImportDataService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);

  seedMeta = SEED.meta;
  budgetImportMeta = signal<{ generatedAt: string; projectCount: number }>({ generatedAt: '', projectCount: 0 });

  private async loadBudgetImportBundle(): Promise<BudgetImportBundle | null> {
    try {
      const resp = await fetch('/data/seeds/budget-import-seed.json');
      if (!resp.ok) return null;
      const bundle = await resp.json() as BudgetImportBundle;
      this.budgetImportMeta.set(bundle.meta);
      return bundle;
    } catch {
      return null;
    }
  }

  /** Import bundled budgets once per seed generation (or when forced). */
  async importIfNeeded(force = false): Promise<void> {
    const marker = localStorage.getItem(BUDGETS_IMPORTED_KEY);
    if (!force && marker === SEED.meta.generatedAt) return;
    await this.syncJobCostBudgets();
    localStorage.setItem(BUDGETS_IMPORTED_KEY, SEED.meta.generatedAt);
  }

  /** Upsert job cost budgets from bundled seed (detailed workbooks + portfolio summary). */
  async syncJobCostBudgets(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in before importing job cost budgets.');

    this.syncing.set(true);
    this.lastMessage.set(null);

    try {
      let projects = await this.dataService.waitForProjectsLoaded();
      let existingLines = await firstValueFrom(this.dataService.getBudgetLines());
      const lifecycleMap = this.lifecycle.snapshotMap();
      const detailedJobNumbers = new Set(SEED.projects.map(p => normalizeProjectNumber(p.jobNumber)));

      let projectsUpdated = 0;
      let projectsCreated = 0;
      let linesWritten = 0;
      let linesRemoved = 0;
      let portfolioUpdated = 0;
      let snapshotsStored = 0;
      let unmatched: string[] = [];

      const budgetImportBundle = await this.loadBudgetImportBundle();
      const budgetImports = budgetImportBundle?.imports ?? [];

      for (const budgetImport of budgetImports) {
        const budget = budgetImport.current;
        budget.jobNumber = budgetImport.jobNumber;
        budget.sourceFile = budgetImport.sourceFileName;
        budget.projectName = budget.projectName ?? budgetImport.projectName;

        this.importData.upsertSnapshots(budgetImport.snapshots.map(s => ({
          jobNumber: budgetImport.jobNumber,
          projectId: undefined,
          sourceFileName: budgetImport.sourceFileName,
          sourceSheetName: String(s['sourceSheetName'] ?? s['snapshotType'] ?? 'Unknown'),
          snapshotType: (s['snapshotType'] ?? 'Original') as ProjectBudgetSnapshot['snapshotType'],
          projectName: budget.projectName,
          contractAmount: Number(s['updatedContract'] ?? budget.updatedContract ?? 0) || undefined,
          totalBudget: Number(s['totalBudget'] ?? s['estCostBudget'] ?? 0) || undefined,
          totalActual: Number(s['totalActual'] ?? s['actualCostToDate'] ?? 0) || undefined,
        })));
        snapshotsStored += budgetImport.snapshots.length;

        for (const w of budgetImport.warnings) {
          this.importReview.addException({
            type: w.includes('CO') ? 'coSheetNeedsReview' : 'budgetImportWarning',
            source: 'BudgetWorkbook',
            jobNumber: budgetImport.jobNumber,
            sourceFileName: budgetImport.sourceFileName,
            message: w,
          });
        }

        this.importData.upsertBudgetRun({
          sourceFileName: budgetImport.sourceFileName,
          jobNumber: budgetImport.jobNumber,
          importStatus: budgetImport.warnings.length ? 'ImportedWithWarnings' : 'Imported',
          importedAt: new Date().toISOString(),
          recordsCreated: budget.lines?.length ?? 0,
          recordsUpdated: 0,
          warnings: budgetImport.warnings,
        });

        let match = this.findProject(projects, budget);
        if (!match && shouldCreateProjectFromImport(budget.jobNumber)) {
          try {
            const created = await firstValueFrom(this.dataService.createProject({
              projectNumber: budget.jobNumber,
              projectName: budget.projectName,
              customer: 'Brighten Builders LLC',
              ...inferImportedProjectCreateFields(budget.jobNumber),
              ...sanitizeImportProjectPatch(this.projectPatchFromDetailedBudget(budget, {} as Project, true)),
            }));
            match = created as Project;
            projects = [...projects, match];
            projectsCreated++;
          } catch {
            unmatched.push(`J${budget.jobNumber} ${budget.projectName}`);
            continue;
          }
        } else if (!match) {
          unmatched.push(`J${budget.jobNumber} ${budget.projectName}`);
          continue;
        }

        this.importData.linkTransactionsToProject(budget.jobNumber, match.id);
        const snap = lifecycleMap.get(match.id);
        if (shouldApplyImportFinancialPatch(match, snap)) {
          await firstValueFrom(this.dataService.updateProject(
            match.id,
            sanitizeImportProjectPatch(this.projectPatchFromDetailedBudget(budget, match, true)),
          ));
          projectsUpdated++;
        } else {
          this.importReview.addException({
            type: 'budgetImportWarning',
            source: 'BudgetWorkbook',
            jobNumber: budget.jobNumber,
            sourceFileName: budgetImport.sourceFileName,
            message: `Imported budget for closed/archive J${budget.jobNumber} — data saved but job stays out of Active scope`,
          });
        }

        const removed = await this.replaceBudgetLines(match.id, budget, existingLines);
        linesRemoved += removed;
        linesWritten += budget.lines?.length ?? 0;
        existingLines = existingLines.filter(
          l => !(l.projectId === match!.id && l.importSource === 'job-cost-budget'),
        );

        const laborBudget = (budget.lines ?? []).filter(l => l.category === 'Labor')
          .reduce((s, l) => s + (l.revisedBudget ?? l.originalBudget ?? 0), 0);
        this.importData.setProjectFlags({
          jobNumber: budget.jobNumber,
          projectId: match.id,
          budgetImported: true,
          laborBudgetImported: laborBudget > 0,
          budgetSourceFile: budgetImport.sourceFileName,
          importedAt: new Date().toISOString(),
        });

        if (budgetImport.sovLines?.length) {
          this.importData.upsertSovLines(budgetImport.sovLines.map(l => ({
            jobNumber: budgetImport.jobNumber,
            projectId: match.id,
            lineNumber: l.lineNumber,
            description: l.description,
            scheduledValue: l.scheduledValue,
            percentComplete: l.percentComplete,
            billedAmount: l.billedAmount,
            remainingAmount: l.remainingAmount ?? l.scheduledValue,
            sourceFileName: budgetImport.sourceFileName,
            sourceSheetName: 'SOV',
          })));
        }
      }

      for (const budget of SEED.projects) {
        if (budgetImports.some(i => i.jobNumber === budget.jobNumber)) continue;
        let match = this.findProject(projects, budget);
        if (!match && shouldCreateProjectFromImport(budget.jobNumber)) {
          try {
            const created = await firstValueFrom(this.dataService.createProject({
              projectNumber: budget.jobNumber,
              projectName: budget.projectName,
              customer: 'Brighten Builders LLC',
              ...inferImportedProjectCreateFields(budget.jobNumber),
              ...sanitizeImportProjectPatch(this.projectPatchFromDetailedBudget(budget, {} as Project, true)),
            }));
            match = created as Project;
            projects = [...projects, match];
            projectsCreated++;
          } catch {
            unmatched.push(`J${budget.jobNumber} ${budget.projectName}`);
            continue;
          }
        } else if (!match) {
          unmatched.push(`J${budget.jobNumber} ${budget.projectName}`);
          continue;
        } else {
          const snap = lifecycleMap.get(match.id);
          if (shouldApplyImportFinancialPatch(match, snap)) {
            await firstValueFrom(this.dataService.updateProject(
              match.id,
              sanitizeImportProjectPatch(this.projectPatchFromDetailedBudget(budget, match, true)),
            ));
            projectsUpdated++;
          }
        }

        const removed = await this.replaceBudgetLines(match.id, budget, existingLines);
        linesRemoved += removed;
        linesWritten += budget.lines.length;
        existingLines = existingLines.filter(
          l => !(l.projectId === match!.id && l.importSource === 'job-cost-budget'),
        );
      }

      for (const summary of SEED.portfolioSummaries) {
        if (detailedJobNumbers.has(normalizeProjectNumber(summary.jobNumber))) continue;

        const match = this.findProject(projects, summary);
        if (!match) continue;

        await firstValueFrom(this.dataService.updateProject(match.id, this.projectPatchFromPortfolioSummary(summary, match)));
        portfolioUpdated++;
      }

      const parts = [
        `${projectsUpdated + projectsCreated} job budget${projectsUpdated + projectsCreated === 1 ? '' : 's'} loaded`,
        `${linesWritten} breakdown line${linesWritten === 1 ? '' : 's'}`,
        `${snapshotsStored} snapshot${snapshotsStored === 1 ? '' : 's'} stored`,
      ];
      if (projectsCreated) parts.push(`${projectsCreated} project${projectsCreated === 1 ? '' : 's'} created`);
      if (portfolioUpdated) parts.push(`${portfolioUpdated} portfolio summaries applied`);
      if (linesRemoved) parts.push(`${linesRemoved} old import lines replaced`);
      if (unmatched.length) {
        parts.push(`${unmatched.length} unmatched: ${unmatched.slice(0, 3).join('; ')}${unmatched.length > 3 ? '…' : ''}`);
      }

      this.lastMessage.set(parts.join(' · '));
    } finally {
      this.syncing.set(false);
    }
  }

  private findProject(
    projects: Project[],
    ref: JobCostBudgetProjectSeed | JobCostPortfolioSummarySeed,
  ): Project | undefined {
    const matches = findProjectMatches(projects, {
      projectNumber: ref.jobNumber,
    });
    return matches.length ? pickCanonicalProject(matches) : undefined;
  }

  private projectPatchFromDetailedBudget(
    budget: JobCostBudgetProjectSeed,
    existing: Project,
    fromImport = false,
  ): Partial<Project> {
    const patch: Partial<Project> = {
      estCostBudget: budget.estCostBudget,
      actualCostToDate: budget.actualCostToDate,
      estLaborCost: budget.estLaborCost,
      estMaterialCost: budget.estMaterialCost,
      estSubCost: budget.estSubCost,
      estOtherCost: budget.estOtherCost,
      forecastGP: budget.estimatedProfit,
      forecastMargin: budget.estimatedMargin,
      wipPercentComplete: budget.percentComplete,
    };

    if (budget.updatedContract && (fromImport || !existing.originalContractAmount)) {
      patch.originalContractAmount = budget.updatedContract;
    }

    if (budget.estCostBudget != null && budget.actualCostToDate != null) {
      patch.wipCostToComplete = Math.max(0, budget.estCostBudget - budget.actualCostToDate);
    } else if (budget.estCostBudget != null && budget.actualCostToDate == null) {
      patch.wipCostToComplete = budget.estCostBudget;
    }

    if (budget.projectName && (!existing.projectName?.trim() || fromImport)) {
      patch.projectName = budget.projectName;
    }

    return patch;
  }

  private projectPatchFromPortfolioSummary(
    summary: JobCostPortfolioSummarySeed,
    existing: Project,
  ): Partial<Project> {
    const patch: Partial<Project> = {};

    if (summary.estTotalCost != null) patch.estCostBudget = summary.estTotalCost;
    if (summary.currentCost != null) patch.actualCostToDate = summary.currentCost;
    if (summary.costToComplete != null) patch.wipCostToComplete = summary.costToComplete;
    if (summary.estProfit != null) patch.forecastGP = summary.estProfit;
    if (summary.estProfitPercent != null) patch.forecastMargin = summary.estProfitPercent;
    if (summary.laborCost != null) patch.estLaborCost = summary.laborCost;
    if (summary.materialCost != null) patch.estMaterialCost = summary.materialCost;
    if (summary.subcontractorCost != null) patch.estSubCost = summary.subcontractorCost;
    if (summary.totalInvoiced != null && !existing.billedToDate) patch.billedToDate = summary.totalInvoiced;
    if (summary.leftToInvoice != null && !existing.wipLeftToBill) patch.wipLeftToBill = summary.leftToInvoice;
    if (summary.contractAmount && !existing.originalContractAmount) {
      patch.originalContractAmount = summary.contractAmount;
    }

    return patch;
  }

  private async replaceBudgetLines(
    projectId: string,
    budget: JobCostBudgetProjectSeed,
    existingLines: ProjectBudgetLine[],
  ): Promise<number> {
    const toRemove = existingLines.filter(
      l => l.projectId === projectId && l.importSource === 'job-cost-budget',
    );

    for (const line of toRemove) {
      await firstValueFrom(this.dataService.deleteBudgetLine(line.id));
    }

    for (const line of rollupJobCostBudgetLines(budget.lines)) {
      await firstValueFrom(this.dataService.createBudgetLine({
        projectId,
        costCode: line.costCode,
        category: line.category,
        originalBudget: line.originalBudget,
        approvedCOBudget: line.approvedCOBudget,
        revisedBudget: line.revisedBudget,
        actualCost: line.actualCost,
        costToComplete: line.costToComplete,
        projectedFinalCost: line.projectedFinalCost,
        variance: line.variance,
        importSource: 'job-cost-budget',
        importFile: budget.sourceFile,
        source: 'Imported',
      } as Partial<ProjectBudgetLine>));
    }

    return toRemove.length;
  }
}
