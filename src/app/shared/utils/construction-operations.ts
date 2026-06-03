import {
  DailyLog,
  FieldIssue,
  Rfi,
  Submittal,
} from '@app/models/project-controls.types';
import { Project } from '@app/models/types';
export type OpsPriority = 'Normal' | 'High' | 'Critical' | 'Low';

export function rfiNumber(rfi: Rfi): string {
  return rfi.rfiNumber ?? '';
}

export function submittalNumber(sub: Submittal): string {
  return sub.submittalNumber ?? '';
}

export function isRfiOpen(rfi: Rfi): boolean {
  return rfi.status !== 'Closed' && rfi.status !== 'Void';
}

export function isRfiOverdue(rfi: Rfi): boolean {
  if (!isRfiOpen(rfi) || rfi.status === 'Answered') return false;
  const due = rfi.dueDate ?? rfi.neededByDate;
  if (!due) return false;
  return due < new Date().toISOString().slice(0, 10);
}

export function isSubmittalOpen(sub: Submittal): boolean {
  return sub.status !== 'Closed' && sub.status !== 'Void';
}

export function isSubmittalOverdue(sub: Submittal): boolean {
  if (!isSubmittalOpen(sub)) return false;
  if (sub.status === 'Approved' || sub.status === 'Approved as Noted') return false;
  const due = sub.dueDate ?? sub.requiredDate;
  if (!due) return false;
  return due < new Date().toISOString().slice(0, 10);
}

export function isFieldIssueOpen(issue: FieldIssue): boolean {
  return issue.status === 'Open' || issue.status === 'In Review';
}

export function nextSubNumber(projectId: string, subs: Submittal[]): string {
  let max = 0;
  for (const raw of subs.filter(s => s.projectId === projectId).map(submittalNumber)) {
    const m = raw.match(/^SUB-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `SUB-${String(max + 1).padStart(3, '0')}`;
}

export function nextRfiNum(projectId: string, rfis: Rfi[]): string {
  let max = 0;
  for (const raw of rfis.filter(r => r.projectId === projectId).map(rfiNumber)) {
    const m = raw.match(/^RFI-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `RFI-${String(max + 1).padStart(3, '0')}`;
}

export function stampProject<T extends { projectId: string }>(
  project: Project,
  draft: Partial<T>,
): Partial<T> {
  return {
    ...draft,
    projectId: project.id,
    projectNumber: project.projectNumber,
    projectName: project.projectName,
  } as Partial<T>;
}

export type ConstructionOpsMetrics = {
  openRfiCount: number;
  overdueRfiCount: number;
  openSubmittalCount: number;
  overdueSubmittalCount: number;
  dailyLogsMissingCount: number;
  fieldIssuesOpenCount: number;
  potentialChangesCount: number;
  recordsWithCostImpact: number;
  recordsWithScheduleImpact: number;
};

export function computeConstructionOpsMetrics(
  projectId: string,
  rfis: Rfi[],
  submittals: Submittal[],
  dailyLogs: DailyLog[],
  fieldIssues: FieldIssue[],
  activeProject = true,
): ConstructionOpsMetrics {
  const pr = rfis.filter(r => r.projectId === projectId);
  const ps = submittals.filter(s => s.projectId === projectId);
  const pl = dailyLogs.filter(l => l.projectId === projectId);
  const pf = fieldIssues.filter(f => f.projectId === projectId);

  const today = new Date().toISOString().slice(0, 10);
  const hasLogToday = pl.some(l => l.logDate === today && l.status !== 'Void');

  let costImpact = 0;
  let scheduleImpact = 0;
  for (const r of pr) {
    if (r.costImpact) costImpact++;
    if (r.scheduleImpact) scheduleImpact++;
  }
  for (const s of ps) {
    if (s.costImpact) costImpact++;
    if (s.scheduleImpact) scheduleImpact++;
  }
  for (const l of pl) {
    if (l.costImpact) costImpact++;
    if (l.scheduleImpact) scheduleImpact++;
    if (l.potentialChange) costImpact++;
  }
  for (const f of pf) {
    if (f.costImpact) costImpact++;
    if (f.scheduleImpact) scheduleImpact++;
  }

  return {
    openRfiCount: pr.filter(isRfiOpen).length,
    overdueRfiCount: pr.filter(isRfiOverdue).length,
    openSubmittalCount: ps.filter(isSubmittalOpen).length,
    overdueSubmittalCount: ps.filter(isSubmittalOverdue).length,
    dailyLogsMissingCount: activeProject && !hasLogToday ? 1 : 0,
    fieldIssuesOpenCount: pf.filter(isFieldIssueOpen).length,
    potentialChangesCount: pl.filter(l => l.potentialChange && !l.linkedChangeRequestId).length,
    recordsWithCostImpact: costImpact,
    recordsWithScheduleImpact: scheduleImpact,
  };
}
