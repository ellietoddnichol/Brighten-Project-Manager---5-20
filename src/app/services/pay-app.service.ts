import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Billing, ChangeOrder, Project } from '../models/types';
import { PayApp, PayAppLine } from '../models/financial.types';
import { DataService } from './data.service';
import { ProjectControlsService } from './project-controls.service';
import { ArService } from './ar.service';
import {
  coApprovedAmount,
  coNumber,
  isApprovedUnbilledCo,
  isIncludedInDraftPayApp,
} from '../utils/change-management';
import {
  billingFromPayAppInput,
  buildPayAppLineFromCo,
  buildProjectFinancial,
  payAppFromBilling,
} from '../utils/project-financial.compute';

@Injectable({ providedIn: 'root' })
export class PayAppService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);
  private ar = inject(ArService);

  draftPayApp(projectId: string): Billing | undefined {
    return this.data.billingsSnapshot().find(b => b.projectId === projectId && b.status === 'Draft');
  }

  projectPayApps(projectId: string): PayApp[] {
    return this.data.billingsSnapshot()
      .filter(b => b.projectId === projectId)
      .map(payAppFromBilling);
  }

  approvedUnbilledCos(projectId: string): ChangeOrder[] {
    return this.data.changeOrdersSnapshot().filter(co =>
      co.projectId === projectId && isApprovedUnbilledCo(co),
    );
  }

  includedInDraftCos(projectId: string): ChangeOrder[] {
    return this.data.changeOrdersSnapshot().filter(co =>
      co.projectId === projectId && isIncludedInDraftPayApp(co),
    );
  }

  cosForPayApp(payApp: Billing): ChangeOrder[] {
    const ids = payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? [];
    return this.data.changeOrdersSnapshot().filter(co => ids.includes(co.id));
  }

  async createDraftPayApp(project: Project): Promise<Billing> {
    const existing = this.draftPayApp(project.id);
    if (existing) return existing;

    const financial = buildProjectFinancial(
      project,
      this.data.changeOrdersSnapshot(),
      this.data.billingsSnapshot(),
      this.data.budgetLinesSnapshot(),
      this.data.posSnapshot(),
      this.data.timeEntriesSnapshot(),
      this.data.arRecordsSnapshot(),
      this.data.projectLaborActualsSnapshot(),
      this.data.subcontractorInvoicesSnapshot(),
    );

    const priorBilled = financial.billedToDate;
    return firstValueFrom(this.data.createBilling(billingFromPayAppInput({
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      payAppNumber: `PA-${String(this.projectPayApps(project.id).length + 1).padStart(2, '0')}`,
      billingPeriod: new Date().toISOString().slice(0, 7),
      status: 'Draft',
      originalContractAmount: financial.originalContractAmount,
      approvedChangeOrderAmount: financial.approvedChangeOrderAmount,
      currentContractAmount: financial.currentContractAmount,
      scheduledValue: financial.currentContractAmount,
      previousApplications: priorBilled,
      currentApplication: 0,
      workCompletedThisPeriod: 0,
      storedMaterials: 0,
      retainagePercent: project.retainagePercent ?? 10,
      retainageAmount: 0,
      totalBilledToDate: 0,
      includedChangeOrderIds: [],
      changeOrderIds: [],
    })));
  }

  async includeCoInDraftPayApp(co: ChangeOrder, payApp: Billing): Promise<void> {
    if (payApp.status !== 'Draft') return;
    if (!isApprovedUnbilledCo(co)) return;

    const amount = coApprovedAmount(co);
    const coIds = payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? [];
    if (coIds.includes(co.id)) return;

    const updatedIds = [...coIds, co.id];
    const currentApp = (payApp.currentApplication ?? payApp.workCompletedThisPeriod ?? 0) + amount;
    const totals = this.recalcPayAppTotals({
      ...payApp,
      workCompletedThisPeriod: currentApp,
      currentApplication: currentApp,
    });

    await firstValueFrom(this.data.updateBilling(payApp.id, {
      ...totals,
      includedChangeOrderIds: updatedIds,
      changeOrderIds: updatedIds,
    }));

    await firstValueFrom(this.data.updateChangeOrder(co.id, {
      payAppId: payApp.id,
      billingStatus: 'IncludedInDraftPayApp',
    }));

    await firstValueFrom(this.data.createPayAppLine(buildPayAppLineFromCo(co, payApp.id, co.projectId) as PayAppLine));
    await this.controls.completeSystemTask(`co-billing-${co.id}`);
  }

  async removeCoFromDraftPayApp(co: ChangeOrder, payApp: Billing): Promise<void> {
    if (payApp.status !== 'Draft') return;

    const coIds = (payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? []).filter(id => id !== co.id);
    const amount = coApprovedAmount(co);
    const currentApp = Math.max(0, (payApp.currentApplication ?? payApp.workCompletedThisPeriod ?? 0) - amount);
    const totals = this.recalcPayAppTotals({
      ...payApp,
      workCompletedThisPeriod: currentApp,
      currentApplication: currentApp,
    });

    await firstValueFrom(this.data.updateBilling(payApp.id, { ...totals, includedChangeOrderIds: coIds, changeOrderIds: coIds }));
    await firstValueFrom(this.data.updateChangeOrder(co.id, {
      payAppId: undefined,
      billingStatus: 'Approved',
    }));

    const line = this.data.payAppLinesSnapshot().find(l =>
      l.payAppId === payApp.id && l.sourceRecordId === co.id,
    );
    if (line) await firstValueFrom(this.data.deletePayAppLine(line.id));
  }

  recalcPayAppTotals(payApp: Billing, retainagePercent?: number): Partial<Billing> {
    const work = payApp.workCompletedThisPeriod ?? payApp.currentApplication ?? 0;
    const materials = payApp.storedMaterials ?? 0;
    const pct = retainagePercent ?? payApp.retainagePercent ?? 0;
    const retainageAmount = (work + materials) * (pct / 100);
    const netDue = work + materials - retainageAmount;
    return {
      retainagePercent: pct,
      retainageAmount,
      netDue,
      currentApplication: work,
      totalBilledToDate: (payApp.previousApplications ?? 0) + netDue,
    };
  }

  async submitPayApp(payApp: Billing): Promise<Billing> {
    const totals = this.recalcPayAppTotals(payApp);
    const submittedAt = new Date().toISOString();
    const updated = await firstValueFrom(this.data.updateBilling(payApp.id, {
      ...totals,
      status: 'Submitted',
      submittedAt,
    }));

    await this.markCoBillingStatus(payApp, 'SubmittedForBilling');
    await this.controls.completeSystemTask(`payapp-submit-${payApp.id}`);
    await this.controls.ensureSystemTask(
      payApp.projectId,
      `payapp-approve-${payApp.id}`,
      `Follow up on pay app approval: ${payApp.payAppNumber}`,
      'Billing / Pay Apps',
      { type: 'PayApp', id: payApp.id },
    );

    return updated;
  }

  async approvePayApp(payApp: Billing): Promise<Billing> {
    const updated = await firstValueFrom(this.data.updateBilling(payApp.id, { status: 'Approved' }));
    await this.controls.completeSystemTask(`payapp-approve-${payApp.id}`);

    const project = this.data.projectsSnapshot().find(p => p.id === payApp.projectId);
    if (project) await this.ar.upsertFromPayApp(updated, project);

    await this.controls.ensureSystemTask(
      payApp.projectId,
      `payapp-payment-${payApp.id}`,
      `Follow up on payment: ${payApp.payAppNumber}`,
      'Billing / Pay Apps',
      { type: 'PayApp', id: payApp.id },
    );

    return updated;
  }

  async markPayAppInvoiced(payApp: Billing, invoiceNumber?: string): Promise<Billing> {
    const updated = await firstValueFrom(this.data.updateBilling(payApp.id, {
      status: 'Invoiced',
      invoiceNumber: invoiceNumber ?? payApp.invoiceNumber,
      billingPeriodEnd: payApp.billingPeriodEnd ?? new Date().toISOString().slice(0, 10),
    }));

    await this.markCoIdsBilled(payApp);
    await this.controls.completeSystemTask(`payapp-approve-${payApp.id}`);

    const project = this.data.projectsSnapshot().find(p => p.id === payApp.projectId);
    if (project) await this.ar.upsertFromPayApp(updated, project);

    await this.controls.ensureSystemTask(
      payApp.projectId,
      `payapp-payment-${payApp.id}`,
      `Follow up on payment: ${payApp.payAppNumber}`,
      'Billing / Pay Apps',
      { type: 'PayApp', id: payApp.id },
    );

    return updated;
  }

  async markPayAppPaid(payApp: Billing, amountPaid?: number): Promise<Billing> {
    const updated = await firstValueFrom(this.data.updateBilling(payApp.id, {
      status: 'Paid',
      amountPaid: amountPaid ?? payApp.netDue ?? payApp.totalBilledToDate,
      paymentDate: new Date().toISOString().slice(0, 10),
    }));

    await this.markCoBillingStatus(payApp, 'Paid');

    const arRec = this.data.arRecordsSnapshot().find(r =>
      r.payAppId === payApp.id || r.linkedPayAppId === payApp.id,
    );
    if (arRec) {
      await firstValueFrom(this.data.updateArRecord(arRec.id, {
        status: 'Paid',
        paidAmount: amountPaid ?? payApp.netDue ?? payApp.totalBilledToDate,
        openBalance: 0,
        collectionStatus: 'Closed',
      }));
    }

    await this.controls.completeSystemTask(`payapp-payment-${payApp.id}`);
    return updated;
  }

  async voidPayApp(payApp: Billing): Promise<Billing> {
    const coIds = payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? [];
    for (const coId of coIds) {
      await firstValueFrom(this.data.updateChangeOrder(coId, {
        payAppId: undefined,
        billingStatus: 'Approved',
        dateBilled: undefined,
      }));
    }
    return firstValueFrom(this.data.updateBilling(payApp.id, { status: 'Void' }));
  }

  async refreshPayAppAutomation(projectId: string): Promise<void> {
    for (const co of this.approvedUnbilledCos(projectId)) {
      await this.controls.ensureSystemTask(
        projectId,
        `co-billing-${co.id}`,
        `Add approved change order to next pay app: ${coNumber(co)}`,
        'Billing / Pay Apps',
        { type: 'ChangeOrder', id: co.id },
      );
    }

    const draft = this.draftPayApp(projectId);
    if (draft) {
      await this.controls.ensureSystemTask(
        projectId,
        `payapp-submit-${draft.id}`,
        `Submit draft pay app: ${draft.payAppNumber}`,
        'Billing / Pay Apps',
        { type: 'PayApp', id: draft.id },
      );
    }

    const now = Date.now();
    const projectBills = this.data.billingsSnapshot().filter(b => b.projectId === projectId);
    for (const pay of projectBills) {
      if (pay.status === 'Submitted') {
        const submittedAt = pay.submittedAt ?? this.timestampToIso(pay.updatedAt);
        if (submittedAt) {
          const days = (now - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
          if (days >= 7) {
            await this.controls.ensureSystemTask(
              projectId,
              `payapp-approve-${pay.id}`,
              `Follow up on pay app approval: ${pay.payAppNumber}`,
              'Billing / Pay Apps',
              { type: 'PayApp', id: pay.id },
            );
          }
        }
      }

      if (pay.status === 'Approved' || pay.status === 'Invoiced') {
        const due = pay.billingPeriodEnd;
        const unpaid = (pay.netDue ?? pay.totalBilledToDate ?? 0) - (pay.amountPaid ?? 0);
        if (unpaid > 0 && due && new Date(due) < new Date()) {
          await this.controls.ensureSystemTask(
            projectId,
            `payapp-payment-${pay.id}`,
            `Follow up on payment: ${pay.payAppNumber}`,
            'Billing / Pay Apps',
            { type: 'PayApp', id: pay.id },
          );
        }
      }
    }
  }

  private async markCoBillingStatus(payApp: Billing, status: 'SubmittedForBilling' | 'Paid'): Promise<void> {
    const coIds = payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? [];
    for (const coId of coIds) {
      await firstValueFrom(this.data.updateChangeOrder(coId, { billingStatus: status }));
    }
  }

  private async markCoIdsBilled(payApp: Billing): Promise<void> {
    const coIds = payApp.includedChangeOrderIds ?? payApp.changeOrderIds ?? [];
    const billedDate = new Date().toISOString().slice(0, 10);
    for (const coId of coIds) {
      await firstValueFrom(this.data.updateChangeOrder(coId, {
        billingStatus: 'Billed',
        dateBilled: billedDate,
      }));
    }
  }

  private timestampToIso(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      const d = (value as { toDate: () => Date }).toDate();
      return d.toISOString();
    }
    return undefined;
  }
}
