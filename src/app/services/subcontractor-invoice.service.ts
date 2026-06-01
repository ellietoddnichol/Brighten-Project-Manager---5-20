import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PO, Project } from '../models/types';
import {
  LienWaiverStatus,
  ProjectSubcontractor,
  SubcontractorInvoice,
  SubcontractorInvoiceStatus,
} from '../models/subcontractor.types';
import { DataService } from './data.service';
import { ProjectSubcontractorService } from './project-subcontractor.service';
import { SubcontractorTasksService } from './subcontractor-tasks.service';
import { ProjectWorkflowSaveService } from './project-workflow-save.service';
import {
  buildInvoicePayload,
  coIsApprovedForInvoice,
  defaultLienWaiverForApproval,
  invoiceExceedsPoCommitment,
  poInvoicedFromSubInvoices,
  rollupProjectSubcontractor,
} from '../utils/subcontractor-invoice.compute';
import { derivePoStatus } from '../utils/budget-line.compute';

@Injectable({ providedIn: 'root' })
export class SubcontractorInvoiceService {
  private data = inject(DataService);
  private psSvc = inject(ProjectSubcontractorService);
  private tasks = inject(SubcontractorTasksService);
  private workflowSave = inject(ProjectWorkflowSaveService);

  snapshot(): SubcontractorInvoice[] {
    return this.data.subcontractorInvoicesSnapshot();
  }

  forProject(projectId: string): SubcontractorInvoice[] {
    return this.snapshot().filter(inv => inv.projectId === projectId);
  }

  forProjectSub(projectSubcontractorId: string): SubcontractorInvoice[] {
    return this.snapshot().filter(inv => inv.projectSubcontractorId === projectSubcontractorId);
  }

  async createInvoice(
    project: Project,
    ps: ProjectSubcontractor,
    draft: Partial<SubcontractorInvoice>,
  ): Promise<SubcontractorInvoice> {
    const payload = buildInvoicePayload({
      ...draft,
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      subcontractorId: ps.subcontractorId,
      subcontractorName: ps.subcontractorName,
      projectSubcontractorId: ps.id,
      linkedPurchaseOrderId: draft.linkedPurchaseOrderId ?? ps.linkedPurchaseOrderId,
      linkedBudgetLineId: draft.linkedBudgetLineId ?? ps.budgetLineId,
      invoiceNumber: draft.invoiceNumber ?? `SUB-INV-${Date.now()}`,
      amount: draft.amount ?? 0,
      approvedAmount: draft.approvedAmount ?? draft.amount ?? 0,
      retainagePercent: draft.retainagePercent ?? 0,
      status: draft.status ?? 'Draft',
      lienWaiverStatus: draft.lienWaiverStatus ?? 'Needed',
    });

    const saved = await firstValueFrom(this.data.createSubcontractorInvoice(payload));
    await this.afterInvoiceChange(saved);
    return saved;
  }

  async updateInvoice(
    inv: SubcontractorInvoice,
    updates: Partial<SubcontractorInvoice>,
  ): Promise<SubcontractorInvoice> {
    const payload = buildInvoicePayload({ ...inv, ...updates }, inv);
    const saved = await firstValueFrom(this.data.updateSubcontractorInvoice(inv.id, payload));
    await this.afterInvoiceChange(saved);
    return saved;
  }

  async setStatus(inv: SubcontractorInvoice, status: SubcontractorInvoiceStatus): Promise<SubcontractorInvoice> {
    const updates: Partial<SubcontractorInvoice> = { status };

    if (status === 'Approved') {
      updates.approvedAmount = inv.approvedAmount || inv.amount;
      updates.lienWaiverStatus = inv.lienWaiverStatus === 'NotRequired'
        ? 'NotRequired'
        : defaultLienWaiverForApproval(false);
    }

    if (status === 'Paid') {
      updates.paidAmount = inv.approvedAmount;
      updates.paymentDate = new Date().toISOString().slice(0, 10);
      if (inv.lienWaiverStatus === 'NotRequired') {
        // keep
      } else if (inv.retainageAmount > 0 && inv.lienWaiverStatus !== 'FinalReceived') {
        updates.lienWaiverStatus = 'FinalNeeded';
      } else if (inv.lienWaiverStatus !== 'Received') {
        updates.lienWaiverStatus = 'Needed';
      }
    }

    if (status === 'Void') {
      updates.paidAmount = 0;
      updates.openBalance = 0;
    }

    return this.updateInvoice(inv, updates);
  }

  async recordPayment(
    inv: SubcontractorInvoice,
    paidAmount: number,
    checkNumber?: string,
  ): Promise<SubcontractorInvoice> {
    return this.updateInvoice(inv, {
      paidAmount,
      checkNumber,
      paymentDate: new Date().toISOString().slice(0, 10),
    });
  }

  async setLienWaiverStatus(inv: SubcontractorInvoice, status: LienWaiverStatus): Promise<SubcontractorInvoice> {
    return this.updateInvoice(inv, { lienWaiverStatus: status });
  }

  async uploadInvoiceDocument(
    project: Project,
    inv: SubcontractorInvoice,
    file: File,
    documentType: 'SubcontractorInvoice' | 'LienWaiver' | 'FinalLienWaiver' | 'PaymentBackup' = 'SubcontractorInvoice',
  ): Promise<SubcontractorInvoice> {
    const folderKey = documentType === 'FinalLienWaiver' ? 'CLOSEOUT' : 'BILLING';
    const saveResult = await this.workflowSave.saveProjectWorkflowFile({
      projectId: project.id,
      workflowType: 'subcontractor_invoice',
      folderKey,
      fileName: file.name,
      content: file,
      mimeType: file.type,
      documentType,
      sourceRecordId: inv.id,
      requestAuthIfNeeded: true,
    });

    const docIds = [...(inv.documentIds ?? []), saveResult.projectFileId];
    let lienWaiverStatus = inv.lienWaiverStatus;
    if (documentType === 'LienWaiver') lienWaiverStatus = 'Received';
    if (documentType === 'FinalLienWaiver') lienWaiverStatus = 'FinalReceived';

    return this.updateInvoice(inv, {
      documentIds: docIds,
      lienWaiverStatus,
      notes: saveResult.warning ? `${inv.notes ?? ''}\n${saveResult.warning}`.trim() : inv.notes,
    });
  }

  private async afterInvoiceChange(inv: SubcontractorInvoice): Promise<void> {
    await this.syncPoFromInvoices(inv.linkedPurchaseOrderId);
    await this.refreshProjectSubRollups(inv.projectSubcontractorId);
    await this.tasks.syncInvoiceTasks(inv);
  }

  async syncPoFromInvoices(poId?: string): Promise<void> {
    if (!poId) return;
    const po = this.data.posSnapshot().find(p => p.id === poId);
    if (!po) return;

    const invoicedAmount = poInvoicedFromSubInvoices(poId, this.snapshot());
    const updated: Partial<PO> = {
      invoicedAmount,
      status: derivePoStatus({ ...po, invoicedAmount }),
    };
    await firstValueFrom(this.data.updatePO(poId, updated));
  }

  async refreshProjectSubRollups(projectSubcontractorId: string): Promise<void> {
    const ps = this.data.projectSubcontractorsSnapshot().find(p => p.id === projectSubcontractorId);
    if (!ps) return;

    const rollup = rollupProjectSubcontractor(ps, this.snapshot());
    let status = ps.status;
    if (rollup.lienWaiverStatus === 'FinalNeeded' && (ps.status === 'WorkComplete' || ps.status === 'Active')) {
      status = 'FinalWaiverNeeded';
    }

    await firstValueFrom(this.data.updateProjectSubcontractor(ps.id, {
      ...rollup,
      status,
    }));
  }

  invoiceOverPo(inv: SubcontractorInvoice): boolean {
    const po = inv.linkedPurchaseOrderId
      ? this.data.posSnapshot().find(p => p.id === inv.linkedPurchaseOrderId)
      : undefined;
    return invoiceExceedsPoCommitment(inv, po, this.snapshot());
  }

  coApproved(coId?: string): boolean | undefined {
    return coIsApprovedForInvoice(coId, this.data.changeOrdersSnapshot());
  }
}
