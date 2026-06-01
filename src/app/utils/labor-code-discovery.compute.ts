import { LaborCodeMapping } from '../models/labor-code-mapping.types';
import {
  defaultMappingDraft,
  normalizeLaborCodeKey,
} from './labor-code-mapping.compute';
import { defaultOfficeAdminMapping, isOfficeAdminLaborCode } from './office-admin-labor';

export interface LaborCodeDiscoveryRow {
  laborCode?: string;
  laborCode1?: string;
  laborCode2?: string;
  laborCode3?: string;
  hours1?: number;
  hours2?: number;
  hours3?: number;
  regularHours?: number;
  overtimeHours?: number;
  doubleTimeHours?: number;
  totalHours?: number;
  jobNumber?: string;
  projectNumber?: string;
  employeeName?: string;
  workDate?: string;
  approvalStatus?: string;
}

export interface LaborCodeDiscoverySegment {
  laborCode: string;
  hours: number;
  jobNumber?: string;
  employeeName?: string;
  workDate?: string;
}

export interface LaborCodeDiscoveryStats {
  laborCode: string;
  totalHours: number;
  jobCount: number;
  employeeCount: number;
  lastUsedDate?: string;
}

const PTO_LABELS = ['pto', 'vacation', 'holiday', 'sick', 'bereavement'];

function isApprovedStatus(status?: string): boolean {
  const normalized = (status ?? '').trim().toLowerCase();
  return !normalized || normalized === 'approved';
}

function rowHours(row: LaborCodeDiscoveryRow): number {
  const explicit = row.totalHours ?? 0;
  if (explicit > 0) return explicit;
  return (row.regularHours ?? 0) + (row.overtimeHours ?? 0) + (row.doubleTimeHours ?? 0);
}

/** Expand Labor Code / Labor Code 1–3 + paired hours into discrete code segments. */
export function expandLaborCodeSegments(row: LaborCodeDiscoveryRow): LaborCodeDiscoverySegment[] {
  if (!isApprovedStatus(row.approvalStatus)) return [];

  const segments: LaborCodeDiscoverySegment[] = [];
  const jobNumber = row.jobNumber ?? row.projectNumber;
  const base = {
    jobNumber,
    employeeName: row.employeeName,
    workDate: row.workDate,
  };

  const multi = [
    { code: row.laborCode1, hours: row.hours1 },
    { code: row.laborCode2, hours: row.hours2 },
    { code: row.laborCode3, hours: row.hours3 },
  ].filter(item => (item.code ?? '').trim());

  if (multi.length) {
    for (const item of multi) {
      const hours = item.hours ?? 0;
      if (!hours) continue;
      segments.push({ laborCode: item.code!.trim(), hours, ...base });
    }
    return segments;
  }

  const code = (row.laborCode ?? '').trim();
  const hours = rowHours(row);
  if (!code) {
    if (hours > 0) {
      segments.push({ laborCode: '', hours, ...base });
    }
    return segments;
  }

  segments.push({ laborCode: code, hours: hours || 0, ...base });
  return segments;
}

export function aggregateLaborCodeDiscoveryStats(
  segments: LaborCodeDiscoverySegment[],
): LaborCodeDiscoveryStats[] {
  const map = new Map<string, {
    totalHours: number;
    jobs: Set<string>;
    employees: Set<string>;
    lastUsedDate?: string;
  }>();

  for (const seg of segments) {
    const key = normalizeLaborCodeKey(seg.laborCode);
    const bucket = map.get(key) ?? {
      totalHours: 0,
      jobs: new Set<string>(),
      employees: new Set<string>(),
      lastUsedDate: undefined,
    };
    bucket.totalHours += seg.hours;
    if (seg.jobNumber) bucket.jobs.add(seg.jobNumber);
    if (seg.employeeName) bucket.employees.add(seg.employeeName.toLowerCase());
    if (seg.workDate && (!bucket.lastUsedDate || seg.workDate > bucket.lastUsedDate)) {
      bucket.lastUsedDate = seg.workDate;
    }
    map.set(key, bucket);
  }

  return [...map.entries()]
    .map(([key, stats]) => ({
      laborCode: key ? segments.find(s => normalizeLaborCodeKey(s.laborCode) === key)?.laborCode ?? key : '',
      totalHours: stats.totalHours,
      jobCount: stats.jobs.size,
      employeeCount: stats.employees.size,
      lastUsedDate: stats.lastUsedDate,
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.laborCode.localeCompare(b.laborCode));
}

function isPtoLaborCode(code: string): boolean {
  const key = normalizeLaborCodeKey(code);
  return PTO_LABELS.some(label => key === label || key.includes(label));
}

/** Default classification for codes discovered from Master Time Sheet. */
export function inferDiscoveredMappingDefaults(
  laborCode: string,
  stats?: Pick<LaborCodeDiscoveryStats, 'totalHours' | 'jobCount' | 'employeeCount' | 'lastUsedDate'>,
): Partial<LaborCodeMapping> {
  const trimmed = laborCode.trim();
  const statsNote = stats
    ? `Discovered from Master Time Sheet · ${stats.totalHours.toFixed(1)} hrs · ${stats.jobCount} job(s) · ${stats.employeeCount} employee(s)${stats.lastUsedDate ? ` · last used ${stats.lastUsedDate}` : ''}`
    : 'Discovered from Master Time Sheet';

  if (!trimmed) {
    return {
      ...defaultMappingDraft(''),
      laborCode: '',
      displayName: 'Unassigned',
      category: 'Other',
      bonusEligible: false,
      certifiedPayrollEligible: false,
      wipEligible: false,
      excludeFromForemanBonus: true,
      excludeFromAudit: true,
      active: true,
      notes: `${statsNote} · NeedsReview — blank labor code`,
    };
  }

  if (isOfficeAdminLaborCode(trimmed)) {
    return {
      ...defaultOfficeAdminMapping(trimmed),
      notes: `${statsNote} · Office/Admin`,
    };
  }

  if (isPtoLaborCode(trimmed)) {
    return {
      laborCode: trimmed,
      displayName: trimmed,
      category: 'PTO',
      workCompCategory: 'Clerical',
      bonusEligible: false,
      certifiedPayrollEligible: false,
      wipEligible: false,
      excludeFromForemanBonus: true,
      excludeFromAudit: true,
      active: true,
      notes: `${statsNote} · PTO — excluded from WIP/bonus/CPR`,
    };
  }

  const draft = defaultMappingDraft(trimmed);
  const numericOnly = /^\d+$/.test(trimmed);
  return {
    ...draft,
    category: numericOnly ? 'Other' : draft.category,
    notes: `${statsNote} · NeedsMapping — review classification`,
  };
}

export function collectLaborCodeDiscoveryStats(
  rows: LaborCodeDiscoveryRow[],
): LaborCodeDiscoveryStats[] {
  const segments = rows.flatMap(expandLaborCodeSegments);
  return aggregateLaborCodeDiscoveryStats(segments);
}
