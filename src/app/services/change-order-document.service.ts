import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChangeOrder, Project, ProjectFile } from '../models/types';
import { coNumber, coPricingFromOrder } from '../utils/change-management';
import { ChangeOrderPricingInput, ProjectControlsService } from './project-controls.service';
import { DataService } from './data.service';
import { ProjectWorkflowSaveService } from './project-workflow-save.service';
import { coFileName } from '../utils/workflow-document-templates';

@Injectable({ providedIn: 'root' })
export class ChangeOrderDocumentService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);
  private workflowSave = inject(ProjectWorkflowSaveService);

  buildHtml(project: Project, co: ChangeOrder): string {
    const pricing: ChangeOrderPricingInput = coPricingFromOrder(co);
    const totals = this.controls.calcChangeOrderTotal(pricing);
    const total = co.approvedAmount ?? co.totalAmount ?? co.sellPrice ?? totals.sellPrice;
    const today = new Date().toLocaleDateString();
    const backupList = (co.backupAttachmentUrls ?? []).length
      ? `<div class="section"><strong>Backup Attachments</strong><ul>${(co.backupAttachmentUrls ?? []).map(u => `<li>${escapeHtml(u)}</li>`).join('')}</ul></div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(coNumber(co))} — ${escapeHtml(project.projectName)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; max-width: 800px; margin: 40px auto; line-height: 1.5; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 14px; color: #555; margin-top: 0; font-weight: normal; }
    .meta { margin: 24px 0; }
    .meta div { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; }
    .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 16px; }
    .section { margin-top: 24px; }
    .signatures { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sig-line { border-top: 1px solid #333; margin-top: 48px; padding-top: 6px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Brighten Builders LLC</h1>
  <h2>Change Order</h2>
  <div class="meta">
    <div><strong>Project:</strong> ${escapeHtml(project.projectName)}</div>
    <div><strong>Project Number:</strong> J${escapeHtml(project.projectNumber)}</div>
    <div><strong>Change Order #:</strong> ${escapeHtml(coNumber(co))}</div>
    <div><strong>Date:</strong> ${escapeHtml(co.dateSent ?? co.dateCreated ?? today)}</div>
    ${co.requestedBy ? `<div><strong>Requested By:</strong> ${escapeHtml(co.requestedBy)}</div>` : ''}
    ${co.customerContact ? `<div><strong>Customer:</strong> ${escapeHtml(co.customerContact)}</div>` : ''}
    ${co.gcContact ? `<div><strong>GC:</strong> ${escapeHtml(co.gcContact)}</div>` : ''}
    ${co.ownerContact ? `<div><strong>Owner:</strong> ${escapeHtml(co.ownerContact)}</div>` : ''}
  </div>
  <div class="section">
    <strong>Description of Change</strong>
    <p>${escapeHtml(co.description ?? co.title ?? '—')}</p>
    ${co.reason ? `<p><strong>Reason:</strong> ${escapeHtml(co.reason)}</p>` : ''}
  </div>
  <div class="section">
    <strong>Cost Breakdown</strong>
    <table>
      <tr><th>Category</th><th>Amount</th></tr>
      <tr><td>Labor</td><td>${money(pricing.laborCost)}</td></tr>
      <tr><td>Material</td><td>${money(pricing.materialCost)}</td></tr>
      <tr><td>Subcontractor</td><td>${money(pricing.subCost)}</td></tr>
      <tr><td>Equipment</td><td>${money(pricing.equipmentCost)}</td></tr>
      <tr><td>Other</td><td>${money(pricing.otherCost)}</td></tr>
      <tr><td>Overhead (${pricing.overheadPercent ?? 0}%)</td><td>${money(totals.overhead)}</td></tr>
      <tr><td>Profit (${pricing.profitPercent ?? 0}%)</td><td>${money(totals.profit)}</td></tr>
      <tr><td>Bond / Insurance (${pricing.bondInsurancePercent ?? 0}%)</td><td>${money(totals.bondInsurance)}</td></tr>
      <tr><td>Tax</td><td>${money(pricing.taxAmount)}</td></tr>
    </table>
    <div class="total">Total Change Order Amount: ${money(total)}</div>
  </div>
  ${co.scheduleImpactDays || co.daysAdded ? `<div class="section"><strong>Schedule Impact:</strong> ${co.scheduleImpactDays ?? co.daysAdded} day(s) — ${escapeHtml(co.scheduleImpactDescription ?? '')}</div>` : ''}
  ${co.clarifications ? `<div class="section"><strong>Clarifications:</strong><p>${escapeHtml(co.clarifications)}</p></div>` : ''}
  ${co.exclusions ? `<div class="section"><strong>Exclusions:</strong><p>${escapeHtml(co.exclusions)}</p></div>` : ''}
  ${backupList}
  <div class="signatures">
    <div><div class="sig-line">Brighten Builders — Authorized Signature</div></div>
    <div><div class="sig-line">Owner / GC — Approval Signature</div></div>
  </div>
</body>
</html>`;
  }

  async generateAndSave(project: Project, co: ChangeOrder): Promise<ProjectFile> {
    const html = this.buildHtml(project, co);
    const fileName = coFileName(co, project);

    const result = await this.workflowSave.saveProjectWorkflowFile({
      projectId: project.id,
      workflowType: 'change_order',
      folderKey: 'CHANGE_ORDERS',
      fileName,
      content: html,
      mimeType: 'text/html',
      documentType: 'Change Order',
      documentStatus: 'Generated',
      sourceRecordId: co.id,
      requestAuthIfNeeded: true,
    });

    await firstValueFrom(this.data.updateChangeOrder(co.id, {
      generatedDocumentId: result.projectFileId,
      linkedFile: result.fileUrl,
    }));
    await this.controls.onChangeOrderDocumentGenerated(co);

    const projectFile = this.data.projectFilesSnapshot().find(f => f.id === result.projectFileId);
    if (projectFile) return projectFile;

    return {
      id: result.projectFileId,
      projectId: project.id,
      fileName,
      fileUrl: result.fileUrl,
      documentType: 'Change Order',
      documentStatus: 'Generated',
      notes: result.savedToLabel,
      saveWarning: result.warning,
    } as ProjectFile;
  }

  openPrintPreview(project: Project, co: ChangeOrder): void {
    const html = this.buildHtml(project, co);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }
}

function money(value?: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
}

function escapeHtml(value?: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
