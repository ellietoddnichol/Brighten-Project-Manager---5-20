import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Billing, Project } from '@app/models/types';
import { ARRecord, ArCollectionStatus } from '@app/models/financial.types';
import { DataService } from '@core/services/data.service';
import { ProjectControlsService } from '@features/projects/services/project-controls.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { agingBucketForDate } from '@features/projects/utils/project-financial.compute';
import { isOpenArRecord } from '@features/financials/utils/wip.compute';

@Injectable({ providedIn: 'root' })
export class ArService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);
  private qbSync = inject(QuickBooksSyncDataService);

  openArForProject(projectId: string): ARRecord[] {
    return this.data.arRecordsSnapshot().filter(r => r.projectId === projectId && isOpenArRecord(r.status));
  }

  openArTotal(projectId?: string): number {
    const records = this.data.arRecordsSnapshot().filter(r =>
      isOpenArRecord(r.status) && (!projectId || r.projectId === projectId),
    );
    return records.reduce((s, r) => s + r.openBalance, 0);
  }

  async upsertFromPayApp(payApp: Billing, project: Project): Promise<ARRecord | null> {
    if (payApp.status === 'Draft' || payApp.status === 'Void') return null;

    const originalAmount = payApp.netDue ?? payApp.totalBilledToDate ?? payApp.currentApplication ?? 0;
    const paidAmount = payApp.amountPaid ?? 0;
    const balance = originalAmount - paidAmount;

    const payAppId = payApp.id;
    const existing = this.data.arRecordsSnapshot().find(r =>
      r.payAppId === payAppId || r.linkedPayAppId === payAppId,
    );

    if (balance <= 0) {
      if (existing) {
        await firstValueFrom(this.data.updateArRecord(existing.id, {
          status: 'Paid',
          paidAmount: originalAmount,
          openBalance: 0,
          collectionStatus: 'Closed',
        }));
        await this.controls.completeSystemTask(`ar-followup-${existing.id}`);
        await this.controls.completeSystemTask(`ar-escalate-${existing.id}`);
        await this.controls.completeSystemTask(`ar-review-${existing.id}`);
      }
      return null;
    }

    const dueDate = payApp.billingPeriodEnd ?? new Date().toISOString().slice(0, 10);
    const payload: Partial<ARRecord> = {
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      customer: project.customer,
      invoiceNumber: payApp.invoiceNumber ?? payApp.payAppNumber,
      payAppId,
      linkedPayAppId: payAppId,
      invoiceDate: payApp.billingPeriodStart ?? dueDate,
      dueDate,
      originalAmount,
      paidAmount,
      openBalance: balance,
      retainageAmount: payApp.retainageAmount,
      agingBucket: agingBucketForDate(dueDate),
      status: paidAmount > 0 ? 'PartiallyPaid' : 'Open',
      collectionStatus: existing?.collectionStatus ?? 'NotStarted',
      source: 'PayApp',
    };

    if (existing) {
      return firstValueFrom(this.data.updateArRecord(existing.id, {
        ...payload,
        notes: existing.notes,
        collectionStatus: existing.collectionStatus ?? payload.collectionStatus,
      }));
    }
    return firstValueFrom(this.data.createArRecord(payload));
  }

  async syncFromPayApps(): Promise<void> {
    await this.data.waitForProjectsLoaded();
    for (const payApp of this.data.billingsSnapshot()) {
      if (!['Submitted', 'Approved', 'Invoiced', 'Paid', 'Past Due'].includes(payApp.status ?? '')) continue;
      const project = this.data.projectsSnapshot().find(p => p.id === payApp.projectId);
      if (project) await this.upsertFromPayApp(payApp, project);
    }
    await this.syncSummaryFromProjectBalances();
  }

  /** Create summary AR rows from project.currentAR when invoice-level records are missing. */
  async syncSummaryFromProjectBalances(): Promise<void> {
    if (this.qbSync.arAging().length === 0) return;

    for (const project of this.data.projectsSnapshot()) {
      const balance = project.currentAR ?? 0;
      if (balance <= 0) continue;

      const openForProject = this.data.arRecordsSnapshot().filter(r =>
        r.projectId === project.id && isOpenArRecord(r.status),
      );
      if (openForProject.length) continue;

      await firstValueFrom(this.data.createArRecord({
        projectId: project.id,
        jobNumber: project.projectNumber,
        projectName: project.projectName,
        customer: project.customer,
        invoiceNumber: 'QB Summary',
        invoiceDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        originalAmount: balance,
        paidAmount: 0,
        openBalance: balance,
        agingBucket: agingBucketForDate(new Date().toISOString().slice(0, 10)),
        status: 'Open',
        collectionStatus: 'NotStarted',
        source: 'QuickBooksArAging',
        notes: 'Summary from QuickBooks AR Aging',
      }));
    }
  }

  async markPaid(record: ARRecord, paidAmount?: number): Promise<ARRecord> {
    const paid = paidAmount ?? record.originalAmount;
    const updated = await firstValueFrom(this.data.updateArRecord(record.id, {
      status: 'Paid',
      paidAmount: paid,
      openBalance: 0,
      collectionStatus: 'Closed',
    }));
    await this.closeArTasks(record);
    return updated;
  }

  async markPartiallyPaid(record: ARRecord, paidAmount: number): Promise<ARRecord> {
    const openBalance = Math.max(0, record.originalAmount - paidAmount);
    return firstValueFrom(this.data.updateArRecord(record.id, {
      status: openBalance > 0 ? 'PartiallyPaid' : 'Paid',
      paidAmount,
      openBalance,
      collectionStatus: openBalance > 0 ? 'FollowUpNeeded' : 'Closed',
    }));
  }

  async markDisputed(record: ARRecord, notes?: string): Promise<ARRecord> {
    const updated = await firstValueFrom(this.data.updateArRecord(record.id, {
      status: 'Disputed',
      collectionStatus: 'Disputed',
      notes: notes ?? record.notes,
    }));
    await this.controls.ensureSystemTask(
      record.projectId,
      `ar-dispute-${record.id}`,
      `Resolve disputed invoice: ${record.invoiceNumber || record.jobNumber}`,
      'Billing / Pay Apps',
      { type: 'AR', id: record.id },
    );
    return updated;
  }

  async setCollectionStatus(record: ARRecord, status: ArCollectionStatus, notes?: string): Promise<ARRecord> {
    return firstValueFrom(this.data.updateArRecord(record.id, {
      collectionStatus: status,
      notes: notes ?? record.notes,
      lastContactDate: status === 'Contacted' ? new Date().toISOString().slice(0, 10) : record.lastContactDate,
    }));
  }

  async setFollowUpDate(record: ARRecord, nextFollowUpDate: string): Promise<ARRecord> {
    return firstValueFrom(this.data.updateArRecord(record.id, { nextFollowUpDate }));
  }

  async addNote(record: ARRecord, note: string): Promise<ARRecord> {
    const notes = record.notes ? `${record.notes}\n${note}` : note;
    return firstValueFrom(this.data.updateArRecord(record.id, { notes }));
  }

  async refreshArAutomation(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const open = this.data.arRecordsSnapshot().filter(r => isOpenArRecord(r.status));

    for (const rec of open) {
      const bucket = agingBucketForDate(rec.dueDate);
      if (bucket !== rec.agingBucket) {
        await firstValueFrom(this.data.updateArRecord(rec.id, { agingBucket: bucket }));
      }

      const label = rec.invoiceNumber || rec.jobNumber || rec.projectName || rec.id;

      if (bucket === '1-30') {
        await this.controls.ensureSystemTask(
          rec.projectId,
          `ar-followup-${rec.id}`,
          `AR follow-up needed: ${label}`,
          'Billing / Pay Apps',
          { type: 'AR', id: rec.id },
        );
      } else if (bucket === '31-60') {
        await this.controls.ensureSystemTask(
          rec.projectId,
          `ar-escalate-${rec.id}`,
          `Escalate AR follow-up: ${label}`,
          'Billing / Pay Apps',
          { type: 'AR', id: rec.id },
        );
      } else if (bucket === '61-90' || bucket === '90+') {
        await this.controls.ensureSystemTask(
          rec.projectId,
          `ar-review-${rec.id}`,
          `Review long-outstanding AR: ${label}`,
          'Billing / Pay Apps',
          { type: 'AR', id: rec.id },
        );
      }

      if (rec.status === 'Disputed') {
        await this.controls.ensureSystemTask(
          rec.projectId,
          `ar-dispute-${rec.id}`,
          `Resolve disputed invoice: ${label}`,
          'Billing / Pay Apps',
          { type: 'AR', id: rec.id },
        );
      }

      if (rec.nextFollowUpDate && rec.nextFollowUpDate <= today) {
        await this.controls.ensureSystemTask(
          rec.projectId,
          `ar-followup-date-${rec.id}`,
          `Follow up on payment: ${label}`,
          'Billing / Pay Apps',
          { type: 'AR', id: rec.id },
        );
      }
    }
  }

  isCloseoutAr(record: ARRecord, project?: Project): boolean {
    const p = project ?? this.data.projectsSnapshot().find(x => x.id === record.projectId);
    if (!p) return false;
    return p.status === 'Closeout' || p.status === 'Closed' || !!p.dashboardGroup?.includes('Closeout');
  }

  private async closeArTasks(record: ARRecord): Promise<void> {
    await this.controls.completeSystemTask(`ar-followup-${record.id}`);
    await this.controls.completeSystemTask(`ar-escalate-${record.id}`);
    await this.controls.completeSystemTask(`ar-review-${record.id}`);
    await this.controls.completeSystemTask(`ar-followup-date-${record.id}`);
    await this.controls.completeSystemTask(`ar-dispute-${record.id}`);
  }
}
