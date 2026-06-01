import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { ArService } from './ar.service';
import { ImportReviewService } from './import-review.service';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { Billing, Project } from '../models/types';
import {
  QbInvoicePacketImportResult,
  QbInvoicePacketRow,
  QbInvoicePacketSeed,
} from '../models/qb-invoice-packet.types';
import packetSeed from '../data/seeds/qb-invoice-packet-seed.json';
import { findProjectMatches } from '../utils/project-dedupe';
import { mergeImportProjectPatch, shouldApplyImportFinancialPatch } from '../utils/lifecycle-import.guard';
import {
  billingStatusForPacketRow,
  invoiceJobMismatch,
  isRetainageInvoice,
  normalizeInvoiceNumber,
  normalizeQbCustomerName,
  parseUsDateToIso,
} from '../utils/qb-invoice-packet.parse';
import { payAppBillableAmount } from '../utils/project-financial.compute';

@Injectable({ providedIn: 'root' })
export class QbInvoicePacketImportService {
  private data = inject(DataService);
  private arSvc = inject(ArService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  running = signal(false);
  lastMessage = signal<string | null>(null);

  seed(): QbInvoicePacketSeed {
    return packetSeed as QbInvoicePacketSeed;
  }

  async importFromSeed(force = false): Promise<QbInvoicePacketImportResult> {
    if (this.running()) {
      return {
        billingsCreated: 0, billingsUpdated: 0, arCreated: 0, arUpdated: 0,
        arClosed: 0, exceptions: 0, unmatched: 0, projectsPatched: 0,
      };
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: QbInvoicePacketImportResult = {
      billingsCreated: 0,
      billingsUpdated: 0,
      arCreated: 0,
      arUpdated: 0,
      arClosed: 0,
      exceptions: 0,
      unmatched: 0,
      projectsPatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      const seed = this.seed();
      const projects = this.data.projectsSnapshot();
      const billedByProject = new Map<string, number>();

      for (const row of seed.invoices) {
        await this.importRow(row, projects, billedByProject, result, force);
      }

      for (const [projectId, billedToDate] of billedByProject.entries()) {
        const project = projects.find(p => p.id === projectId);
        if (!project) continue;
        const snap = this.lifecycle.forProject(project);
        if (!shouldApplyImportFinancialPatch(project, snap)) continue;
        const { patch, conflicts } = mergeImportProjectPatch(project, { billedToDate });
        for (const c of conflicts) {
          this.importReview.addException({
            type: 'importFieldConflict',
            source: 'QuickBooksSync',
            jobNumber: project.projectNumber,
            message: `Invoice packet skipped manual billedToDate on J${project.projectNumber}`,
          });
          result.exceptions++;
        }
        if (Object.keys(patch).length) {
          await firstValueFrom(this.data.updateProject(projectId, patch));
          result.projectsPatched++;
        }
      }

      await this.arSvc.refreshArAutomation();
      this.lastMessage.set(
        `Invoice packet: ${result.billingsCreated} billings created, ${result.billingsUpdated} updated, `
        + `${result.arCreated + result.arUpdated} AR rows synced, ${result.exceptions} review items.`,
      );
      this.importReview.logRun({
        label: 'QuickBooks invoice PDF packet',
        created: result.billingsCreated,
        updated: result.billingsUpdated,
        skipped: 0,
        exceptions: result.exceptions,
        message: this.lastMessage() ?? undefined,
      });
      return result;
    } finally {
      this.running.set(false);
    }
  }

  private async importRow(
    row: QbInvoicePacketRow,
    projects: Project[],
    billedByProject: Map<string, number>,
    result: QbInvoicePacketImportResult,
    force: boolean,
  ): Promise<void> {
    const invoiceNumber = normalizeInvoiceNumber(row.invoiceNumber);
    const customer = normalizeQbCustomerName(row.customer);
    const mismatch = invoiceJobMismatch(row);
    const retainage = isRetainageInvoice(row);

    if (customer !== row.customer.trim()) {
      this.importReview.addException({
        type: 'duplicateVendorName',
        source: 'QuickBooksSync',
        jobNumber: row.jobNumber,
        vendorName: row.customer,
        message: `Customer normalized from "${row.customer}" to "${customer}" on ${invoiceNumber}`,
        status: 'Matched',
      });
      result.exceptions++;
    }

    if (mismatch.mismatch) {
      this.importReview.addException({
        type: 'jobNumberConflict',
        source: 'QuickBooksSync',
        jobNumber: row.jobNumber,
        message: `Invoice ${invoiceNumber} header job J${mismatch.headerJob} vs invoice job J${mismatch.invoiceJob} — verify linkage`,
      });
      result.exceptions++;
    }

    const matchJob = row.jobNumber;
    const matches = findProjectMatches(projects, { projectNumber: matchJob });
    if (!matches.length) {
      this.importReview.addException({
        type: 'unmatchedProject',
        source: 'QuickBooksSync',
        jobNumber: matchJob,
        message: `Invoice packet row not linked to project: ${invoiceNumber} (${customer})`,
      });
      result.unmatched++;
      result.exceptions++;
      return;
    }

    const project = matches[0];
    const existing = this.data.billingsSnapshot().find(b =>
      b.projectId === project.id
      && normalizeInvoiceNumber(b.invoiceNumber ?? b.payAppNumber ?? '') === invoiceNumber,
    );

    if (existing && !force) {
      billedByProject.set(project.id, (billedByProject.get(project.id) ?? 0) + payAppBillableAmount(existing));
      return;
    }

    const invoiceDate = parseUsDateToIso(row.invoiceDate);
    const dueDate = parseUsDateToIso(row.dueDate);
    const status = billingStatusForPacketRow(row);
    const amount = row.amount;
    const isOpen = row.paymentStatus === 'open';

    const billingPayload: Partial<Billing> = {
      projectId: project.id,
      payAppNumber: invoiceNumber,
      invoiceNumber,
      billingPeriod: invoiceNumber,
      billingPeriodStart: invoiceDate,
      billingPeriodEnd: dueDate ?? invoiceDate,
      totalBilledToDate: amount,
      currentApplication: amount,
      netDue: isOpen ? amount : 0,
      amountPaid: isOpen ? 0 : amount,
      retainageAmount: retainage ? amount : 0,
      status,
      arStatus: isOpen ? 'Open' : 'Paid',
      arBalance: isOpen ? amount : 0,
    };

    let billing: Billing;
    if (existing) {
      billing = await firstValueFrom(this.data.updateBilling(existing.id, billingPayload));
      result.billingsUpdated++;
    } else {
      billing = await firstValueFrom(this.data.createBilling(billingPayload));
      result.billingsCreated++;
    }

    billedByProject.set(project.id, (billedByProject.get(project.id) ?? 0) + amount);

    if (isOpen) {
      const before = this.data.arRecordsSnapshot().length;
      await this.arSvc.upsertFromPayApp(billing, project);
      const after = this.data.arRecordsSnapshot().length;
      if (after > before) result.arCreated++;
      else result.arUpdated++;

      const arRec = this.data.arRecordsSnapshot().find(r => r.payAppId === billing.id || r.linkedPayAppId === billing.id);
      if (arRec && retainage) {
        await firstValueFrom(this.data.updateArRecord(arRec.id, {
          retainageAmount: amount,
          source: 'Imported',
          notes: `Retainage invoice from QB packet: ${invoiceNumber}`,
        }));
      }
    } else {
      const arRec = this.data.arRecordsSnapshot().find(r =>
        r.projectId === project.id
        && (r.payAppId === billing.id || r.invoiceNumber === invoiceNumber),
      );
      if (arRec) {
        await this.arSvc.markPaid(arRec, amount);
        result.arClosed++;
      }
    }

    if (retainage && isOpen) {
      this.importReview.addException({
        type: 'retainageReview',
        source: 'QuickBooksSync',
        jobNumber: row.jobNumber,
        message: `Retainage invoice open: ${invoiceNumber} (${customer})`,
        status: 'Imported',
      });
      result.exceptions++;
    }
  }
}
