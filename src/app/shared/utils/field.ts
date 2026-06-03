import { ScheduleMilestone, ProjectIssue, ProjectFile, ChangeOrder, Billing, ProjectTask, ActivityFeedItem } from '@app/models/types';

export function getUpcomingMilestones(projectId: string, milestones: ScheduleMilestone[]): ScheduleMilestone[] {
  const pM = milestones.filter(m => m.projectId === projectId && m.status !== 'Complete' && m.status !== 'Canceled');
  pM.sort((a, b) => {
    const aDate = a.plannedEndDate || '2999-12-31';
    const bDate = b.plannedEndDate || '2999-12-31';
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });
  return pM.filter(m => {
    if (!m.plannedEndDate) return false;
    const diffTime = new Date(m.plannedEndDate).getTime() - new Date().getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  });
}

export function getOverdueMilestones(projectId: string, milestones: ScheduleMilestone[]): ScheduleMilestone[] {
  const pM = milestones.filter(m => m.projectId === projectId && m.status !== 'Complete' && m.status !== 'Canceled');
  return pM.filter(m => {
    if (!m.plannedEndDate) return false;
    return new Date(m.plannedEndDate).getTime() < new Date().getTime();
  });
}

export function getNextMilestone(projectId: string, milestones: ScheduleMilestone[]): ScheduleMilestone | null {
  const pM = milestones.filter(m => m.projectId === projectId && m.status !== 'Complete' && m.status !== 'Canceled');
  pM.sort((a, b) => {
    const aDate = a.plannedEndDate || '2999-12-31';
    const bDate = b.plannedEndDate || '2999-12-31';
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });
  return pM.length > 0 ? pM[0] : null;
}

export function getScheduleExceptions(project: { id: string; projectName: string; status: string }, milestones: ScheduleMilestone[]) {
  const exceptions = [];
  const overdue = getOverdueMilestones(project.id, milestones);
  const upcoming7 = getUpcomingMilestones(project.id, milestones);
  const delayed = milestones.filter(m => m.projectId === project.id && m.status === 'Delayed');
  const next = getNextMilestone(project.id, milestones);

  overdue.forEach(m => {
     exceptions.push({
        id: `ms-overdue-${m.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Milestone Overdue',
        description: `Milestone "${m.title}" is overdue (${m.plannedEndDate}).`,
        type: 'Schedule',
        severity: 'error'
     });
  });

  upcoming7.forEach(m => {
     exceptions.push({
        id: `ms-upcoming-${m.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Milestone Upcoming',
        description: `Milestone "${m.title}" is due soon (${m.plannedEndDate}).`,
        type: 'Schedule',
        severity: 'warning'
     });
  });

  delayed.forEach(m => {
     exceptions.push({
        id: `ms-delayed-${m.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'Milestone Delayed',
        description: `Milestone "${m.title}" is delayed.`,
        type: 'Schedule',
        severity: 'error'
     });
  });

  if (project.status === 'Active' && !next && milestones.some(m => m.projectId === project.id)) {
     exceptions.push({
        id: `ms-missing-next-${project.id}`,
        projectId: project.id,
        projectName: project.projectName,
        title: 'No Upcoming Milestone',
        description: `Active project lacks next scheduled milestone.`,
        type: 'Schedule',
        severity: 'warning'
     });
  }

  return exceptions;
}

export function buildProjectActivityFeed(
  projectId: string,
  files: ProjectFile[],
  issues: ProjectIssue[],
  tasks: ProjectTask[],
  cos: ChangeOrder[],
  bills: Billing[],
  milestones: ScheduleMilestone[]
): ActivityFeedItem[] {
  const feed: ActivityFeedItem[] = [];

  files.filter(x => x.projectId === projectId).forEach(f => {
    feed.push({
      id: `file-${f.id}`, projectId, activityType: 'File Added',
      title: `File Added: ${f.fileName}`,
      description: `Uploaded to ${f.folderKey || 'Project'}`,
      createdAt: f.uploadedAt || new Date(),
      createdBy: f.uploadedBy,
      relatedRecordId: f.id, relatedRecordType: 'ProjectFile'
    });
  });

  issues.filter(x => x.projectId === projectId).forEach(i => {
    feed.push({
      id: `issue-${i.id}`, projectId, activityType: 'Issue Created',
      title: `Issue Logged: ${i.title}`,
      description: `Priority: ${i.priority} | Category: ${i.category}`,
      createdAt: i.createdAt || new Date(),
      createdBy: i.ownerId,
      relatedRecordId: i.id, relatedRecordType: 'ProjectIssue'
    });
  });

  tasks.filter(x => x.projectId === projectId && x.status === 'Complete').forEach(t => {
    feed.push({
      id: `task-${t.id}`, projectId, activityType: 'Task Completed',
      title: `Task Completed: ${t.title}`,
      description: `Assigned to: ${t.assignedTo || 'Unassigned'}`,
      createdAt: t.completedAt || t.createdAt || new Date(),
      createdBy: t.ownerId,
      relatedRecordId: t.id, relatedRecordType: 'ProjectTask'
    });
  });

  cos.filter(x => x.projectId === projectId).forEach(co => {
    feed.push({
      id: `co-${co.id}`, projectId, activityType: 'Change Order Updated',
      title: `Change Order ${co.coNumber}: ${co.status}`,
      description: `${co.title} - ${co.status}`,
      createdAt: co.updatedAt || co.createdAt || new Date(),
      createdBy: co.ownerId,
      relatedRecordId: co.id, relatedRecordType: 'ChangeOrder'
    });
  });

  bills.filter(x => x.projectId === projectId).forEach(b => {
    feed.push({
      id: `bill-${b.id}`, projectId, activityType: 'Billing Updated',
      title: `Pay App ${b.payAppNumber}: ${b.status}`,
      description: `Period: ${b.billingPeriod}`,
      createdAt: b.updatedAt || b.createdAt || new Date(),
      createdBy: b.ownerId,
      relatedRecordId: b.id, relatedRecordType: 'Billing'
    });
  });

  milestones.filter(x => x.projectId === projectId).forEach(m => {
    feed.push({
      id: `ms-${m.id}`, projectId, activityType: 'Milestone Updated',
      title: `Milestone: ${m.title}`,
      description: `Status: ${m.status}`,
      createdAt: m.updatedAt || m.createdAt || new Date(),
      createdBy: m.ownerId,
      relatedRecordId: m.id, relatedRecordType: 'ScheduleMilestone'
    });
  });

  return feed.sort((a, b) => {
    const aTime = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
    const bTime = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
    return bTime - aTime;
  });
}
