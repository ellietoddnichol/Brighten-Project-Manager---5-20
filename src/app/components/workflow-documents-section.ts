import { Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Project } from '../models/types';
import { WorkflowType } from '../models/workflow-document.types';
import { DataService } from '../services/data.service';
import { ProjectWorkflowSaveService } from '../services/project-workflow-save.service';
import {
  buildChangeRequestHtml,
  buildDailyLogHtml,
  buildPayAppHtml,
  buildRfiHtml,
  buildSubmittalCoverHtml,
} from '../utils/workflow-document-templates';
import { ChangeOrderDocumentService } from '../services/change-order-document.service';

@Component({
  selector: 'app-workflow-documents-section',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h4 class="text-sm font-bold text-slate-900">Documents / Attachments</h4>
        <div class="flex flex-wrap items-center gap-2">
          @if (canGenerate()) {
            <button type="button" (click)="generateDocument()" [disabled]="uploading()"
                    class="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50">
              Generate Document
            </button>
          }
          <label class="cursor-pointer text-xs font-semibold text-emerald-700 hover:text-emerald-900">
            <input type="file" class="hidden" (change)="onFileSelected($event)" [disabled]="uploading()" />
            Upload File
          </label>
          @if (photoUpload) {
            <label class="cursor-pointer text-xs font-semibold text-violet-700 hover:text-violet-900">
              <input type="file" accept="image/*" class="hidden" (change)="onPhotoSelected($event)" [disabled]="uploading()" />
              Upload Photo
            </label>
          }
          @if (backupUpload) {
            <label class="cursor-pointer text-xs font-semibold text-slate-700 hover:text-slate-900">
              <input type="file" class="hidden" (change)="onBackupSelected($event)" [disabled]="uploading()" />
              Upload Backup
            </label>
          }
          @if (signedUpload) {
            <label class="cursor-pointer text-xs font-semibold text-indigo-700 hover:text-indigo-900">
              <input type="file" class="hidden" (change)="onSignedSelected($event)" [disabled]="uploading()" />
              Upload Signed
            </label>
          }
          <button type="button" (click)="openDriveMapping()"
                  class="text-xs font-semibold text-orange-700 hover:text-orange-900">
            Fix Drive Mapping
          </button>
        </div>
      </div>

      @if (lastMessage()) {
        <div class="rounded-md px-3 py-2 text-xs"
             [class.bg-amber-50]="lastWarning()"
             [class.text-amber-900]="lastWarning()"
             [class.bg-emerald-50]="!lastWarning()"
             [class.text-emerald-900]="!lastWarning()">
          {{ lastMessage() }}
        </div>
      }

      <ul class="space-y-2">
        @for (file of files(); track file.id) {
          <li class="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <div class="min-w-0">
              <div class="font-medium text-slate-900 truncate">{{ file.fileName }}</div>
              <div class="text-xs text-slate-500">{{ file.documentType }} · {{ file.documentStatus }}</div>
              @if (file.notes || file.saveWarning) {
                <div class="text-xs mt-1"
                     [class.text-amber-700]="file.saveWarning"
                     [class.text-slate-600]="!file.saveWarning">
                  {{ file.saveWarning ?? file.notes }}
                </div>
              }
            </div>
            @if (file.fileUrl) {
              <a [href]="file.fileUrl" target="_blank" rel="noopener"
                 class="shrink-0 text-xs font-semibold text-blue-600 hover:underline">Open</a>
            }
          </li>
        } @empty {
          <li class="text-xs text-slate-400 italic">No documents saved yet.</li>
        }
      </ul>
    </div>
  `,
})
export class WorkflowDocumentsSectionComponent {
  @Input({ required: true }) project!: Project;
  @Input({ required: true }) workflowType!: WorkflowType;
  @Input({ required: true }) sourceRecordId!: string;
  @Input() documentType = 'Attachment';
  @Input() photoUpload = false;
  @Input() backupUpload = false;
  @Input() signedUpload = false;
  @Input() canGenerateDoc = false;

  private workflowSave = inject(ProjectWorkflowSaveService);
  private coDoc = inject(ChangeOrderDocumentService);
  private data = inject(DataService);
  private router = inject(Router);

  private allFiles = toSignal(this.data.getProjectFiles(), { initialValue: [] });

  uploading = signal(false);
  lastMessage = signal<string | null>(null);
  lastWarning = signal(false);

  files = computed(() => {
    this.allFiles();
    return this.workflowSave.filesForRecord(this.project.id, this.workflowType, this.sourceRecordId);
  });

  canGenerate = computed(() => this.canGenerateDoc && !!this.sourceRecordId);

  openDriveMapping(): void {
    void this.router.navigate(['/projects', this.project.id], { queryParams: { tab: 'drive-mapping' } });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await this.uploadBlob(file, file.name, this.documentType);
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await this.uploadBlob(file, file.name, 'Photo', 'PHOTOS');
  }

  async onBackupSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    await this.uploadBlob(file, file.name, 'Backup Attachment');
  }

  async onSignedSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const docType = this.workflowType === 'billing'
      ? 'Signed Pay App'
      : this.workflowType === 'certified_payroll'
        ? 'Signed CPR Package'
        : 'Signed CO';
    await this.uploadBlob(file, file.name, docType);
  }

  async generateDocument(): Promise<void> {
    this.uploading.set(true);
    this.lastMessage.set(null);
    try {
      if (this.workflowType === 'change_order') {
        const co = this.data.changeOrdersSnapshot().find(c => c.id === this.sourceRecordId);
        if (!co) throw new Error('Change order not found');
        const saved = await this.coDoc.generateAndSave(this.project, co);
        this.applyResult(saved.notes, !!saved.saveWarning);
        return;
      }

      let html = '';
      let fileName = '';
      let docType = 'Generated Document';

      if (this.workflowType === 'change_request') {
        const cr = this.data.changeRequestsSnapshot().find(c => c.id === this.sourceRecordId);
        if (!cr) throw new Error('Change request not found');
        html = buildChangeRequestHtml(this.project, cr);
        fileName = `${cr.crNumber || 'CR'}-${this.project.projectNumber}-Change-Request.html`;
        docType = 'Change Request';
      } else if (this.workflowType === 'rfi') {
        const rfi = this.data.rfisSnapshot().find(r => r.id === this.sourceRecordId);
        if (!rfi) throw new Error('RFI not found');
        html = buildRfiHtml(this.project, rfi);
        fileName = `${rfi.rfiNumber || 'RFI'}-${this.project.projectNumber}.html`;
        docType = 'RFI';
      } else if (this.workflowType === 'daily_log') {
        const log = this.data.dailyLogsSnapshot().find(l => l.id === this.sourceRecordId);
        if (!log) throw new Error('Daily log not found');
        html = buildDailyLogHtml(this.project, log);
        fileName = `Daily-Log-${log.logDate}-${this.project.projectNumber}.html`;
        docType = 'Daily Log';
      } else if (this.workflowType === 'submittal') {
        const sub = this.data.submittalsSnapshot().find(s => s.id === this.sourceRecordId);
        if (!sub) throw new Error('Submittal not found');
        html = buildSubmittalCoverHtml(this.project, sub);
        fileName = `${sub.submittalNumber || 'SUB'}-${this.project.projectNumber}-Cover.html`;
        docType = 'Submittal Cover Sheet';
      } else if (this.workflowType === 'billing') {
        const billing = this.data.billingsSnapshot().find(b => b.id === this.sourceRecordId);
        if (!billing) throw new Error('Pay app not found');
        html = buildPayAppHtml(this.project, billing);
        fileName = `Pay-App-${billing.payAppNumber}-${this.project.projectNumber}.html`;
        docType = 'Pay Application';
      } else {
        throw new Error('Generate not supported for this workflow');
      }

      const result = await this.workflowSave.saveProjectWorkflowFile({
        projectId: this.project.id,
        workflowType: this.workflowType,
        fileName,
        content: html,
        mimeType: 'text/html',
        documentType: docType,
        documentStatus: 'Generated',
        sourceRecordId: this.sourceRecordId,
        requestAuthIfNeeded: true,
      });
      this.applyResult(result.savedToLabel, !!(result.warning || result.usedFallback));
    } catch (err) {
      this.lastWarning.set(true);
      this.lastMessage.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.uploading.set(false);
    }
  }

  private async uploadBlob(
    blob: Blob,
    fileName: string,
    documentType: string,
    folderKeyOverride?: string,
  ): Promise<void> {
    this.uploading.set(true);
    this.lastMessage.set(null);
    try {
      const result = await this.workflowSave.saveProjectWorkflowFile({
        projectId: this.project.id,
        workflowType: this.workflowType,
        folderKey: folderKeyOverride,
        fileName,
        content: blob,
        mimeType: blob.type || undefined,
        documentType,
        sourceRecordId: this.sourceRecordId,
        requestAuthIfNeeded: true,
      });
      this.applyResult(result.savedToLabel, !!(result.warning || result.usedFallback));
    } catch (err) {
      this.lastWarning.set(true);
      this.lastMessage.set(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      this.uploading.set(false);
    }
  }

  private applyResult(message: string | undefined, isWarning: boolean): void {
    this.lastMessage.set(message ?? 'File saved');
    this.lastWarning.set(isWarning);
  }
}
