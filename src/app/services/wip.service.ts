import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Project } from '../models/types';
import { WIPRecord, WipGroup } from '../models/financial.types';
import { DataService } from './data.service';
import { ProjectFinancialService } from './project-financial.service';
import { buildWipRecord, wipGroupLabel } from '../utils/wip.compute';

@Injectable({ providedIn: 'root' })
export class WipService {
  private data = inject(DataService);
  private financials = inject(ProjectFinancialService);

  computeAll(): WIPRecord[] {
    return this.financials.computeWipRecords();
  }

  byGroup(group: WipGroup): WIPRecord[] {
    return this.computeAll().filter(w => w.wipGroup === group);
  }

  activeWip(): WIPRecord[] {
    return this.byGroup('ActiveWIP');
  }

  upcomingWip(): WIPRecord[] {
    return this.byGroup('UpcomingWIP');
  }

  closeoutAr(): WIPRecord[] {
    return this.byGroup('CloseoutAR');
  }

  needsReview(): WIPRecord[] {
    return this.byGroup('NeedsReview');
  }

  excludedArchive(): WIPRecord[] {
    return this.byGroup('ExcludedArchive');
  }

  forProject(projectId: string): WIPRecord | undefined {
    return this.computeAll().find(w => w.projectId === projectId);
  }

  groupLabel = wipGroupLabel;

  async saveOverride(projectId: string, overrides: Partial<Project>): Promise<void> {
    await firstValueFrom(this.data.updateProject(projectId, overrides));
  }

  async setWipGroup(projectId: string, wipGroupOverride: WipGroup): Promise<void> {
    await this.saveOverride(projectId, { wipGroupOverride });
  }

  async saveAssumptions(projectId: string, draft: {
    wipContractOverride?: number;
    wipBudgetOverride?: number;
    wipEstimatedFinalCostOverride?: number;
    wipCostToComplete?: number;
    wipReviewNotes?: string;
  }): Promise<void> {
    await this.saveOverride(projectId, draft);
  }
}
