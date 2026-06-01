import { Injectable, inject } from '@angular/core';
import { Project, ProjectFolder } from '../models/types';
import { ProjectProfile } from '../models/project-requirements.types';
import { DataService } from './data.service';
import {
  ProjectRequirementsContext,
  buildFolderRequirementRows,
  driveFolderTaskDescriptors,
  effectiveProfile,
  folderNeedStatus,
  folderRequirementLevel,
  summarizeDriveMapping,
} from '../utils/project-requirements.compute';

@Injectable({ providedIn: 'root' })
export class ProjectRequirementsService {
  private data = inject(DataService);

  buildContext(project: Project, folders?: ProjectFolder[]): ProjectRequirementsContext {
    const pid = project.id;
    return {
      project,
      folders: folders ?? this.data.projectFoldersSnapshot().filter(f => f.projectId === pid),
      changeOrders: this.data.changeOrdersSnapshot().filter(c => c.projectId === pid),
      changeRequests: this.data.changeRequestsSnapshot().filter(c => c.projectId === pid),
      billings: this.data.billingsSnapshot().filter(b => b.projectId === pid),
      arRecords: this.data.arRecordsSnapshot().filter(r => r.projectId === pid),
      projectSubcontractors: this.data.projectSubcontractorsSnapshot().filter(p => p.projectId === pid),
      subcontractorInvoices: this.data.subcontractorInvoicesSnapshot().filter(i => i.projectId === pid),
      pos: this.data.posSnapshot().filter(p => p.projectId === pid),
      submittals: this.data.submittalsSnapshot().filter(s => s.projectId === pid),
      dailyLogs: this.data.dailyLogsSnapshot().filter(d => d.projectId === pid),
      projectFiles: this.data.projectFilesSnapshot().filter(f => f.projectId === pid),
      laborActuals: this.data.projectLaborActualsSnapshot().filter(a => a.projectId === pid),
    };
  }

  summarize(project: Project, folders?: ProjectFolder[]) {
    return summarizeDriveMapping(this.buildContext(project, folders));
  }

  rows(project: Project, folders?: ProjectFolder[]) {
    return buildFolderRequirementRows(this.buildContext(project, folders));
  }

  needStatus(project: Project, folderKey: string, folder?: ProjectFolder) {
    const ctx = this.buildContext(project);
    return folderNeedStatus(folderKey, folder, ctx);
  }

  requirementLevel(project: Project, folderKey: string) {
    return folderRequirementLevel(folderKey, this.buildContext(project));
  }

  profile(project: Project): ProjectProfile {
    return effectiveProfile(this.buildContext(project));
  }

  taskDescriptors(project: Project) {
    return driveFolderTaskDescriptors(this.buildContext(project));
  }
}
