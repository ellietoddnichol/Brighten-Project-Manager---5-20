import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ProjectSubcontractor, Subcontractor, SubcontractorInvoice } from '@app/models/subcontractor.types';
import { DataService } from '@core/services/data.service';
import { ProjectControlsService } from '@features/projects/services/project-controls.service';
import { complianceTasksForProjectSub } from '@features/subcontractors/utils/subcontractor-compliance.compute';
import { coIsApprovedForInvoice, invoiceTaskDescriptors } from '@features/subcontractors/utils/subcontractor-invoice.compute';

@Injectable({ providedIn: 'root' })
export class SubcontractorTasksService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);

  async syncTasksForProjectSub(ps: ProjectSubcontractor, master: Subcontractor): Promise<void> {
    const project = this.data.projectsSnapshot().find(p => p.id === ps.projectId);
    const projectActive = project?.status === 'Active' || project?.status === 'Closeout';
    const docs = this.data.subcontractorDocumentsSnapshot();
    const descriptors = complianceTasksForProjectSub(master, ps, docs, !!projectActive);

    const activeKeys = new Set(descriptors.map(d => d.triggerKey));

    for (const desc of descriptors) {
      await this.controls.ensureSystemTask(
        ps.projectId,
        desc.triggerKey,
        desc.title,
        'Subcontractors',
        { type: 'ProjectSubcontractor', id: ps.id },
      );
    }

    for (const inv of this.data.subcontractorInvoicesSnapshot().filter(i => i.projectSubcontractorId === ps.id)) {
      await this.syncInvoiceTasks(inv, activeKeys);
    }

    await this.completeStaleSubTasks(ps.projectId, ps.id, activeKeys);
  }

  async syncInvoiceTasks(inv: SubcontractorInvoice, parentKeys?: Set<string>): Promise<void> {
    const ps = this.data.projectSubcontractorsSnapshot().find(p => p.id === inv.projectSubcontractorId);
    const po = inv.linkedPurchaseOrderId
      ? this.data.posSnapshot().find(p => p.id === inv.linkedPurchaseOrderId)
      : undefined;
    const coApproved = coIsApprovedForInvoice(inv.linkedChangeOrderId, this.data.changeOrdersSnapshot());
    const descriptors = invoiceTaskDescriptors(inv, ps, po, coApproved, this.data.subcontractorInvoicesSnapshot());
    const activeKeys = parentKeys ?? new Set<string>();

    for (const desc of descriptors) {
      activeKeys.add(desc.triggerKey);
      await this.controls.ensureSystemTask(
        inv.projectId,
        desc.triggerKey,
        desc.title,
        'Subcontractors',
        { type: 'SubcontractorInvoice', id: inv.id },
      );
    }

    if (!parentKeys) {
      await this.completeStaleInvoiceTasks(inv, activeKeys);
    }
  }

  private async completeStaleSubTasks(projectId: string, psId: string, activeKeys: Set<string>): Promise<void> {
    for (const task of this.data.projectTasksSnapshot()) {
      if (task.projectId !== projectId) continue;
      if (!task.systemTriggerKey?.startsWith('sub-')) continue;
      if (!task.systemTriggerKey.includes(psId)) continue;
      if (activeKeys.has(task.systemTriggerKey)) continue;
      if (task.status === 'Complete' || task.status === 'Canceled') continue;
      await firstValueFrom(this.data.updateProjectTask(task.id, { status: 'Complete' }));
    }
  }

  private async completeStaleInvoiceTasks(inv: SubcontractorInvoice, activeKeys: Set<string>): Promise<void> {
    for (const task of this.data.projectTasksSnapshot()) {
      if (task.projectId !== inv.projectId) continue;
      if (!task.systemTriggerKey?.startsWith('sub-inv-')) continue;
      if (!task.systemTriggerKey.includes(inv.id)) continue;
      if (activeKeys.has(task.systemTriggerKey)) continue;
      if (task.status === 'Complete' || task.status === 'Canceled') continue;
      await firstValueFrom(this.data.updateProjectTask(task.id, { status: 'Complete' }));
    }
  }

  async syncAllProjectSubs(): Promise<void> {
    for (const ps of this.data.projectSubcontractorsSnapshot()) {
      const master = this.data.subcontractorsSnapshot().find(s => s.id === ps.subcontractorId);
      if (master) await this.syncTasksForProjectSub(ps, master);
    }
  }
}
