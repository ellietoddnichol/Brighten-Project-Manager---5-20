import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PO, Project } from '@app/models/types';
import { EnhancedPurchaseOrder, PurchaseOrderStatus } from '@app/models/financial.types';
import { DataService } from '@core/services/data.service';
import { ProjectControlsService } from '@features/projects/services/project-controls.service';
import { BudgetLineService } from '@features/projects/services/budget-line.service';
import { normalizeCoStatus, coNumber, isApprovedCo } from '@features/projects/utils/change-management';
import {
  derivePoStatus,
  nextPoNumber,
  poCommittedAmount,
  poInvoicedAmount,
  poRemainingCommitment,
  typeToCategory,
} from '@features/projects/utils/budget-line.compute';

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);
  private budgetLines = inject(BudgetLineService);

  toEnhanced(po: PO): EnhancedPurchaseOrder {
    const status = derivePoStatus(po);
    const committed = poCommittedAmount({ ...po, status });
    const invoiced = poInvoicedAmount(po);
    return {
      id: po.id,
      projectId: po.projectId,
      poNumber: po.poNumber,
      vendor: po.vendor,
      description: po.itemsPurchased ?? po.notes,
      committedAmount: committed,
      approvedAmount: committed,
      invoicedAmount: invoiced,
      remainingCommitment: poRemainingCommitment({ ...po, status }),
      status,
      linkedBudgetLineId: po.linkedBudgetLineId,
      linkedChangeOrderId: po.linkedChangeOrderId,
      linkedSubmittalId: po.linkedSubmittalId,
      type: po.type,
      originalAmount: po.originalAmount,
      itemsPurchased: po.itemsPurchased,
      notes: po.notes,
      source: po.source ?? 'manual',
    };
  }

  async savePo(project: Project, draft: Partial<PO>, editingId?: string | null): Promise<PO> {
    const projectPos = this.data.posSnapshot().filter(p => p.projectId === project.id);
    const amount = draft.committedAmount ?? draft.originalAmount ?? 0;
    const category = draft.category ?? (draft.type ? typeToCategory(draft.type) : undefined);

    const payload: Partial<PO> = {
      ...draft,
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      poNumber: draft.poNumber?.trim() || nextPoNumber(project.id, projectPos),
      vendor: draft.vendor?.trim() ?? '',
      originalAmount: amount,
      committedAmount: amount,
      invoicedAmount: draft.invoicedAmount ?? 0,
      category,
      status: draft.status ?? 'Draft',
      source: draft.source ?? 'manual',
    };

    payload.status = derivePoStatus(payload as PO);

    const saved = editingId
      ? await firstValueFrom(this.data.updatePO(editingId, payload))
      : await firstValueFrom(this.data.createPO(payload));

    if (saved.linkedChangeOrderId) {
      await this.checkCoLinkWarning(saved, saved.linkedChangeOrderId);
    }
    await this.refreshPoAutomation(project.id);
    return saved;
  }

  async issuePo(po: PO): Promise<PO> {
    const committed = po.committedAmount ?? po.originalAmount ?? 0;
    const updated = await firstValueFrom(this.data.updatePO(po.id, {
      status: 'Issued',
      committedAmount: committed,
      originalAmount: committed,
      issuedAt: po.issuedAt ?? new Date().toISOString(),
    }));
    const derived = { ...updated, status: derivePoStatus(updated) };
    if (derived.status !== updated.status) {
      await firstValueFrom(this.data.updatePO(po.id, { status: derived.status }));
    }
    await this.refreshPoAutomation(po.projectId);
    return { ...updated, status: derived.status };
  }

  async recordInvoice(po: PO, invoicedAmount: number): Promise<PO> {
    const updated = await firstValueFrom(this.data.updatePO(po.id, { invoicedAmount }));
    const status = derivePoStatus(updated);
    if (status !== updated.status) {
      await firstValueFrom(this.data.updatePO(po.id, { status }));
    }
    await this.refreshPoAutomation(po.projectId);
    return { ...updated, status };
  }

  async closePo(po: PO): Promise<PO> {
    return firstValueFrom(this.data.updatePO(po.id, { status: 'Closed' }));
  }

  async voidPo(po: PO): Promise<PO> {
    const updated = await firstValueFrom(this.data.updatePO(po.id, { status: 'Void' }));
    await this.refreshPoAutomation(po.projectId);
    return updated;
  }

  isOverBudget(projectId: string, po: PO): boolean {
    const project = this.data.projectsSnapshot().find(p => p.id === projectId);
    if (!project) return false;
    const rollup = this.budgetLines.rollupForProject(project);
    if (!rollup.budgetAmount) return false;

    const line = po.linkedBudgetLineId
      ? rollup.lines.find(l => l.id === po.linkedBudgetLineId)
      : rollup.lines.find(l => l.category === po.category);

    const lineBudget = line?.budgetAmount ?? rollup.budgetAmount;
    const lineCommitted = (line?.committedAmount ?? rollup.committedAmount);
    return lineCommitted > lineBudget;
  }

  async refreshPoAutomation(projectId: string): Promise<void> {
    const project = this.data.projectsSnapshot().find(p => p.id === projectId);
    if (!project) return;

    const projectPos = this.data.posSnapshot().filter(p => p.projectId === projectId);
    const rollup = this.budgetLines.rollupForProject(project);

    if (rollup.budgetAmount > 0 && rollup.committedAmount > rollup.budgetAmount) {
      await this.controls.ensureSystemTask(
        projectId,
        `budget-overrun-${projectId}`,
        'Review budget overrun.',
        'Budget / POs',
      );
    }

    for (const po of projectPos) {
      const status = derivePoStatus(po);
      if (status === 'Void' || status === 'Draft') continue;

      if (this.isOverBudget(projectId, po)) {
        await this.controls.ensureSystemTask(
          projectId,
          `po-overrun-${po.id}`,
          `Review budget overrun: PO ${po.poNumber}`,
          'Budget / POs',
          { type: 'PO', id: po.id },
        );
      }

      if (po.linkedChangeOrderId) {
        await this.checkCoLinkWarning(po, po.linkedChangeOrderId);
      }

      if (status === 'Issued' && po.issuedAt) {
        const days = Math.floor((Date.now() - new Date(po.issuedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 30 && poInvoicedAmount(po) === 0) {
          await this.controls.ensureSystemTask(
            projectId,
            `po-open-${po.id}`,
            `Review open PO: ${po.poNumber}`,
            'Budget / POs',
            { type: 'PO', id: po.id },
          );
        }
      }

      if (!po.linkedBudgetLineId && !po.category) {
        await this.controls.ensureSystemTask(
          projectId,
          `po-nobudget-${po.id}`,
          `PO ${po.poNumber} missing budget category`,
          'Budget / POs',
          { type: 'PO', id: po.id },
        );
      }
    }
  }

  private async checkCoLinkWarning(po: PO, linkedChangeOrderId: string): Promise<void> {
    const co = this.data.changeOrdersSnapshot().find(c => c.id === linkedChangeOrderId);
    if (!co) return;
    const s = normalizeCoStatus(co.status);
    if (!isApprovedCo(co) && s !== 'Billed') {
      await this.controls.ensureSystemTask(
        po.projectId,
        `po-co-warn-${po.id}`,
        `PO ${po.poNumber} tied to unapproved change order ${coNumber(co)}`,
        'Budget / POs',
        { type: 'PO', id: po.id },
      );
    }
  }
}
