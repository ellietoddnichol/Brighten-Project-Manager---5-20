import { Injectable, inject } from '@angular/core';

import { firstValueFrom } from 'rxjs';

import {

  ChangeRequest,

  DailyLog,

  Rfi,

  Submittal,

} from '../models/project-controls.types';

import { Billing, ChangeOrder, Project, ProjectTask } from '../models/types';

import {

  coApprovedAmount,

  coNumber,

  coStatusMatches,

  crNumber,

  crTitle,

  isApprovedCo,

  legacyCoStatusForStorage,

  nextSequentialNumber,

  normalizeCoStatus,

  toCoStorageFields,

} from '../utils/change-management';

import { nextRfiNum, nextSubNumber } from '../utils/construction-operations';

import { DataService } from './data.service';

import { DriveFolderDiscoveryService } from './drive-folder-discovery.service';



export interface ChangeOrderPricingInput {

  laborCost?: number;

  materialCost?: number;

  subCost?: number;

  equipmentCost?: number;

  otherCost?: number;

  overheadPercent?: number;

  profitPercent?: number;

  bondInsurancePercent?: number;

  taxAmount?: number;

  scheduleImpactDays?: number;

  clarifications?: string;

  exclusions?: string;

  coNumber?: string;

  changeOrderNumber?: string;

  title?: string;

}



@Injectable({ providedIn: 'root' })

export class ProjectControlsService {

  private data = inject(DataService);

  private folderDiscovery = inject(DriveFolderDiscoveryService);



  calcChangeOrderTotal(pricing: ChangeOrderPricingInput): {

    directCost: number;

    overhead: number;

    profit: number;

    bondInsurance: number;

    sellPrice: number;

  } {

    const directCost =

      (pricing.laborCost ?? 0)

      + (pricing.materialCost ?? 0)

      + (pricing.subCost ?? 0)

      + (pricing.equipmentCost ?? 0)

      + (pricing.otherCost ?? 0);

    const overhead = directCost * ((pricing.overheadPercent ?? 0) / 100);

    const profit = (directCost + overhead) * ((pricing.profitPercent ?? 0) / 100);

    const bondInsurance = (directCost + overhead + profit) * ((pricing.bondInsurancePercent ?? 0) / 100);

    const sellPrice = directCost + overhead + profit + bondInsurance + (pricing.taxAmount ?? 0);

    return { directCost, overhead, profit, bondInsurance, sellPrice };

  }



  async ensureSystemTask(
    _projectId: string,
    _triggerKey: string,
    _title: string,
    _taskGroup: ProjectTask['taskGroup'],
    _related?: { type: string; id: string },
  ): Promise<void> {
    return;
  }



  async completeSystemTask(triggerKey: string): Promise<void> {

    const task = this.data.projectTasksSnapshot().find(t =>

      t.systemTriggerKey === triggerKey

      && t.status !== 'Complete'

      && t.status !== 'Canceled',

    );

    if (task) {

      await firstValueFrom(this.data.updateProjectTask(task.id, {

        status: 'Complete',

        completedAt: new Date().toISOString(),

      }));

    }

  }



  async onProjectCreated(project: Project): Promise<void> {
    await this.initializeFolderLinks(project.id);
  }



  async initializeFolderLinks(projectId: string): Promise<void> {

    await this.folderDiscovery.initializeFolderLinks(projectId);

  }



  async ensureDefaultFolders(projectId: string): Promise<void> {

    await this.initializeFolderLinks(projectId);

  }



  buildChangeRequestPayload(project: Project, draft: Partial<ChangeRequest>): Partial<ChangeRequest> {

    const num = draft.changeRequestNumber ?? draft.crNumber ?? this.nextChangeRequestNumber(project.id);

    return {

      ...draft,

      projectId: project.id,

      projectNumber: project.projectNumber,

      projectName: project.projectName,

      changeRequestNumber: num,

      crNumber: num,

      title: draft.title ?? draft.description?.slice(0, 80),

      requestedDate: draft.requestedDate ?? draft.requestDate ?? new Date().toISOString().slice(0, 10),

      requestDate: draft.requestedDate ?? draft.requestDate,

      location: draft.location ?? draft.locationArea,

      locationArea: draft.location ?? draft.locationArea,

      drawingReference: draft.drawingReference ?? draft.drawingSpecReference,

      internalNotes: draft.internalNotes ?? draft.notes,

      urgency: draft.urgency ?? (draft.urgent ? 'High' : 'Normal'),

    };

  }



  async saveChangeRequest(project: Project, draft: Partial<ChangeRequest>, editingId?: string | null): Promise<ChangeRequest> {

    const payload = this.buildChangeRequestPayload(project, draft);

    if (editingId) {

      return firstValueFrom(this.data.updateChangeRequest(editingId, payload));

    }

    return firstValueFrom(this.data.createChangeRequest(payload));

  }



  async submitChangeRequestForPricing(cr: ChangeRequest): Promise<ChangeRequest> {

    const updated = await firstValueFrom(this.data.updateChangeRequest(cr.id, { status: 'Submitted' }));

    await this.onChangeRequestSubmitted(updated);

    return updated;

  }



  async markChangeRequestNeedsBackup(cr: ChangeRequest): Promise<ChangeRequest> {

    const updated = await firstValueFrom(this.data.updateChangeRequest(cr.id, { status: 'Needs Backup' }));

    await this.ensureSystemTask(

      cr.projectId,

      `cr-backup-${cr.id}`,

      `Add backup for change request ${crNumber(cr)}`,

      'Changes',

      { type: 'ChangeRequest', id: cr.id },

    );

    return updated;

  }



  async voidChangeRequest(cr: ChangeRequest): Promise<ChangeRequest> {

    return firstValueFrom(this.data.updateChangeRequest(cr.id, { status: 'Void' }));

  }



  async onChangeRequestSubmitted(cr: ChangeRequest): Promise<void> {

    await this.ensureSystemTask(

      cr.projectId,

      `cr-review-${cr.id}`,

      `Review and price change request ${crNumber(cr)}`,

      'Changes',

      { type: 'ChangeRequest', id: cr.id },

    );

  }



  async convertChangeRequestToChangeOrder(

    cr: ChangeRequest,

    pricing: ChangeOrderPricingInput,

  ): Promise<ChangeOrder> {

    const totals = this.calcChangeOrderTotal(pricing);

    const project = this.data.projectsSnapshot().find(p => p.id === cr.projectId);

    const coNum = pricing.changeOrderNumber ?? pricing.coNumber ?? this.nextChangeOrderNumber(cr.projectId);



    const co = await firstValueFrom(this.data.createChangeOrder({

      projectId: cr.projectId,

      projectNumber: project?.projectNumber,

      projectName: project?.projectName,

      coNumber: coNum,

      changeOrderNumber: coNum,

      title: pricing.title ?? crTitle(cr),

      description: cr.description,

      reason: cr.reason,

      requestedBy: cr.requestedBy,

      type: cr.changeType,

      status: legacyCoStatusForStorage('Draft'),

      linkedChangeRequestId: cr.id,

      sourceChangeRequestId: cr.id,

      dateCreated: new Date().toISOString().slice(0, 10),

      dateIdentified: cr.requestedDate ?? cr.requestDate,

      daysAdded: pricing.scheduleImpactDays ?? cr.daysAdded,

      ...toCoStorageFields({ ...pricing, ...totals }),

      approvedAmount: 0,

    }));



    await firstValueFrom(this.data.updateChangeRequest(cr.id, {

      status: 'Converted',

      linkedChangeOrderId: co.id,

    }));



    await this.completeSystemTask(`cr-review-${cr.id}`);

    await this.ensureSystemTask(

      cr.projectId,

      `co-price-${co.id}`,

      `Price and send change order ${coNumber(co)}`,

      'Changes',

      { type: 'ChangeOrder', id: co.id },

    );



    return co;

  }



  async saveChangeOrder(project: Project, draft: Partial<ChangeOrder>, editingId?: string | null): Promise<ChangeOrder> {

    const totals = this.calcChangeOrderTotal(draft);

    const num = draft.changeOrderNumber ?? draft.coNumber ?? this.nextChangeOrderNumber(project.id);

    const payload: Partial<ChangeOrder> = {

      ...draft,

      projectId: project.id,

      projectNumber: project.projectNumber,

      projectName: project.projectName,

      coNumber: num,

      changeOrderNumber: num,

      sourceChangeRequestId: draft.sourceChangeRequestId ?? draft.linkedChangeRequestId,

      linkedChangeRequestId: draft.sourceChangeRequestId ?? draft.linkedChangeRequestId,

      ...toCoStorageFields({ ...draft, ...totals }),

    };

    if (payload.status) {

      payload.status = legacyCoStatusForStorage(normalizeCoStatus(payload.status));

    }



    let saved: ChangeOrder;

    if (editingId) {

      saved = await firstValueFrom(this.data.updateChangeOrder(editingId, payload));

    } else {

      saved = await firstValueFrom(this.data.createChangeOrder(payload));

    }

    await this.syncChangeOrderSideEffects(saved);

    return saved;

  }



  async markChangeOrderSent(co: ChangeOrder): Promise<ChangeOrder> {

    const updated = await firstValueFrom(this.data.updateChangeOrder(co.id, {

      status: legacyCoStatusForStorage('Sent'),

      dateSent: new Date().toISOString().slice(0, 10),

    }));

    await this.onChangeOrderSent(updated);

    await this.completeSystemTask(`co-send-${co.id}`);

    return updated;

  }



  async markChangeOrderApproved(co: ChangeOrder, approvedAmount?: number): Promise<ChangeOrder> {

    const amount = approvedAmount ?? coApprovedAmount(co);

    const updated = await firstValueFrom(this.data.updateChangeOrder(co.id, {

      status: legacyCoStatusForStorage('Approved'),

      approvedAmount: amount,

      totalAmount: amount,

      dateApproved: new Date().toISOString().slice(0, 10),

      billingStatus: 'Approved',

    }));

    await this.onChangeOrderApproved(updated);

    return updated;

  }



  async markChangeOrderRejected(co: ChangeOrder): Promise<ChangeOrder> {

    const updated = await firstValueFrom(this.data.updateChangeOrder(co.id, {

      status: legacyCoStatusForStorage('Rejected'),

      dateRejected: new Date().toISOString().slice(0, 10),

    }));

    await this.ensureSystemTask(

      co.projectId,

      `co-rejected-${co.id}`,

      `Review rejected change order ${coNumber(co)}`,

      'Changes',

      { type: 'ChangeOrder', id: co.id },

    );

    await this.completeSystemTask(`co-followup-${co.id}`);

    return updated;

  }



  async markChangeOrderVoid(co: ChangeOrder): Promise<ChangeOrder> {

    return firstValueFrom(this.data.updateChangeOrder(co.id, {

      status: legacyCoStatusForStorage('Void'),

    }));

  }



  async markChangeOrderBilled(co: ChangeOrder, payAppId: string): Promise<ChangeOrder> {

    const updated = await firstValueFrom(this.data.updateChangeOrder(co.id, {

      status: legacyCoStatusForStorage('Billed'),

      payAppId,

      dateBilled: new Date().toISOString().slice(0, 10),

      billingStatus: 'Billed',

    }));

    await this.completeSystemTask(`co-billing-${co.id}`);

    return updated;

  }



  async addChangeOrderToPayApp(co: ChangeOrder, billing: Billing): Promise<void> {
    const amount = coApprovedAmount(co);
    const existingIds = billing.includedChangeOrderIds ?? billing.changeOrderIds ?? [];
    if (existingIds.includes(co.id)) return;

    await firstValueFrom(this.data.updateBilling(billing.id, {
      includedChangeOrderIds: [...existingIds, co.id],
      changeOrderIds: [...existingIds, co.id],
      currentApplication: (billing.currentApplication ?? billing.workCompletedThisPeriod ?? 0) + amount,
      workCompletedThisPeriod: (billing.workCompletedThisPeriod ?? 0) + amount,
    }));

    await firstValueFrom(this.data.updateChangeOrder(co.id, {
      payAppId: billing.id,
      billingStatus: 'IncludedInDraftPayApp',
    }));

    await this.completeSystemTask(`co-billing-${co.id}`);
  }



  async onChangeOrderDocumentGenerated(co: ChangeOrder): Promise<void> {

    if (coStatusMatches(co, 'Sent', 'Approved', 'Rejected', 'Void', 'Billed')) return;

    await this.ensureSystemTask(

      co.projectId,

      `co-send-${co.id}`,

      `Send change order ${coNumber(co)}`,

      'Changes',

      { type: 'ChangeOrder', id: co.id },

    );

  }



  async onChangeOrderSent(co: ChangeOrder): Promise<void> {
    await this.ensureSystemTask(
      co.projectId,
      `co-followup-${co.id}`,
      `Follow up on change order approval: ${coNumber(co)}`,
      'Changes',
      { type: 'ChangeOrder', id: co.id },
    );
  }



  async onChangeOrderApproved(co: ChangeOrder): Promise<void> {

    await this.ensureSystemTask(

      co.projectId,

      `co-billing-${co.id}`,

      `Add approved change order to next pay app: ${coNumber(co)}`,

      'Billing / Pay Apps',

      { type: 'ChangeOrder', id: co.id },

    );

    await this.completeSystemTask(`co-followup-${co.id}`);

    await this.completeSystemTask(`co-followup-dated-${co.id}`);

    await this.completeSystemTask(`co-price-${co.id}`);

    await this.completeSystemTask(`co-send-${co.id}`);

  }



  async applyApprovedChangeOrderToProject(_co: ChangeOrder): Promise<void> {

    // Revised contract is computed from original + approved COs in financial utils.

  }



  private async syncChangeOrderSideEffects(co: ChangeOrder): Promise<void> {

    const status = normalizeCoStatus(co.status);

    if (status === 'Sent') await this.onChangeOrderSent(co);

    if (status === 'Approved') await this.onChangeOrderApproved(co);

    if (status === 'Needs Backup') {

      await this.ensureSystemTask(

        co.projectId,

        `co-backup-${co.id}`,

        `Add backup for change order ${coNumber(co)}`,

        'Changes',

        { type: 'ChangeOrder', id: co.id },

      );

    }

    if (isApprovedCo(co) && !co.payAppId && !co.dateBilled) {

      await this.ensureSystemTask(

        co.projectId,

        `co-billing-${co.id}`,

        `Bill approved change order: ${coNumber(co)}`,

        'Billing / Pay Apps',

        { type: 'ChangeOrder', id: co.id },

      );

    }

  }



  async createDraftChangeRequestFromDailyLog(log: DailyLog): Promise<ChangeRequest> {

    const project = this.data.projectsSnapshot().find(p => p.id === log.projectId);

    const num = this.nextChangeRequestNumber(log.projectId);

    const cr = await firstValueFrom(this.data.createChangeRequest({

      projectId: log.projectId,

      projectNumber: project?.projectNumber,

      projectName: project?.projectName,

      changeRequestNumber: num,

      crNumber: num,

      requestedDate: log.logDate,

      requestDate: log.logDate,

      requestedBy: log.submittedBy ?? log.foreman,

      source: 'Field',

      changeType: 'Field Condition',

      title: log.workPerformed?.slice(0, 80) ?? 'Potential change noted on daily log',

      description: [log.workPerformed, log.delays ? `Delays: ${log.delays}` : ''].filter(Boolean).join('\n\n') || 'Potential change noted on daily log',

      location: log.areasWorked,

      locationArea: log.areasWorked,

      status: 'Draft',

      linkedDailyLogId: log.id,

      urgency: 'Normal',

      costImpactKnown: !!(log.costImpact || log.potentialChange),

      scheduleImpactKnown: !!log.scheduleImpact,

      attachmentIds: log.photoIds ?? log.photos,

    }));



    await firstValueFrom(this.data.updateDailyLog(log.id, { linkedChangeRequestId: cr.id }));

    return cr;

  }



  async onRfiAnsweredWithImpact(rfi: Rfi): Promise<void> {

    if (!rfi.costImpact && !rfi.scheduleImpact) return;

    await this.ensureSystemTask(

      rfi.projectId,

      `rfi-cr-${rfi.id}`,

      `Create change request from RFI ${rfi.rfiNumber ?? rfi.id.slice(0, 8)}`,

      'Changes',

      { type: 'RFI', id: rfi.id },

    );

  }



  async onSubmittalOverdue(submittal: Submittal): Promise<void> {

    await this.ensureSystemTask(

      submittal.projectId,

      `sub-overdue-${submittal.id}`,

      `Submittal overdue: ${submittal.submittalNumber ?? submittal.description?.slice(0, 40) ?? 'Submittal'}`,

      'Submittals',

      { type: 'Submittal', id: submittal.id },

    );

  }



  nextChangeRequestNumber(projectId: string): string {

    const nums = this.data.changeRequestsSnapshot()

      .filter(c => c.projectId === projectId)

      .map(c => crNumber(c));

    return nextSequentialNumber('CR', nums);

  }



  nextChangeOrderNumber(projectId: string): string {

    const nums = this.data.changeOrdersSnapshot()

      .filter(c => c.projectId === projectId)

      .map(c => coNumber(c));

    return nextSequentialNumber('CO', nums);

  }



  nextRfiNumber(projectId: string): string {
    return nextRfiNum(projectId, this.data.rfisSnapshot());
  }

  nextSubmittalNumber(projectId: string): string {
    return nextSubNumber(projectId, this.data.submittalsSnapshot());
  }



  normalizeChangeOrderStatus(status: string): string {

    return normalizeCoStatus(status);

  }

}


