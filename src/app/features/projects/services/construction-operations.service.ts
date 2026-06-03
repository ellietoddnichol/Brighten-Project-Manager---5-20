import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ChangeRequest,
  DailyLog,
  FieldIssue,
  Rfi,
  Submittal,
} from '@app/models/project-controls.types';
import { Project } from '@app/models/types';
import {
  isRfiOverdue,
  isSubmittalOverdue,
  nextRfiNum,
  nextSubNumber,
  stampProject,
} from '@shared/utils/construction-operations';
import { DataService } from '@core/services/data.service';
import { ProjectControlsService } from '@features/projects/services/project-controls.service';

@Injectable({ providedIn: 'root' })
export class ConstructionOperationsService {
  private data = inject(DataService);
  private controls = inject(ProjectControlsService);

  nextRfiNumber(projectId: string): string {
    return nextRfiNum(projectId, this.data.rfisSnapshot());
  }

  nextSubmittalNumber(projectId: string): string {
    return nextSubNumber(projectId, this.data.submittalsSnapshot());
  }

  buildRfiPayload(project: Project, draft: Partial<Rfi>): Partial<Rfi> {
    return {
      ...stampProject(project, draft),
      rfiNumber: draft.rfiNumber ?? this.nextRfiNumber(project.id),
      title: draft.title ?? draft.question?.slice(0, 80),
      submittedDate: draft.submittedDate ?? draft.dateSubmitted ?? new Date().toISOString().slice(0, 10),
      dateSubmitted: draft.submittedDate ?? draft.dateSubmitted,
      dueDate: draft.dueDate ?? draft.neededByDate,
      neededByDate: draft.dueDate ?? draft.neededByDate,
      location: draft.location ?? draft.locationDrawingReference,
      drawingReference: draft.drawingReference ?? draft.locationDrawingReference,
      priority: draft.priority ?? 'Normal',
    };
  }

  async saveRfi(project: Project, draft: Partial<Rfi>, editingId?: string | null): Promise<Rfi> {
    const payload = this.buildRfiPayload(project, draft);
    const prev = editingId ? this.data.rfisSnapshot().find(r => r.id === editingId) : undefined;
    const saved = editingId
      ? await firstValueFrom(this.data.updateRfi(editingId, payload))
      : await firstValueFrom(this.data.createRfi(payload));
    await this.syncRfiSideEffects(saved, prev?.status);
    return saved;
  }

  async submitRfi(rfi: Rfi): Promise<Rfi> {
    const updated = await firstValueFrom(this.data.updateRfi(rfi.id, {
      status: 'Submitted',
      submittedDate: rfi.submittedDate ?? new Date().toISOString().slice(0, 10),
    }));
    await this.onRfiSubmitted(updated);
    return updated;
  }

  async answerRfi(rfi: Rfi, answer: string, impacts?: { costImpact?: boolean; scheduleImpact?: boolean; daysAdded?: number }): Promise<Rfi> {
    const updated = await firstValueFrom(this.data.updateRfi(rfi.id, {
      status: 'Answered',
      answer,
      answeredDate: new Date().toISOString().slice(0, 10),
      costImpact: impacts?.costImpact ?? rfi.costImpact,
      scheduleImpact: impacts?.scheduleImpact ?? rfi.scheduleImpact,
      daysAdded: impacts?.daysAdded ?? rfi.daysAdded,
    }));
    await this.onRfiAnswered(updated);
    return updated;
  }

  async closeRfi(rfi: Rfi): Promise<Rfi> {
    const updated = await firstValueFrom(this.data.updateRfi(rfi.id, { status: 'Closed' }));
    await this.onRfiClosed(updated);
    return updated;
  }

  async voidRfi(rfi: Rfi): Promise<Rfi> {
    const updated = await firstValueFrom(this.data.updateRfi(rfi.id, { status: 'Void' }));
    await this.closeRfiTasks(rfi.id);
    return updated;
  }

  buildSubmittalPayload(project: Project, draft: Partial<Submittal>): Partial<Submittal> {
    const vendor = draft.vendor ?? draft.vendorSubcontractor;
    return {
      ...stampProject(project, draft),
      submittalNumber: draft.submittalNumber ?? this.nextSubmittalNumber(project.id),
      title: draft.title ?? draft.description?.slice(0, 80),
      vendor,
      vendorSubcontractor: vendor ?? draft.subcontractor,
      submittedDate: draft.submittedDate ?? draft.dateSubmitted,
      dateSubmitted: draft.submittedDate ?? draft.dateSubmitted,
      linkedPOId: draft.linkedPOId ?? draft.linkedPoId,
      linkedPoId: draft.linkedPOId ?? draft.linkedPoId,
      status: draft.status ?? 'Needed',
    };
  }

  async saveSubmittal(project: Project, draft: Partial<Submittal>, editingId?: string | null): Promise<Submittal> {
    const payload = this.buildSubmittalPayload(project, draft);
    const prev = editingId ? this.data.submittalsSnapshot().find(s => s.id === editingId) : undefined;
    const saved = editingId
      ? await firstValueFrom(this.data.updateSubmittal(editingId, payload))
      : await firstValueFrom(this.data.createSubmittal(payload));
    await this.syncSubmittalSideEffects(saved, prev?.status);
    return saved;
  }

  async markSubmittalSubmitted(sub: Submittal): Promise<Submittal> {
    const updated = await firstValueFrom(this.data.updateSubmittal(sub.id, {
      status: 'Submitted',
      submittedDate: sub.submittedDate ?? new Date().toISOString().slice(0, 10),
    }));
    await this.syncSubmittalSideEffects(updated, sub.status);
    return updated;
  }

  async updateSubmittalStatus(sub: Submittal, status: Submittal['status']): Promise<Submittal> {
    const patch: Partial<Submittal> = { status };
    if (status === 'Submitted' && !sub.submittedDate) {
      patch.submittedDate = new Date().toISOString().slice(0, 10);
    }
    if (['Approved', 'Approved as Noted', 'Revise and Resubmit', 'Rejected'].includes(status) && !sub.returnedDate) {
      patch.returnedDate = new Date().toISOString().slice(0, 10);
    }
    const prev = sub.status;
    const updated = await firstValueFrom(this.data.updateSubmittal(sub.id, patch));
    await this.syncSubmittalSideEffects(updated, prev);
    return updated;
  }

  buildDailyLogPayload(project: Project, draft: Partial<DailyLog>): Partial<DailyLog> {
    return {
      ...stampProject(project, draft),
      logDate: draft.logDate ?? new Date().toISOString().slice(0, 10),
      employeesOnSite: draft.employeesOnSite ?? draft.crewOnSite,
      crewOnSite: draft.employeesOnSite ?? draft.crewOnSite,
      status: draft.status ?? 'Draft',
    };
  }

  async saveDailyLog(project: Project, draft: Partial<DailyLog>, editingId?: string | null): Promise<DailyLog> {
    const payload = this.buildDailyLogPayload(project, draft);
    const prev = editingId ? this.data.dailyLogsSnapshot().find(l => l.id === editingId) : undefined;
    const saved = editingId
      ? await firstValueFrom(this.data.updateDailyLog(editingId, payload))
      : await firstValueFrom(this.data.createDailyLog(payload));
    await this.syncDailyLogSideEffects(saved, prev?.status);
    return saved;
  }

  async submitDailyLog(log: DailyLog): Promise<DailyLog> {
    const updated = await firstValueFrom(this.data.updateDailyLog(log.id, { status: 'Submitted' }));
    await this.syncDailyLogSideEffects(updated, log.status);
    return updated;
  }

  async voidDailyLog(log: DailyLog): Promise<DailyLog> {
    return firstValueFrom(this.data.updateDailyLog(log.id, { status: 'Void' }));
  }

  buildFieldIssuePayload(project: Project, draft: Partial<FieldIssue>): Partial<FieldIssue> {
    return {
      ...stampProject(project, draft),
      reportedDate: draft.reportedDate ?? new Date().toISOString().slice(0, 10),
      priority: draft.priority ?? 'Normal',
      status: draft.status ?? 'Open',
    };
  }

  async saveFieldIssue(project: Project, draft: Partial<FieldIssue>, editingId?: string | null): Promise<FieldIssue> {
    const payload = this.buildFieldIssuePayload(project, draft);
    if (editingId) {
      return firstValueFrom(this.data.updateFieldIssue(editingId, payload));
    }
    return firstValueFrom(this.data.createFieldIssue(payload));
  }

  async closeFieldIssue(issue: FieldIssue): Promise<FieldIssue> {
    return firstValueFrom(this.data.updateFieldIssue(issue.id, { status: 'Closed' }));
  }

  async voidFieldIssue(issue: FieldIssue): Promise<FieldIssue> {
    return firstValueFrom(this.data.updateFieldIssue(issue.id, { status: 'Void' }));
  }

  async createChangeRequestFromRfi(rfi: Rfi): Promise<ChangeRequest> {
    const project = this.data.projectsSnapshot().find(p => p.id === rfi.projectId)!;
    const summary = [rfi.question, rfi.answer].filter(Boolean).join('\n\nAnswer: ');
    const num = this.controls.nextChangeRequestNumber(rfi.projectId);
    const cr = await firstValueFrom(this.data.createChangeRequest({
      ...stampProject(project, {}),
      changeRequestNumber: num,
      crNumber: num,
      title: rfi.title ?? `Change from RFI ${rfi.rfiNumber}`,
      description: summary || rfi.title,
      requestedDate: rfi.answeredDate ?? rfi.submittedDate ?? new Date().toISOString().slice(0, 10),
      requestDate: rfi.answeredDate ?? rfi.submittedDate,
      requestedBy: rfi.submittedBy,
      source: 'Architect',
      changeType: 'Design Change',
      location: rfi.location,
      drawingReference: rfi.drawingReference ?? rfi.locationDrawingReference,
      specReference: rfi.specReference,
      daysAdded: rfi.daysAdded,
      costImpactKnown: !!rfi.costImpact,
      scheduleImpactKnown: !!rfi.scheduleImpact,
      status: 'Draft',
      linkedRfiId: rfi.id,
      attachmentIds: rfi.attachmentIds,
      urgency: rfi.priority === 'Critical' ? 'Critical' : rfi.priority === 'High' ? 'High' : 'Normal',
    }));
    await firstValueFrom(this.data.updateRfi(rfi.id, { linkedChangeRequestId: cr.id }));
    await this.controls.onChangeRequestSubmitted(cr);
    await this.controls.completeSystemTask(`rfi-cr-${rfi.id}`);
    return cr;
  }

  async createChangeRequestFromSubmittal(sub: Submittal): Promise<ChangeRequest> {
    const project = this.data.projectsSnapshot().find(p => p.id === sub.projectId)!;
    const num = this.controls.nextChangeRequestNumber(sub.projectId);
    const cr = await firstValueFrom(this.data.createChangeRequest({
      ...stampProject(project, {}),
      changeRequestNumber: num,
      crNumber: num,
      title: sub.title ?? `Change from Submittal ${sub.submittalNumber}`,
      description: sub.description ?? sub.title,
      requestedDate: sub.returnedDate ?? sub.submittedDate ?? new Date().toISOString().slice(0, 10),
      source: 'Field',
      changeType: 'Design Change',
      costImpactKnown: !!sub.costImpact,
      scheduleImpactKnown: !!sub.scheduleImpact,
      status: 'Draft',
      linkedSubmittalId: sub.id,
      attachmentIds: sub.attachmentIds,
    }));
    await firstValueFrom(this.data.updateSubmittal(sub.id, { linkedChangeRequestId: cr.id }));
    await this.controls.onChangeRequestSubmitted(cr);
    return cr;
  }

  async createChangeRequestFromDailyLog(log: DailyLog): Promise<ChangeRequest> {
    const cr = await this.controls.createDraftChangeRequestFromDailyLog(log);
    await this.controls.completeSystemTask(`dailylog-change-${log.id}`);
    return cr;
  }

  async convertFieldIssueToRfi(issue: FieldIssue): Promise<Rfi> {
    const project = this.data.projectsSnapshot().find(p => p.id === issue.projectId)!;
    const rfi = await this.saveRfi(project, {
      title: issue.title,
      question: issue.description,
      location: issue.location,
      submittedBy: issue.reportedBy,
      submittedDate: issue.reportedDate,
      costImpact: issue.costImpact,
      scheduleImpact: issue.scheduleImpact,
      attachmentIds: issue.photoIds,
      status: 'Draft',
    });
    await firstValueFrom(this.data.updateFieldIssue(issue.id, {
      status: 'Converted',
      linkedRfiId: rfi.id,
    }));
    return rfi;
  }

  async convertFieldIssueToChangeRequest(issue: FieldIssue): Promise<ChangeRequest> {
    const project = this.data.projectsSnapshot().find(p => p.id === issue.projectId)!;
    const num = this.controls.nextChangeRequestNumber(issue.projectId);
    const cr = await firstValueFrom(this.data.createChangeRequest({
      ...stampProject(project, {}),
      changeRequestNumber: num,
      crNumber: num,
      title: issue.title,
      description: issue.description,
      requestedDate: issue.reportedDate ?? new Date().toISOString().slice(0, 10),
      requestedBy: issue.reportedBy,
      source: 'Field',
      changeType: issue.issueType === 'Delay' ? 'Schedule Impact' : 'Field Condition',
      location: issue.location,
      costImpactKnown: !!issue.costImpact,
      scheduleImpactKnown: !!issue.scheduleImpact,
      status: 'Draft',
      linkedFieldIssueId: issue.id,
      attachmentIds: issue.photoIds,
    }));
    await firstValueFrom(this.data.updateFieldIssue(issue.id, {
      status: 'Converted',
      linkedChangeRequestId: cr.id,
    }));
    await this.controls.onChangeRequestSubmitted(cr);
    return cr;
  }

  async addFieldIssueToDailyLog(issue: FieldIssue, logDate?: string): Promise<DailyLog> {
    const project = this.data.projectsSnapshot().find(p => p.id === issue.projectId)!;
    const date = logDate ?? new Date().toISOString().slice(0, 10);
    const existing = this.data.dailyLogsSnapshot().find(
      l => l.projectId === issue.projectId && l.logDate === date && l.status !== 'Void',
    );
    const note = `[Field Issue] ${issue.title}: ${issue.description ?? ''}`;
    if (existing) {
      const patch: Partial<DailyLog> = {
        notes: [existing.notes, note].filter(Boolean).join('\n'),
        linkedFieldIssueId: issue.id,
      };
      if (issue.issueType === 'Safety') {
        patch.safetyIssues = [existing.safetyIssues, issue.description].filter(Boolean).join('\n');
      }
      if (issue.issueType === 'Delay') {
        patch.delays = [existing.delays, issue.description].filter(Boolean).join('\n');
      }
      const updated = await firstValueFrom(this.data.updateDailyLog(existing.id, patch));
      await firstValueFrom(this.data.updateFieldIssue(issue.id, {
        linkedDailyLogId: updated.id,
        status: 'Converted',
      }));
      return updated;
    }
    const log = await this.saveDailyLog(project, {
      logDate: date,
      submittedBy: issue.reportedBy,
      workPerformed: note,
      areasWorked: issue.location,
      safetyIssues: issue.issueType === 'Safety' ? issue.description : undefined,
      delays: issue.issueType === 'Delay' ? issue.description : undefined,
      linkedFieldIssueId: issue.id,
      status: 'Draft',
    });
    await firstValueFrom(this.data.updateFieldIssue(issue.id, {
      linkedDailyLogId: log.id,
      status: 'Converted',
    }));
    return log;
  }

  async createTaskFromFieldIssue(issue: FieldIssue): Promise<void> {
    await this.controls.ensureSystemTask(
      issue.projectId,
      `field-issue-task-${issue.id}`,
      `Field issue: ${issue.title}`,
      'Field Operations',
      { type: 'FieldIssue', id: issue.id },
    );
  }

  /** Run overdue/missing checks for a project (call when opening project ops tabs). */
  async refreshProjectAutomation(project: Project): Promise<void> {
    const rfis = this.data.rfisSnapshot().filter(r => r.projectId === project.id);
    for (const rfi of rfis) {
      if (isRfiOverdue(rfi)) await this.onRfiOverdue(rfi);
    }
    const subs = this.data.submittalsSnapshot().filter(s => s.projectId === project.id);
    for (const sub of subs) {
      if (isSubmittalOverdue(sub)) await this.onSubmittalOverdue(sub);
    }
    if (project.status !== 'Closed' && project.status !== 'Closeout') {
      await this.checkMissingDailyLog(project.id);
    }
  }

  private async syncRfiSideEffects(rfi: Rfi, prevStatus?: Rfi['status']): Promise<void> {
    if (rfi.status === 'Submitted' && prevStatus !== 'Submitted') await this.onRfiSubmitted(rfi);
    if (rfi.status === 'Answered' && prevStatus !== 'Answered') await this.onRfiAnswered(rfi);
    if (rfi.status === 'Closed') await this.onRfiClosed(rfi);
    if (isRfiOverdue(rfi)) await this.onRfiOverdue(rfi);
  }

  private async onRfiSubmitted(rfi: Rfi): Promise<void> {
    await this.controls.ensureSystemTask(
      rfi.projectId,
      `rfi-followup-${rfi.id}`,
      `Follow up on RFI response: ${rfi.rfiNumber ?? rfi.title ?? 'RFI'}`,
      'RFIs',
      { type: 'RFI', id: rfi.id },
    );
  }

  private async onRfiAnswered(rfi: Rfi): Promise<void> {
    await this.controls.completeSystemTask(`rfi-followup-${rfi.id}`);
    await this.controls.completeSystemTask(`rfi-overdue-${rfi.id}`);
    if (rfi.costImpact || rfi.scheduleImpact) {
      await this.controls.ensureSystemTask(
        rfi.projectId,
        `rfi-cr-${rfi.id}`,
        `Review RFI for change request: ${rfi.rfiNumber ?? rfi.id.slice(0, 8)}`,
        'Changes',
        { type: 'RFI', id: rfi.id },
      );
    }
  }

  private async onRfiOverdue(rfi: Rfi): Promise<void> {
    await this.controls.ensureSystemTask(
      rfi.projectId,
      `rfi-overdue-${rfi.id}`,
      `RFI overdue: ${rfi.rfiNumber ?? rfi.title ?? 'RFI'}`,
      'RFIs',
      { type: 'RFI', id: rfi.id },
    );
  }

  private async onRfiClosed(rfi: Rfi): Promise<void> {
    await this.closeRfiTasks(rfi.id);
  }

  private async closeRfiTasks(rfiId: string): Promise<void> {
    await this.controls.completeSystemTask(`rfi-followup-${rfiId}`);
    await this.controls.completeSystemTask(`rfi-overdue-${rfiId}`);
    await this.controls.completeSystemTask(`rfi-cr-${rfiId}`);
  }

  private async syncSubmittalSideEffects(sub: Submittal, prevStatus?: Submittal['status']): Promise<void> {
    if (sub.status === 'Needed') {
      await this.controls.ensureSystemTask(
        sub.projectId,
        `sub-prepare-${sub.id}`,
        `Prepare submittal: ${sub.submittalNumber ?? sub.title ?? 'Submittal'}`,
        'Submittals',
        { type: 'Submittal', id: sub.id },
      );
    }
    if (sub.status === 'Submitted') {
      await this.controls.completeSystemTask(`sub-prepare-${sub.id}`);
      if (isSubmittalOverdue(sub)) await this.onSubmittalOverdue(sub);
    }
    if (sub.status === 'Revise and Resubmit') {
      await this.controls.ensureSystemTask(
        sub.projectId,
        `sub-revise-${sub.id}`,
        `Revise and resubmit submittal: ${sub.submittalNumber ?? sub.title ?? 'Submittal'}`,
        'Submittals',
        { type: 'Submittal', id: sub.id },
      );
    }
    if (sub.status === 'Approved' || sub.status === 'Approved as Noted') {
      await this.controls.completeSystemTask(`sub-overdue-${sub.id}`);
      await this.controls.completeSystemTask(`sub-revise-${sub.id}`);
      if (sub.materialReleaseRequired && !sub.materialReleasedDate) {
        await this.controls.ensureSystemTask(
          sub.projectId,
          `sub-release-${sub.id}`,
          `Release approved material: ${sub.submittalNumber ?? sub.title ?? 'Submittal'}`,
          'Submittals',
          { type: 'Submittal', id: sub.id },
        );
      }
    }
    if (sub.status === 'Rejected') {
      await this.controls.ensureSystemTask(
        sub.projectId,
        `sub-rejected-${sub.id}`,
        `Review rejected submittal: ${sub.submittalNumber ?? sub.title ?? 'Submittal'}`,
        'Submittals',
        { type: 'Submittal', id: sub.id },
      );
    }
    if (prevStatus !== sub.status && isSubmittalOverdue(sub)) {
      await this.onSubmittalOverdue(sub);
    }
  }

  private async onSubmittalOverdue(sub: Submittal): Promise<void> {
    await this.controls.ensureSystemTask(
      sub.projectId,
      `sub-overdue-${sub.id}`,
      `Follow up on submittal approval: ${sub.submittalNumber ?? sub.title ?? 'Submittal'}`,
      'Submittals',
      { type: 'Submittal', id: sub.id },
    );
  }

  private async syncDailyLogSideEffects(log: DailyLog, prevStatus?: DailyLog['status']): Promise<void> {
    if (log.status === 'Submitted' && prevStatus !== 'Submitted') {
      if (log.delays?.trim()) {
        await this.controls.ensureSystemTask(
          log.projectId,
          `dailylog-delay-${log.id}`,
          `Review project delay (${log.logDate})`,
          'Field Operations',
          { type: 'DailyLog', id: log.id },
        );
      }
      if (log.potentialChange || log.costImpact || log.scheduleImpact) {
        await this.controls.ensureSystemTask(
          log.projectId,
          `dailylog-change-${log.id}`,
          `Review potential change (${log.logDate})`,
          'Changes',
          { type: 'DailyLog', id: log.id },
        );
      }
      if (log.safetyIssues?.trim()) {
        await this.controls.ensureSystemTask(
          log.projectId,
          `dailylog-safety-${log.id}`,
          `Review safety issue (${log.logDate})`,
          'Field Operations',
          { type: 'DailyLog', id: log.id },
        );
      }
    }
  }

  private async checkMissingDailyLog(projectId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const hasLog = this.data.dailyLogsSnapshot().some(
      l => l.projectId === projectId && l.logDate === today && l.status !== 'Void',
    );
    if (!hasLog) {
      await this.controls.ensureSystemTask(
        projectId,
        `dailylog-missing-${projectId}-${today}`,
        `Daily log missing for ${today}`,
        'Field Operations',
        { type: 'Project', id: projectId },
      );
    }
  }
}
