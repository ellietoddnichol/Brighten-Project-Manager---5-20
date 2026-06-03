import { ARRecord } from '@app/models/financial.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { ProjectProfile } from '@app/models/project-requirements.types';
import { Billing, ChangeOrder, Project } from '@app/models/types';

export interface ProjectStartDateInput {
  project: Project;
  billings?: Billing[];
  laborActuals?: ProjectLaborActual[];
  changeOrders?: ChangeOrder[];
}

/** CPR follows prevailing wage — no separate manual decision. */
export function deriveCertifiedPayrollRequired(prevailingWage?: boolean): boolean {
  return !!prevailingWage;
}

/** Default foreman by customer / job name when not explicitly set. */
export function resolveDefaultForeman(project: Pick<Project, 'customer' | 'projectName' | 'projectNumber'>): string | undefined {
  const customer = (project.customer ?? '').toLowerCase();
  const name = (project.projectName ?? '').toLowerCase();

  if (customer.includes('lakeview village') || name.includes('lvv')) {
    return 'Kyle';
  }
  if (customer.includes('cwa specialties')) {
    return 'AJ';
  }
  if (name.includes('lightedge') || project.projectNumber === '204') {
    return 'Dustin';
  }
  return undefined;
}

export function effectiveForeman(
  project: Pick<Project, 'superintendent' | 'customer' | 'projectName' | 'projectNumber'>,
): string | undefined {
  return project.superintendent?.trim() || resolveDefaultForeman(project);
}

export function isForemanSetupMissing(
  project: Pick<Project, 'superintendent' | 'customer' | 'projectName' | 'projectNumber'>,
  hasForemanAssignment: boolean,
): boolean {
  if (hasForemanAssignment) return false;
  return !effectiveForeman(project);
}

function parseDate(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value.length === 10 ? `${value.slice(0, 10)}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

function earliestDate(dates: (string | undefined)[]): string | undefined {
  let best: { ts: number; raw: string } | undefined;
  for (const raw of dates) {
    const ts = parseDate(raw);
    if (ts == null || !raw?.trim()) continue;
    if (!best || ts < best.ts) best = { ts, raw: raw.slice(0, 10) };
  }
  return best?.raw;
}

/** Prefer manual override, then earliest time/cost/billing signal. */
export function deriveProjectStartDate(input: ProjectStartDateInput): string | undefined {
  if (input.project.startDate?.trim()) {
    return input.project.startDate.trim().slice(0, 10);
  }

  const pid = input.project.id;
  const candidates: string[] = [];

  if (input.project.lastTimelogDate) candidates.push(input.project.lastTimelogDate);
  if (input.project.qboCostDetailSyncedAt) candidates.push(input.project.qboCostDetailSyncedAt);

  for (const row of input.laborActuals ?? []) {
    if (row.projectId !== pid) continue;
    if (row.workDate) candidates.push(row.workDate);
    if (row.weekStart) candidates.push(row.weekStart);
  }

  for (const b of input.billings ?? []) {
    if (b.projectId !== pid) continue;
    if (b.billingPeriodStart) candidates.push(b.billingPeriodStart);
    if (b.billingPeriodEnd) candidates.push(b.billingPeriodEnd);
    if (b.paymentDate) candidates.push(b.paymentDate);
  }

  for (const co of input.changeOrders ?? []) {
    if (co.projectId !== pid) continue;
    const date = co.dateApproved ?? co.dateSent ?? co.dateCreated;
    if (typeof date === 'string') candidates.push(date);
  }

  return earliestDate(candidates);
}

export function mapSetupProfileLabel(label: string, prevailingWage: boolean): ProjectProfile {
  const normalized = label.toLowerCase();
  if (normalized.includes('prevailing') || normalized.includes('l&w / prevailing')) {
    return 'PrevailingWage';
  }
  if (normalized.includes('t&m')) return 'TMWorkOrder';
  if (normalized.includes('closeout') || normalized.includes('a/r')) return 'CloseoutAR';
  if (prevailingWage) return 'PrevailingWage';
  return 'FullProject';
}

export function billingTypeFromProfileLabel(label: string): Project['billingType'] | undefined {
  if (label.toLowerCase().includes('t&m')) return 'T&M';
  return undefined;
}

export function isWaitingOnArSetupStatus(status?: string): boolean {
  return (status ?? '').trim().toLowerCase().includes('waiting on a/r');
}
