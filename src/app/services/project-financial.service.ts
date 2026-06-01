import { Injectable, inject } from '@angular/core';
import { Project } from '../models/types';
import { ProjectFinancial, WIPRecord, FinancialMetrics } from '../models/financial.types';
import { DataService } from './data.service';
import { ImportDataService } from './import-data.service';
import { QuickBooksSyncDataService } from './quickbooks-sync-data.service';
import { buildProjectFinancial, ImportCostOverrides, QuickBooksSyncOverrides } from '../utils/project-financial.compute';
import { buildWipRecord } from '../utils/wip.compute';
import { computeFinancialMetrics } from '../utils/financial-metrics';
import { isOverheadJob } from '../utils/project';
import { ProjectLifecycleService } from './project-lifecycle.service';

@Injectable({ providedIn: 'root' })
export class ProjectFinancialService {
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private importData = inject(ImportDataService);
  private qbSyncData = inject(QuickBooksSyncDataService);

  private importCostsFor(project: Project): ImportCostOverrides | undefined {
    const byCat = this.importData.actualCostTotalsByCategory(project.id);
    const subCost = this.importData.subcontractorActualTotal(project.id);
    const totalProject = this.importData.projectActualTotal(project.id);
    const qbByCat = this.qbSyncData.wipCostTotalsByCategory(project.id);
    const flags = this.importData.flagsForJob(project.projectNumber);
    const hasQbDetail = this.qbSyncData.hasDetailCostsForProject(project.id);

    if (!flags?.budgetImported && !totalProject && !subCost && !hasQbDetail) return undefined;

    const mapCat = (key: string) => byCat[key] ?? 0;
    const qbCat = (key: string) => qbByCat[key] ?? 0;
    const sub = Math.max(subCost || mapCat('Subcontractor'), qbCat('Subcontractor'));
    const material = Math.max(mapCat('Material'), qbCat('Material'));
    const equipment = Math.max(mapCat('Equipment'), qbCat('Equipment'));
    const gc = Math.max(mapCat('GeneralConditions'), qbCat('GeneralConditions'));
    const other = Math.max(mapCat('Other'), qbCat('Other'));
    const laborFromQb = qbCat('Labor');
    const totalQb = sub + material + equipment + gc + other + laborFromQb;
    const totalSeed = totalProject + subCost;

    return {
      budgetImported: flags?.budgetImported,
      subcontractorCostToDate: sub || undefined,
      materialCostToDate: material || undefined,
      equipmentCostToDate: equipment || undefined,
      otherCostToDate: (other + gc) || undefined,
      selfPerformedCostToDate: laborFromQb || mapCat('Labor') || undefined,
      costToDate: totalQb + totalSeed > 0 ? Math.max(totalQb, totalSeed) : undefined,
    };
  }

  private qbSyncFor(project: Project): QuickBooksSyncOverrides | undefined {
    const job = project.projectNumber;
    const income = this.qbSyncData.incomeForJob(job);
    const ar = this.qbSyncData.arForJob(job);
    const invoices = this.qbSyncData.invoicesForJob(job);
    const hasDetailedCost = this.qbSyncData.hasDetailCostsForProject(project.id)
      || this.importData.projectActualTotal(project.id) > 0;
    const hasLaborActuals = this.data.projectLaborActualsSnapshot().some(a => a.projectId === project.id);

    if (!income && !ar && !invoices.length && !hasDetailedCost) return undefined;

    const billedFromInvoices = invoices.reduce((s, i) => s + i.amount, 0);
    return {
      billedToDate: billedFromInvoices || undefined,
      arBalance: ar?.total,
      qboIncomeToDate: income?.income,
      qboExpenseToDate: income?.expenses,
      qboNetIncome: income?.netIncome,
      expenseFallback: !hasDetailedCost && !hasLaborActuals ? income?.expenses : undefined,
    };
  }

  computeForProject(project: Project): ProjectFinancial {
    return buildProjectFinancial(
      project,
      this.data.changeOrdersSnapshot(),
      this.data.billingsSnapshot(),
      this.data.budgetLinesSnapshot(),
      this.data.posSnapshot(),
      this.data.timeEntriesSnapshot(),
      this.data.arRecordsSnapshot(),
      this.data.projectLaborActualsSnapshot(),
      this.data.subcontractorInvoicesSnapshot(),
      this.importCostsFor(project),
      this.qbSyncFor(project),
    );
  }

  computeAll(): ProjectFinancial[] {
    return this.data.projectsSnapshot()
      .filter(p => !isOverheadJob(p))
      .map(p => this.computeForProject(p));
  }

  computeWipRecords(): WIPRecord[] {
    const changeOrders = this.data.changeOrdersSnapshot();
    const billings = this.data.billingsSnapshot();
    const arRecords = this.data.arRecordsSnapshot();
    const tasks = this.data.projectTasksSnapshot();
    const laborActuals = this.data.projectLaborActualsSnapshot();
    const laborProjectIds = new Set(laborActuals.map(a => a.projectId));
    const sourceFlags = {
      qbHasArAgingTab: this.qbSyncData.arAging().length > 0 || this.qbSyncData.hasDetailCostTab(),
      qbHasCostDetailTab: this.qbSyncData.hasDetailCostTab(),
      projectIdsWithLaborActuals: laborProjectIds,
    };

    return this.data.projectsSnapshot()
      .filter(p => !isOverheadJob(p))
      .map(project => buildWipRecord({
        project,
        financial: this.computeForProject(project),
        changeOrders,
        billings,
        arRecords,
        tasks,
        lifecycle: this.lifecycle.forProject(project),
        sourceFlags,
      }));
  }

  activeWipRecords(): WIPRecord[] {
    return this.computeWipRecords().filter(w => w.wipGroup === 'ActiveWIP');
  }

  closeoutArRecords(): WIPRecord[] {
    return this.computeWipRecords().filter(w => w.wipGroup === 'CloseoutAR');
  }

  needsReviewWipRecords(): WIPRecord[] {
    return this.computeWipRecords().filter(w => w.needsReview);
  }

  excludedArchiveWipRecords(): WIPRecord[] {
    return this.computeWipRecords().filter(w => w.wipGroup === 'ExcludedArchive');
  }

  portfolioMetrics(): FinancialMetrics {
    return computeFinancialMetrics(
      this.data.projectsSnapshot(),
      this.data.changeOrdersSnapshot(),
      this.data.billingsSnapshot(),
      this.data.budgetLinesSnapshot(),
      this.data.posSnapshot(),
      this.data.arRecordsSnapshot(),
      this.computeWipRecords(),
      this.data.projectLaborActualsSnapshot(),
      this.data.subcontractorInvoicesSnapshot(),
      { qbHasArAgingTab: this.qbSyncData.arAging().length > 0 },
    );
  }
}
