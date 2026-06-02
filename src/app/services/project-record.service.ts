import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Project, ChangeOrder, ProjectBudgetLine } from '../models/types';
import { DataService } from './data.service';
import { BudgetLineService } from './budget-line.service';

/** Persists in-app edits to Firestore — the working source of truth per job. */
@Injectable({ providedIn: 'root' })
export class ProjectRecordService {
  private data = inject(DataService);
  private budgetLines = inject(BudgetLineService);

  saveProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return firstValueFrom(this.data.updateProject(projectId, patch));
  }

  saveChangeOrder(co: Partial<ChangeOrder>, editingId?: string | null): Promise<ChangeOrder> {
    if (editingId) {
      return firstValueFrom(this.data.updateChangeOrder(editingId, co));
    }
    return firstValueFrom(this.data.createChangeOrder(co));
  }

  saveBudgetLine(project: Project, draft: Partial<ProjectBudgetLine>, editingId?: string | null): Promise<ProjectBudgetLine> {
    return this.budgetLines.saveLine(project, draft, editingId);
  }
}
