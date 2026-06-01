import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PO, Project, ProjectBudgetLine } from '../models/types';
import { DataService } from './data.service';
import { computeBudgetRollup, ComputedBudgetLine } from '../utils/budget-line.compute';

@Injectable({ providedIn: 'root' })
export class BudgetLineService {
  private data = inject(DataService);

  computeForProject(project: Project): ComputedBudgetLine[] {
    return computeBudgetRollup(
      project,
      this.data.budgetLinesSnapshot(),
      this.data.posSnapshot(),
      this.data.timeEntriesSnapshot(),
      this.data.projectLaborActualsSnapshot(),
      this.data.subcontractorInvoicesSnapshot(),
    ).lines;
  }

  rollupForProject(project: Project) {
    return computeBudgetRollup(
      project,
      this.data.budgetLinesSnapshot(),
      this.data.posSnapshot(),
      this.data.timeEntriesSnapshot(),
      this.data.projectLaborActualsSnapshot(),
      this.data.subcontractorInvoicesSnapshot(),
    );
  }

  async saveLine(project: Project, draft: Partial<ProjectBudgetLine>, editingId?: string | null): Promise<ProjectBudgetLine> {
    const budgetAmount = draft.budgetAmount ?? draft.revisedBudget ?? draft.originalBudget ?? 0;
    const payload: Partial<ProjectBudgetLine> = {
      ...draft,
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      budgetAmount,
      originalBudget: draft.originalBudget ?? budgetAmount,
      revisedBudget: budgetAmount + (draft.approvedCOBudget ?? 0),
      source: draft.source ?? 'Manual',
      status: draft.status ?? 'Active',
    };
    this.recalcLine(payload);
    return editingId
      ? firstValueFrom(this.data.updateBudgetLine(editingId, payload))
      : firstValueFrom(this.data.createBudgetLine(payload));
  }

  recalcLine(line: Partial<ProjectBudgetLine>): void {
    const budget = line.budgetAmount ?? line.revisedBudget ?? line.originalBudget ?? 0;
    line.budgetAmount = budget;
    line.revisedBudget = budget + (line.approvedCOBudget ?? 0);
    const projected = line.projectedCost ?? line.projectedFinalCost ?? ((line.actualCost ?? 0) + (line.costToComplete ?? 0));
    line.projectedCost = projected;
    line.projectedFinalCost = projected;
    line.variance = line.revisedBudget - projected;
  }
}
