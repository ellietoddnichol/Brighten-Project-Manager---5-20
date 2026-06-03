import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  SaveWorkflowFileInput,
  SaveWorkflowFileResult,
  WORKFLOW_FOLDER_CONFIG,
  WorkflowType,
} from '@app/models/workflow-document.types';
import { Project, ProjectFile } from '@app/models/types';
import { DataService } from '@core/services/data.service';
import { DriveService } from '@core/services/drive.service';
import { ProjectDocumentSaveService } from '@features/projects/services/project-document-save.service';
import { AuthService } from '@core/services/auth.service';
import { persistableFileMetadata } from '@features/projects/utils/project-documents.compute';

@Injectable({ providedIn: 'root' })
export class ProjectWorkflowSaveService {
  private data = inject(DataService);
  private drive = inject(DriveService);
  private documentSave = inject(ProjectDocumentSaveService);
  private auth = inject(AuthService);

  async saveProjectWorkflowFile(input: SaveWorkflowFileInput): Promise<SaveWorkflowFileResult> {
    const project = this.data.getProjectsSnapshot().find(p => p.id === input.projectId);
    if (!project) throw new Error('Project not found');

    const config = WORKFLOW_FOLDER_CONFIG[input.workflowType];
    const folderKey = input.folderKey ?? config.primary;
    const fallbacks = input.fallbackFolderKeys ?? config.fallbacks ?? [];
    let shouldUpload = input.driveUpload !== false;
    let uploadWarning: string | undefined;

    let target = folderKey === 'PHOTOS'
      ? this.documentSave.resolveMappedFolder(project, 'PHOTOS')
      : null;

    if (folderKey === 'PHOTOS') {
      if (!target) {
        shouldUpload = false;
        uploadWarning = 'Photos folder not mapped — photo attached to daily log record.';
      }
    } else {
      target = await this.documentSave.ensureSaveTarget(project, folderKey, fallbacks);
      uploadWarning = target?.warning;
    }

    const savedToLabel = target
      ? this.documentSave.savedToLabel(target)
      : folderKey === 'PHOTOS' && !shouldUpload
        ? 'Photo attached to daily log record (Photos folder not mapped).'
        : 'Saved locally — link project Drive folder in Setup';

    let fileUrl: string | undefined;
    let fileId: string | undefined;
    let driveUploaded = false;

    if (shouldUpload && target) {
      let token = await this.auth.getAccessToken();
      if (!token && input.requestAuthIfNeeded) {
        token = await this.auth.refreshDriveAccess();
      }

      if (!token) {
        uploadWarning = 'Drive not connected — Re-authorize Drive to save to project folder.';
      } else {
        try {
          const mimeType = input.mimeType ?? this.guessMimeType(input.fileName, input.content);
          const uploaded = await this.drive.uploadFile(
            target.folderId,
            input.fileName,
            input.content,
            mimeType,
          );
          fileUrl = uploaded.webViewLink;
          fileId = uploaded.id;
          driveUploaded = true;
        } catch (err) {
          uploadWarning = err instanceof Error ? err.message : 'Drive upload failed';
          console.warn('Drive upload failed, saving document metadata only:', err);
        }
      }
    }

    const blobUrl = !fileUrl
      ? URL.createObjectURL(this.toBlob(input.content, input.mimeType ?? 'application/octet-stream'))
      : undefined;

    const linkFields = this.linkFieldsForWorkflow(input.workflowType, input.sourceRecordId);
    const draft: Partial<ProjectFile> = {
      projectId: project.id,
      folderKey,
      fileName: input.fileName,
      fileId,
      fileUrl: fileUrl ?? blobUrl,
      mimeType: input.mimeType ?? this.guessMimeType(input.fileName, input.content),
      fileType: input.mimeType ?? this.guessMimeType(input.fileName, input.content),
      documentType: input.documentType,
      documentStatus: input.documentStatus ?? 'Uploaded',
      workflowType: input.workflowType,
      sourceRecordId: input.sourceRecordId,
      relatedRecordType: this.relatedRecordType(input.workflowType),
      relatedRecordId: input.sourceRecordId,
      driveFolderId: target?.folderId,
      drivePath: target?.drivePath,
      saveWarning: uploadWarning ?? target?.warning,
      notes: input.notes ?? savedToLabel,
      uploadedBy: this.auth.user()?.email ?? undefined,
      ...linkFields,
    };
    const metadata = persistableFileMetadata(draft, savedToLabel);
    const projectFile = await firstValueFrom(this.data.createProjectFile({
      ...draft,
      ...metadata,
    }));

    if (input.sourceRecordId) {
      await this.linkToSourceRecord(
        project,
        input.workflowType,
        input.sourceRecordId,
        fileUrl ?? blobUrl ?? '',
        input.documentType,
        projectFile.id,
      );
    }

    return {
      projectFileId: projectFile.id,
      fileName: input.fileName,
      fileUrl: fileUrl ?? blobUrl ?? '',
      driveFileId: fileId,
      driveFolderId: target?.folderId,
      drivePath: target?.drivePath,
      folderKey,
      savedToLabel,
      usedFallback: target?.usedFallback ?? false,
      warning: uploadWarning ?? target?.warning,
      driveUploaded,
    };
  }

  filesForRecord(projectId: string, workflowType: WorkflowType, sourceRecordId: string): ProjectFile[] {
    return this.data.projectFilesSnapshot().filter(f =>
      f.projectId === projectId
      && f.workflowType === workflowType
      && (f.sourceRecordId === sourceRecordId || this.matchesLegacyLink(f, workflowType, sourceRecordId)),
    );
  }

  private matchesLegacyLink(file: ProjectFile, workflowType: WorkflowType, sourceRecordId: string): boolean {
    switch (workflowType) {
      case 'change_request': return file.changeRequestId === sourceRecordId;
      case 'change_order': return file.changeOrderId === sourceRecordId;
      case 'rfi': return file.rfiId === sourceRecordId;
      case 'submittal': return file.submittalId === sourceRecordId;
      case 'billing': return file.billingId === sourceRecordId;
      case 'certified_payroll': return file.certifiedPayrollWeekId === sourceRecordId;
      case 'daily_log': return file.dailyLogId === sourceRecordId;
      case 'purchase_order': return file.poId === sourceRecordId;
      case 'subcontractor_compliance': return file.projectSubcontractorId === sourceRecordId;
      case 'subcontractor_invoice': return file.subcontractorInvoiceId === sourceRecordId;
      default: return false;
    }
  }

  private relatedRecordType(workflowType: WorkflowType): string {
    const map: Record<WorkflowType, string> = {
      change_request: 'ChangeRequest',
      change_order: 'ChangeOrder',
      rfi: 'Rfi',
      submittal: 'Submittal',
      billing: 'Billing',
      certified_payroll: 'CertifiedPayrollWeek',
      daily_log: 'DailyLog',
      closeout: 'Closeout',
      purchase_order: 'PO',
      subcontractor_compliance: 'ProjectSubcontractor',
      subcontractor_invoice: 'SubcontractorInvoice',
    };
    return map[workflowType];
  }

  private linkFieldsForWorkflow(workflowType: WorkflowType, sourceRecordId?: string): Partial<ProjectFile> {
    if (!sourceRecordId) return {};
    switch (workflowType) {
      case 'change_request': return { changeRequestId: sourceRecordId };
      case 'change_order': return { changeOrderId: sourceRecordId };
      case 'rfi': return { rfiId: sourceRecordId };
      case 'submittal': return { submittalId: sourceRecordId };
      case 'billing': return { billingId: sourceRecordId };
      case 'certified_payroll': return { certifiedPayrollWeekId: sourceRecordId };
      case 'daily_log': return { dailyLogId: sourceRecordId };
      case 'purchase_order': return { poId: sourceRecordId };
      case 'subcontractor_compliance': return { projectSubcontractorId: sourceRecordId };
      case 'subcontractor_invoice': return { subcontractorInvoiceId: sourceRecordId };
      default: return {};
    }
  }

  private async linkToSourceRecord(
    _project: Project,
    workflowType: WorkflowType,
    sourceRecordId: string,
    fileUrl: string,
    documentType: string,
    fileId: string,
  ): Promise<void> {
    const appendUrl = (existing?: string[]) => [...(existing ?? []), fileUrl];
    const appendId = (existing?: string[]) => [...(existing ?? []), fileId];

    switch (workflowType) {
      case 'change_request': {
        const cr = this.data.changeRequestsSnapshot().find(c => c.id === sourceRecordId);
        if (cr) {
          await firstValueFrom(this.data.updateChangeRequest(sourceRecordId, {
            attachmentUrls: appendUrl(cr.attachmentUrls),
            attachmentIds: appendId(cr.attachmentIds),
          }));
        }
        break;
      }
      case 'change_order': {
        const co = this.data.changeOrdersSnapshot().find(c => c.id === sourceRecordId);
        if (!co) break;
        if (documentType.toLowerCase().includes('signed') || documentType.toLowerCase().includes('approved')) {
          await firstValueFrom(this.data.updateChangeOrder(sourceRecordId, {
            linkedFile: fileUrl,
            signedDocumentId: fileId,
          }));
        } else if (documentType.toLowerCase().includes('backup')) {
          await firstValueFrom(this.data.updateChangeOrder(sourceRecordId, {
            backupAttachmentUrls: appendUrl(co.backupAttachmentUrls),
            backupDocumentIds: appendId(co.backupDocumentIds),
          }));
        } else {
          await firstValueFrom(this.data.updateChangeOrder(sourceRecordId, {
            linkedFile: fileUrl,
            generatedDocumentId: fileId,
          }));
        }
        break;
      }
      case 'rfi': {
        const rfi = this.data.rfisSnapshot().find(r => r.id === sourceRecordId);
        if (rfi) await firstValueFrom(this.data.updateRfi(sourceRecordId, { attachmentUrls: appendUrl(rfi.attachmentUrls) }));
        break;
      }
      case 'submittal': {
        const sub = this.data.submittalsSnapshot().find(s => s.id === sourceRecordId);
        if (sub) await firstValueFrom(this.data.updateSubmittal(sourceRecordId, { attachmentUrls: appendUrl(sub.attachmentUrls) }));
        break;
      }
      case 'billing': {
        const billing = this.data.billingsSnapshot().find(b => b.id === sourceRecordId);
        if (billing) {
          const updates: Partial<typeof billing> = {};
          if (documentType.toLowerCase().includes('invoice')) updates.invoiceLink = fileUrl;
          else updates.payAppLink = fileUrl;
          await firstValueFrom(this.data.updateBilling(sourceRecordId, updates));
        }
        break;
      }
      case 'daily_log': {
        const log = this.data.dailyLogsSnapshot().find(l => l.id === sourceRecordId);
        if (log) await firstValueFrom(this.data.updateDailyLog(sourceRecordId, { photoUrls: appendUrl(log.photoUrls) }));
        break;
      }
      default:
        break;
    }
  }

  private guessMimeType(fileName: string, content: string | Blob): string {
    if (content instanceof Blob && content.type) return content.type;
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.html')) return 'text/html';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (typeof content === 'string' && content.trimStart().startsWith('<!DOCTYPE')) return 'text/html';
    return 'application/octet-stream';
  }

  private toBlob(content: string | Blob, mimeType: string): Blob {
    if (content instanceof Blob) return content;
    return new Blob([content], { type: mimeType });
  }
}
