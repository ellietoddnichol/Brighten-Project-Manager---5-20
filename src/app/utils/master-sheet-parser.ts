import { Project, ProjectStatus } from '../models/types';

export interface ParsedMasterJob {
  masterSheetJobId: string;
  projectNumber: string;
  projectName: string;
  isClosed: boolean;
  sheetStatus: string;
  address?: string;
  county?: string;
  taxExempt?: boolean;
  prevailingWage?: boolean;
  kansasRemodelTax?: boolean;
  supplier?: string;
  customer?: string;
  contact?: string;
  phone?: string;
  email?: string;
  billingTerms?: string;
  superintendent?: string;
  status: ProjectStatus;
}

export interface JobTimeSummary {
  jobKey: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  lastLogDate?: string;
  entryCount: number;
}

function cellStr(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function parseBool(value: unknown): boolean {
  const s = cellStr(value).toLowerCase();
  return s === 'yes' || s === 'true' || s === 'y' || s === '1';
}

function parseNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(String(value).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function parseJobLabel(jobId: string): { projectNumber: string; projectName: string } {
  const trimmed = jobId.trim();
  const dash = trimmed.indexOf(' - ');
  if (dash === -1) {
    return { projectNumber: trimmed, projectName: trimmed };
  }
  return {
    projectNumber: trimmed.slice(0, dash).trim(),
    projectName: trimmed.slice(dash + 3).trim(),
  };
}

export function normalizeJobKey(jobId: string): string {
  return jobId.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function mapSheetStatus(sheetStatus: string, isClosed: boolean): ProjectStatus {
  if (isClosed) return 'Closed';
  const s = sheetStatus.trim().toLowerCase();
  if (s.includes('pre') || s.includes('upcoming') || s.includes('lead')) return 'Lead / Precon';
  if (s.includes('award')) return 'Awarded';
  if (s.includes('setup') || s.includes('review')) return 'Setup Needed';
  if (s.includes('closeout') || s.includes('bill')) return 'Closeout';
  if (s.includes('complete') || s.includes('closed')) return 'Closed';
  if (s.includes('progress') || s.includes('active')) return 'Active';
  return 'Active';
}

function rowIsClosed(closedCell: unknown, statusCell: string): boolean {
  const closedStr = cellStr(closedCell).toUpperCase();
  if (closedStr === 'TRUE' || closedCell === true) return true;
  const status = statusCell.toLowerCase();
  return status === 'closed' || status === 'completed' || status === 'complete';
}

/** Parse Master Job List rows (header row skipped). */
export function parseMasterJobRows(rows: string[][]): ParsedMasterJob[] {
  const jobs: ParsedMasterJob[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const masterSheetJobId = cellStr(row[2]);
    if (!masterSheetJobId) continue;

    const sheetStatus = cellStr(row[1]) || 'Unknown';
    const isClosed = rowIsClosed(row[0], sheetStatus);
    const { projectNumber, projectName } = parseJobLabel(masterSheetJobId);

    jobs.push({
      masterSheetJobId,
      projectNumber,
      projectName,
      isClosed,
      sheetStatus,
      status: mapSheetStatus(sheetStatus, isClosed),
      address: cellStr(row[3]) || undefined,
      county: cellStr(row[4]) || undefined,
      taxExempt: row[5] != null && row[5] !== '' ? parseBool(row[5]) : undefined,
      prevailingWage: row[6] != null && row[6] !== '' ? parseBool(row[6]) : undefined,
      kansasRemodelTax: row[7] != null && row[7] !== '' ? parseBool(row[7]) : undefined,
      supplier: cellStr(row[8]) || undefined,
      customer: cellStr(row[9]) || undefined,
      contact: cellStr(row[10]) || undefined,
      phone: cellStr(row[11]) || undefined,
      email: cellStr(row[12]) || undefined,
      billingTerms: cellStr(row[13]) || undefined,
      superintendent: cellStr(row[14]) || undefined,
    });
  }
  return jobs;
}

/** Aggregate Timelogs tab hours by Job ID #. */
export function parseTimelogRows(rows: string[][]): Map<string, JobTimeSummary> {
  const map = new Map<string, JobTimeSummary>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const jobId = cellStr(row[3]);
    if (!jobId) continue;

    const key = normalizeJobKey(jobId);
    const regular = parseNumber(row[5]);
    const overtime = parseNumber(row[6]);
    const doubleTime = parseNumber(row[7]);
    const logDate = cellStr(row[1]);

    const existing = map.get(key) ?? {
      jobKey: key,
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      totalHours: 0,
      entryCount: 0,
    };

    existing.regularHours += regular;
    existing.overtimeHours += overtime;
    existing.doubleTimeHours += doubleTime;
    existing.totalHours += regular + overtime + doubleTime;
    existing.entryCount += 1;
    if (logDate && (!existing.lastLogDate || logDate > existing.lastLogDate)) {
      existing.lastLogDate = logDate;
    }
    map.set(key, existing);
  }

  return map;
}

export function masterJobToProjectUpdate(
  job: ParsedMasterJob,
  time: JobTimeSummary | undefined,
  syncedAt: string,
): Partial<Project> {
  const update: Partial<Project> = {
    projectNumber: job.projectNumber,
    projectName: job.projectName,
    masterSheetJobId: job.masterSheetJobId,
    masterSheetStatus: job.sheetStatus,
    masterSheetSyncedAt: syncedAt,
    status: job.status,
  };

  if (job.address) update.address = job.address;
  if (job.county) update.county = job.county;
  if (job.supplier) update.supplier = job.supplier;
  if (job.customer) update.customer = job.customer;
  if (job.billingTerms) update.billingTerms = job.billingTerms;
  if (job.superintendent) update.superintendent = job.superintendent;

  if (job.taxExempt != null) {
    update.taxExempt = job.taxExempt;
    update.taxable = !job.taxExempt;
  }
  if (job.prevailingWage != null) update.prevailingWage = job.prevailingWage;
  if (job.kansasRemodelTax != null) update.kansasRemodelTax = job.kansasRemodelTax;
  if (job.contact) update.owner = job.contact;

  if (time) {
    update.regularHours = time.regularHours;
    update.overtimeHours = time.overtimeHours;
    update.doubleTimeHours = time.doubleTimeHours;
    update.totalLaborHours = time.totalHours;
    update.lastTimelogDate = time.lastLogDate;
    update.timelogEntryCount = time.entryCount;
  }

  return update;
}

export function findTimeForJob(
  job: ParsedMasterJob,
  timeByJob: Map<string, JobTimeSummary>,
): JobTimeSummary | undefined {
  const keys = [
    normalizeJobKey(job.masterSheetJobId),
    normalizeJobKey(`${job.projectNumber} - ${job.projectName}`),
    normalizeJobKey(job.projectNumber),
  ];
  for (const key of keys) {
    const hit = timeByJob.get(key);
    if (hit) return hit;
  }
  return undefined;
}
