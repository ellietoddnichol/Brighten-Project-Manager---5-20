import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PO, Project, ProjectBudgetLine } from '@app/models/types';
import { ProjectSubcontractor, Subcontractor, SubcontractorDocument, SubcontractorDocumentType } from '@app/models/subcontractor.types';
import { DataService } from '@core/services/data.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { SubcontractorTasksService } from '@features/subcontractors/services/subcontractor-tasks.service';
import { ProjectWorkflowSaveService } from '@features/projects/services/project-workflow-save.service';
import {
  computeProjectSubComplianceStatus,
  folderKeyForSubDocumentType,
  resolveDocumentStatus,
  validateApprovedToStartStatus,
} from '@features/subcontractors/utils/subcontractor-compliance.compute';
import { poCommittedAmount } from '@features/projects/utils/budget-line.compute';

@Injectable({ providedIn: 'root' })
export class ProjectSubcontractorService {
  private data = inject(DataService);
  private subSvc = inject(SubcontractorService);
  private tasks = inject(SubcontractorTasksService);
  private workflowSave = inject(ProjectWorkflowSaveService);

  forProject(projectId: string): ProjectSubcontractor[] {
    return this.data.projectSubcontractorsSnapshot().filter(ps => ps.projectId === projectId);
  }

  async assignToProject(
    project: Project,
    subcontractor: Subcontractor,
    draft: Partial<ProjectSubcontractor> = {},
  ): Promise<ProjectSubcontractor> {
    const performanceStatus = subcontractor.status === 'DoNotUse' ? 'DoNotUse' : 'Good';
    const ps = await firstValueFrom(this.data.createProjectSubcontractor({
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      subcontractorId: subcontractor.id,
      subcontractorName: subcontractor.companyName,
      trade: draft.trade ?? subcontractor.trade,
      scopeOfWork: draft.scopeOfWork,
      costCode: draft.costCode,
      budgetLineId: draft.budgetLineId,
      linkedPurchaseOrderId: draft.linkedPurchaseOrderId,
      linkedChangeOrderIds: draft.linkedChangeOrderIds ?? [],
      linkedSubmittalIds: draft.linkedSubmittalIds ?? [],
      originalCommitmentAmount: draft.originalCommitmentAmount ?? 0,
      currentCommitmentAmount: draft.currentCommitmentAmount ?? draft.originalCommitmentAmount ?? 0,
      status: draft.status ?? 'Planned',
      complianceStatus: 'MissingItems',
      performanceStatus,
      notes: draft.notes,
    }));

    await this.refreshCompliance(ps.id);
    if (!project.hasSubcontractors) {
      await firstValueFrom(this.data.updateProject(project.id, { hasSubcontractors: true }));
    }
    return ps;
  }

  async saveProjectSubcontractor(
    ps: ProjectSubcontractor,
    updates: Partial<ProjectSubcontractor>,
  ): Promise<ProjectSubcontractor> {
    if (updates.status === 'ApprovedToStart') {
      const check = validateApprovedToStartStatus(
        { ...ps, ...updates, complianceStatus: updates.complianceStatus ?? ps.complianceStatus },
        'ApprovedToStart',
      );
      if (!check.allowed) {
        throw new Error(check.reason);
      }
    }

    const merged = { ...ps, ...updates };
    if (merged.linkedPurchaseOrderId) {
      const po = this.data.posSnapshot().find(p => p.id === merged.linkedPurchaseOrderId);
      if (po && !merged.currentCommitmentAmount) {
        merged.currentCommitmentAmount = poCommittedAmount(po);
        merged.originalCommitmentAmount = merged.originalCommitmentAmount ?? poCommittedAmount(po);
      }
    }

    merged.remainingCommitment = Math.max(
      0,
      (merged.currentCommitmentAmount ?? 0) - (merged.invoicedToDate ?? 0),
    );

    const saved = await firstValueFrom(this.data.updateProjectSubcontractor(ps.id, merged));
    await this.refreshCompliance(saved.id);
    return saved;
  }

  async refreshCompliance(projectSubcontractorId: string): Promise<ProjectSubcontractor | undefined> {
    const ps = this.data.projectSubcontractorsSnapshot().find(p => p.id === projectSubcontractorId);
    const master = ps ? this.subSvc.getById(ps.subcontractorId) : undefined;
    if (!ps || !master) return undefined;

    const docs = this.data.subcontractorDocumentsSnapshot();
    const complianceStatus = computeProjectSubComplianceStatus(master, docs, ps.id);
    const performanceStatus = master.status === 'DoNotUse' ? 'DoNotUse' : ps.performanceStatus;

    const updated = await firstValueFrom(this.data.updateProjectSubcontractor(ps.id, {
      complianceStatus,
      performanceStatus,
    }));

    this.subSvc.refreshDerivedStatus(master.id);
    await this.tasks.syncTasksForProjectSub(updated, master);
    return updated;
  }

  async uploadComplianceDocument(
    project: Project,
    ps: ProjectSubcontractor,
    file: File,
    documentType: SubcontractorDocumentType,
    expirationDate?: string,
    notes?: string,
  ): Promise<SubcontractorDocument> {
    const folderKey = folderKeyForSubDocumentType(documentType);
    const saveResult = await this.workflowSave.saveProjectWorkflowFile({
      projectId: project.id,
      workflowType: 'subcontractor_compliance',
      folderKey,
      fileName: file.name,
      content: file,
      mimeType: file.type,
      documentType,
      sourceRecordId: ps.id,
      notes,
      requestAuthIfNeeded: true,
    });

    const status = resolveDocumentStatus({
      documentType,
      expirationDate,
      status: 'Valid',
    });

    const docRecord = await firstValueFrom(this.data.createSubcontractorDocument({
      subcontractorId: ps.subcontractorId,
      projectSubcontractorId: ps.id,
      projectId: project.id,
      documentType,
      fileId: saveResult.projectFileId,
      driveFileId: saveResult.driveFileId,
      driveFolderId: saveResult.driveFolderId,
      expirationDate,
      status,
      notes: saveResult.warning ?? notes,
      uploadedAt: new Date().toISOString(),
    }));

    const master = this.subSvc.getById(ps.subcontractorId);
    if (master && documentType === 'CertificateOfInsurance' && expirationDate) {
      await firstValueFrom(this.data.updateSubcontractor(master.id, { coiExpirationDate: expirationDate }));
    }

    await this.refreshCompliance(ps.id);
    return docRecord;
  }

  budgetLineOptions(projectId: string): ProjectBudgetLine[] {
    return this.data.budgetLinesSnapshot().filter(l => l.projectId === projectId && l.status !== 'Void');
  }

  poOptions(projectId: string): PO[] {
    return this.data.posSnapshot().filter(p => p.projectId === projectId);
  }
}
