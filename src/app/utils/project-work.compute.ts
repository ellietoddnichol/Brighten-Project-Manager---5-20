import { WorkflowView } from '../components/project/project-detail.types';
import { CertifiedPayrollWeek } from '../models/certified-payroll.types';
import { ChangeRequest, DailyLog, FieldIssue, Rfi, Submittal } from '../models/project-controls.types';
import { ChangeOrder, ProjectTask } from '../models/types';
import {
  coApprovedAmount,
  coBillingStatus,
  coNumber,
  coTotalAmount,
  crNumber,
  isApprovedUnbilledCo,
  isOpenChangeRequest,
  normalizeCoStatus,
} from './change-management';
import { isManualProjectTask } from './project-task.util';

export type WorkItemKind =
  | 'task'
  | 'change-request'
  | 'change-order'
  | 'field-issue'
  | 'daily-log'
  | 'rfi'
  | 'submittal'
  | 'cpr';

export type TaskFilterSegment = 'all' | 'due-soon' | 'overdue' | 'completed';
export type ChangeListSegment = 'all' | 'pricing' | 'awaiting' | 'approved' | 'closed';

export interface WorkListItem {
  id: string;
  kind: WorkItemKind;
  itemType: string;
  title: string;
  status: string;
  date?: string;
  dateLabel: string;
  linkedRecord?: string;
  chips: string[];
  nextAction: string;
  urgency: number;
  view: WorkflowView;
  recordId: string;
  summary: string;
  relatedRecords: { label: string; value: string }[];
  notes?: string;
  amount?: number;
}

export interface WorkRequiredPrompt {
  id: string;
  label: string;
  actionLabel: string;
  view: WorkflowView;
}

export interface WorkBuildInput {
  projectId: string;
  showAllTools: boolean;
  requiresRfis: boolean;
  requiresSubmittals: boolean;
  requiresDailyLogs: boolean;
  certifiedPayrollRequired: boolean;
  prevailingWage: boolean;
  showRfis: boolean;
  showSubmittals: boolean;
  showDailyLogs: boolean;
  showFieldIssues: boolean;
  showCpr: boolean;
  hasRFIs: boolean;
  hasSubmittals: boolean;
  hasDailyLogs: boolean;
  hasFieldIssues: boolean;
  hasCPRRecords: boolean;
  tasks: ProjectTask[];
  changeRequests: ChangeRequest[];
  changeOrders: ChangeOrder[];
  rfis: Rfi[];
  submittals: Submittal[];
  dailyLogs: DailyLog[];
  fieldIssues: FieldIssue[];
  cprWeeks: CertifiedPayrollWeek[];
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function daysUntil(date?: string): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - new Date(todayIso()).getTime();
  return Math.ceil(ms / 86400000);
}

function taskUrgency(task: ProjectTask): number {
  if (task.status === 'Complete' || task.status === 'Canceled') return 0;
  const due = daysUntil(task.dueDate);
  if (due != null && due < 0) return 100;
  if (task.priority === 'Critical') return 90;
  if (due != null && due <= 3) return 80;
  if (task.priority === 'High') return 70;
  if (due != null && due <= 7) return 60;
  return 40;
}

function taskNextAction(task: ProjectTask): string {
  if (task.status === 'Complete') return 'Archive completed task';
  if (task.status === 'Waiting') return 'Follow up on blocked task';
  if (task.dueDate && (daysUntil(task.dueDate) ?? 99) < 0) return 'Complete overdue task';
  return 'Close completed task';
}

function crNextAction(cr: ChangeRequest): string {
  if (cr.status === 'Draft') return 'Submit change request';
  if (cr.status === 'Submitted' || cr.status === 'Pricing') return 'Price change request';
  if (cr.status === 'Needs Backup') return 'Upload backup document';
  if (!cr.linkedChangeOrderId) return 'Convert to change order';
  return 'Review change request';
}

function coNextAction(co: ChangeOrder): string {
  const status = normalizeCoStatus(co.status);
  if (status === 'Draft' || status === 'Pricing' || status === 'Needs Backup') return 'Send change order';
  if (status === 'Sent') return 'Follow up for approval';
  if (isApprovedUnbilledCo(co)) return 'Bill approved CO';
  if (status === 'Approved') return 'Bill approved CO';
  return 'Review change order';
}

function rfiNextAction(rfi: Rfi): string {
  if (rfi.status === 'Draft') return 'Submit RFI';
  if (rfi.status === 'Submitted') return 'Follow up RFI';
  if (rfi.status === 'Answered') return 'Close RFI';
  return 'Follow up RFI';
}

function submittalNextAction(sub: Submittal): string {
  if (sub.status === 'Needed' || sub.status === 'Draft') return 'Submit submittal';
  if (sub.status === 'Submitted' || sub.status === 'Revise and Resubmit') return 'Follow up submittal';
  return 'Review submittal';
}

function cprNextAction(week: CertifiedPayrollWeek): string {
  if (week.status === 'setup' || week.status === 'blocked') return 'Set up CPR';
  if (week.status === 'draft') return 'Generate CPR draft';
  if (week.status === 'ready') return 'Submit CPR package';
  return 'Review CPR week';
}

function pushTask(rows: WorkListItem[], task: ProjectTask): void {
  const urgent = taskUrgency(task);
  rows.push({
    id: `task-${task.id}`,
    kind: 'task',
    itemType: 'Task',
    title: task.title ?? 'Task',
    status: task.status ?? 'Not Started',
    date: task.dueDate ?? task.createdAt?.toString?.()?.slice(0, 10),
    dateLabel: task.dueDate ? 'Due' : 'Created',
    linkedRecord: task.taskGroup ?? undefined,
    chips: urgent >= 80 ? ['Urgent'] : [],
    nextAction: taskNextAction(task),
    urgency: urgent,
    view: 'tasks',
    recordId: task.id,
    summary: task.title ?? 'Project task',
    relatedRecords: [
      { label: 'Assigned', value: task.assignedTo || 'Unassigned' },
      { label: 'Priority', value: task.priority || 'Medium' },
    ],
    notes: task.notes,
  });
}

function pushCr(rows: WorkListItem[], cr: ChangeRequest): void {
  const pricing = cr.status === 'Submitted' || cr.status === 'Pricing';
  rows.push({
    id: `cr-${cr.id}`,
    kind: 'change-request',
    itemType: 'Change Request',
    title: cr.title ?? cr.description?.slice(0, 80) ?? 'Change request',
    status: cr.status,
    date: cr.requestedDate,
    dateLabel: 'Created',
    linkedRecord: crNumber(cr) || undefined,
    chips: pricing ? ['Pricing needed'] : cr.status === 'Needs Backup' ? ['Needs backup'] : [],
    nextAction: crNextAction(cr),
    urgency: pricing ? 85 : cr.status === 'Needs Backup' ? 75 : 55,
    view: 'changes',
    recordId: cr.id,
    summary: cr.description ?? cr.title ?? 'Change request',
    relatedRecords: [
      { label: 'CR #', value: crNumber(cr) || '—' },
      { label: 'Source', value: cr.source || '—' },
    ],
    notes: cr.internalNotes,
  });
}

function pushCo(rows: WorkListItem[], co: ChangeOrder): void {
  const status = normalizeCoStatus(co.status);
  const unbilled = isApprovedUnbilledCo(co);
  rows.push({
    id: `co-${co.id}`,
    kind: 'change-order',
    itemType: 'Change Order',
    title: co.title ?? 'Change order',
    status: co.status ?? status,
    date: co.dateSubmitted,
    dateLabel: 'Submitted',
    linkedRecord: coNumber(co) || undefined,
    chips: unbilled ? ['Bill now'] : status === 'Sent' ? ['Awaiting approval'] : [],
    nextAction: coNextAction(co),
    urgency: unbilled ? 95 : status === 'Sent' ? 70 : 50,
    view: 'changes',
    recordId: co.id,
    summary: co.title ?? co.description ?? 'Change order',
    amount: coTotalAmount(co),
    relatedRecords: [
      { label: 'CO #', value: coNumber(co) || '—' },
      { label: 'Billing', value: coBillingStatus(co) ?? '—' },
    ],
    notes: co.notes,
  });
}

export function buildAllWorkList(input: WorkBuildInput): WorkListItem[] {
  const rows: WorkListItem[] = [];
  const pid = input.projectId;

  for (const task of input.tasks.filter(t =>
    t.projectId === pid
    && isManualProjectTask(t)
    && t.status !== 'Complete'
    && t.status !== 'Canceled',
  )) {
    pushTask(rows, task);
  }

  for (const cr of input.changeRequests.filter(c => c.projectId === pid && isOpenChangeRequest(c))) {
    pushCr(rows, cr);
  }

  for (const co of input.changeOrders.filter(c => c.projectId === pid && !['Rejected', 'Void', 'Billed'].includes(normalizeCoStatus(c.status)))) {
    pushCo(rows, co);
  }

  if (input.hasFieldIssues && input.showFieldIssues) {
    for (const issue of input.fieldIssues.filter(f => f.projectId === pid && f.status !== 'Closed')) {
      const urgent = issue.priority === 'Critical' || issue.priority === 'High';
      rows.push({
        id: `issue-${issue.id}`,
        kind: 'field-issue',
        itemType: 'Field Issue',
        title: issue.title,
        status: issue.status,
        date: issue.reportedDate,
        dateLabel: 'Reported',
        linkedRecord: issue.issueType,
        chips: urgent ? ['Urgent'] : [],
        nextAction: 'Review field issue',
        urgency: urgent ? 88 : 45,
        view: 'field-issues',
        recordId: issue.id,
        summary: issue.description ?? issue.title,
        relatedRecords: [
          { label: 'Type', value: issue.issueType || '—' },
          { label: 'Location', value: issue.location || '—' },
        ],
      });
    }
  }

  if (input.hasDailyLogs && input.showDailyLogs) {
    for (const log of input.dailyLogs.filter(l => l.projectId === pid).slice(0, 5)) {
      rows.push({
        id: `log-${log.id}`,
        kind: 'daily-log',
        itemType: 'Daily Log',
        title: log.workPerformed?.slice(0, 80) || log.weather || `Log ${log.logDate}`,
        status: log.status ?? 'Submitted',
        date: log.logDate,
        dateLabel: 'Log date',
        linkedRecord: log.foreman,
        chips: log.potentialChange ? ['Potential change'] : [],
        nextAction: log.potentialChange ? 'Review potential change' : 'Review daily log',
        urgency: log.potentialChange ? 65 : 30,
        view: 'daily-logs',
        recordId: log.id,
        summary: log.workPerformed ?? log.notes ?? 'Daily field log',
        relatedRecords: [
          { label: 'Foreman', value: log.foreman || '—' },
          { label: 'Crew', value: log.crewCount?.toString() || '—' },
        ],
        notes: log.notes,
      });
    }
  }

  if (input.hasRFIs && input.showRfis) {
    for (const rfi of input.rfis.filter(r => r.projectId === pid && r.status !== 'Closed')) {
      const overdue = rfi.dueDate && (daysUntil(rfi.dueDate) ?? 99) < 0;
      rows.push({
        id: `rfi-${rfi.id}`,
        kind: 'rfi',
        itemType: 'RFI',
        title: rfi.title ?? rfi.question?.slice(0, 80) ?? rfi.rfiNumber ?? 'RFI',
        status: rfi.status,
        date: rfi.dueDate ?? rfi.submittedDate ?? rfi.dateSubmitted,
        dateLabel: rfi.dueDate ? 'Due' : 'Submitted',
        linkedRecord: rfi.rfiNumber,
        chips: overdue ? ['Overdue'] : [],
        nextAction: rfiNextAction(rfi),
        urgency: overdue ? 82 : 48,
        view: 'rfis',
        recordId: rfi.id,
        summary: rfi.question ?? rfi.title ?? 'RFI',
        relatedRecords: [
          { label: 'RFI #', value: rfi.rfiNumber || '—' },
          { label: 'Assigned', value: rfi.assignedTo || '—' },
        ],
        notes: rfi.notes,
      });
    }
  }

  if (input.hasSubmittals && input.showSubmittals) {
    for (const sub of input.submittals.filter(s =>
      s.projectId === pid
      && !['Approved', 'Approved as Noted', 'Closed', 'Rejected', 'Void'].includes(s.status),
    )) {
      rows.push({
        id: `sub-${sub.id}`,
        kind: 'submittal',
        itemType: 'Submittal',
        title: sub.title ?? sub.submittalNumber ?? 'Submittal',
        status: sub.status,
        date: sub.dueDate ?? sub.requiredDate ?? sub.submittedDate,
        dateLabel: sub.dueDate || sub.requiredDate ? 'Due' : 'Submitted',
        linkedRecord: sub.submittalNumber,
        chips: [],
        nextAction: submittalNextAction(sub),
        urgency: 46,
        view: 'submittals',
        recordId: sub.id,
        summary: sub.description ?? sub.title ?? 'Submittal',
        relatedRecords: [
          { label: 'Spec', value: sub.specSection || '—' },
          { label: 'Vendor', value: sub.vendor || sub.subcontractor || '—' },
        ],
        notes: sub.notes,
      });
    }
  }

  if (input.hasCPRRecords && input.showCpr) {
    for (const week of input.cprWeeks.filter(w => w.projectId === pid && w.status !== 'exported' && w.status !== 'submitted')) {
      rows.push({
        id: `cpr-${week.id}`,
        kind: 'cpr',
        itemType: 'Certified Payroll',
        title: `Week ending ${week.weekEnding}`,
        status: week.status,
        date: week.weekEnding,
        dateLabel: 'Week ending',
        linkedRecord: `${week.entryCount} entries`,
        chips: week.exceptionCount > 0 ? ['Exceptions'] : [],
        nextAction: cprNextAction(week),
        urgency: week.exceptionCount > 0 ? 92 : 50,
        view: 'certified-payroll',
        recordId: week.id,
        summary: `CPR week ${week.weekEnding}`,
        relatedRecords: [
          { label: 'Hours', value: week.totalHours?.toString() || '0' },
          { label: 'Exceptions', value: week.exceptionCount?.toString() || '0' },
        ],
        notes: week.notes,
      });
    }
  }

  return rows.sort((a, b) => b.urgency - a.urgency);
}

export function requiredWorkPrompts(_input: WorkBuildInput): WorkRequiredPrompt[] {
  return [];
}

export function filterTasksBySegment(tasks: ProjectTask[], projectId: string, segment: TaskFilterSegment): ProjectTask[] {
  const projectTasks = tasks.filter(t => t.projectId === projectId && isManualProjectTask(t));
  const open = projectTasks.filter(t => t.status !== 'Complete' && t.status !== 'Canceled');
  switch (segment) {
    case 'completed':
      return projectTasks.filter(t => t.status === 'Complete');
    case 'overdue':
      return open.filter(t => !!t.dueDate && t.dueDate < todayIso());
    case 'due-soon': {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 7);
      const end = horizon.toISOString().slice(0, 10);
      return open.filter(t => !!t.dueDate && t.dueDate >= todayIso() && t.dueDate <= end);
    }
    default:
      return open;
  }
}

export interface ChangeListItem {
  id: string;
  kind: 'cr' | 'co';
  number: string;
  title: string;
  amount: number;
  status: string;
  billingStatus: string;
  nextAction: string;
  urgency: number;
  recordId: string;
}

export function buildChangeList(
  changeRequests: ChangeRequest[],
  changeOrders: ChangeOrder[],
  projectId: string,
): ChangeListItem[] {
  const items: ChangeListItem[] = [];

  for (const cr of changeRequests.filter(c => c.projectId === projectId)) {
    items.push({
      id: `cr-${cr.id}`,
      kind: 'cr',
      number: crNumber(cr) || 'CR',
      title: cr.title ?? cr.description?.slice(0, 80) ?? 'Change request',
      amount: 0,
      status: cr.status,
      billingStatus: '—',
      nextAction: crNextAction(cr),
      urgency: cr.status === 'Submitted' || cr.status === 'Pricing' ? 80 : 50,
      recordId: cr.id,
    });
  }

  for (const co of changeOrders.filter(c => c.projectId === projectId)) {
    const status = normalizeCoStatus(co.status);
    items.push({
      id: `co-${co.id}`,
      kind: 'co',
      number: coNumber(co) || 'CO',
      title: co.title ?? 'Change order',
      amount: status === 'Approved' || status === 'Billed' ? coApprovedAmount(co) : coTotalAmount(co),
      status: co.status ?? status,
      billingStatus: coBillingStatus(co) ?? '—',
      nextAction: coNextAction(co),
      urgency: isApprovedUnbilledCo(co) ? 90 : status === 'Sent' ? 70 : 50,
      recordId: co.id,
    });
  }

  return items.sort((a, b) => b.urgency - a.urgency);
}

export function filterChangeListBySegment(items: ChangeListItem[], segment: ChangeListSegment): ChangeListItem[] {
  if (segment === 'all') return items;

  return items.filter(item => {
    if (item.kind === 'cr') {
      if (segment === 'pricing') return item.status === 'Submitted' || item.status === 'Pricing';
      if (segment === 'awaiting') return item.status === 'Needs Backup';
      if (segment === 'approved') return false;
      if (segment === 'closed') return item.status === 'Converted' || item.status === 'Void';
      return true;
    }

    const status = normalizeCoStatus(item.status);
    if (segment === 'pricing') return status === 'Draft' || status === 'Pricing' || status === 'Needs Backup';
    if (segment === 'awaiting') return status === 'Sent';
    if (segment === 'approved') return status === 'Approved' && item.billingStatus === 'Approved';
    if (segment === 'closed') return status === 'Rejected' || status === 'Void' || status === 'Billed';
    return true;
  });
}

export function workItemToListRow(item: WorkListItem) {
  const metrics: { label: string; value: string; alert?: boolean }[] = [];
  if (item.date) metrics.push({ label: item.dateLabel, value: item.date, alert: item.chips.includes('Overdue') || item.chips.includes('Urgent') });
  if (item.linkedRecord) metrics.push({ label: 'Linked', value: item.linkedRecord });
  if (item.amount != null && item.amount > 0) {
    metrics.push({ label: 'Amount', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount) });
  }

  return {
    title: item.title,
    subtitle: `${item.itemType} · ${item.status}`,
    metrics,
    chips: item.chips,
    nextAction: item.nextAction,
    health: item.chips.some(c => c === 'Urgent' || c === 'Overdue' || c === 'Bill now') ? 'Red' as const
      : item.chips.length ? 'Yellow' as const : 'Neutral' as const,
  };
}
