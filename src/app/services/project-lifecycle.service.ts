import { Injectable, inject } from '@angular/core';
import { Project } from '../models/types';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { DataService } from './data.service';
import { ForemanBonusService } from './foreman-bonus.service';
import { ImportDataService } from './import-data.service';
import { QuickBooksSyncDataService } from './quickbooks-sync-data.service';
import {
  ProjectLifecycleInput,
  computeProjectLifecycle,
  matchesProjectsListView,
  shouldCreateDriveFolderTasks,
  shouldCreateDriveLinkTask,
} from '../utils/project-lifecycle.compute';

@Injectable({ providedIn: 'root' })
export class ProjectLifecycleService {
  private data = inject(DataService);
  private foremanBonus = inject(ForemanBonusService);
  private importData = inject(ImportDataService);
  private qbSyncData = inject(QuickBooksSyncDataService);

  private context(project: Project): Omit<ProjectLifecycleInput, 'project'> {
    const assignments = this.data.projectForemanAssignmentsSnapshot();
    const flags = this.importData.flagsForJob(project.projectNumber);
    const qbFlags = this.qbSyncData.flagsForJob(project.projectNumber);
    return {
      billings: this.data.billingsSnapshot(),
      arRecords: this.data.arRecordsSnapshot(),
      laborActuals: this.data.projectLaborActualsSnapshot(),
      changeOrders: this.data.changeOrdersSnapshot(),
      tasks: this.data.projectTasksSnapshot(),
      budgetLines: this.data.budgetLinesSnapshot(),
      budgetImported: flags?.budgetImported,
      laborBudgetImported: flags?.laborBudgetImported,
      subcontractorDataImported: flags?.subcontractorDataImported,
      actualCostsImported: flags?.actualCostsImported,
      qbCustomerLinked: qbFlags.qbCustomerLinked,
      qbBillingPresent: qbFlags.qbBillingPresent,
      qbArPresent: qbFlags.qbArPresent,
      qbIncomeSummaryPresent: qbFlags.qbIncomeSummaryPresent,
      qbDetailCostPresent: qbFlags.qbDetailCostPresent,
    };
  }

  forProject(project: Project): ProjectLifecycleSnapshot {
    const bonusEligible = this.foremanBonus.assignments().some(a => a.projectId === project.id && a.bonusEligible);
    const hasForemanAssignment = this.foremanBonus.assignments().some(a => a.projectId === project.id);
    return computeProjectLifecycle({
      project,
      ...this.context(project),
      bonusEligible,
      hasForemanAssignment,
      subcontractorsExpected: (project.estSubCost ?? 0) > 0 || project.prevailingWage === true,
    });
  }

  snapshotMap(): Map<string, ProjectLifecycleSnapshot> {
    const map = new Map<string, ProjectLifecycleSnapshot>();
    for (const project of this.data.projectsSnapshot()) {
      map.set(project.id, this.forProject(project));
    }
    return map;
  }

  allSnapshots(): ProjectLifecycleSnapshot[] {
    return this.data.projectsSnapshot().map(p => this.forProject(p));
  }

  matchesListView(project: Project, view: string, searchQuery = ''): boolean {
    return matchesProjectsListView(this.forProject(project), view, searchQuery);
  }

  needsDriveLinkTask(project: Project): boolean {
    return shouldCreateDriveLinkTask(this.forProject(project), project);
  }

  needsDriveFolderTasks(project: Project): boolean {
    return shouldCreateDriveFolderTasks(this.forProject(project), project);
  }
}
