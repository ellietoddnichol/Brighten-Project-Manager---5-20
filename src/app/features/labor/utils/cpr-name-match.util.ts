import {
  AdpPayrollDetail,
  CprMemoryRecord,
  EmployeePayrollInfo,
} from '@app/models/certified-payroll.types';
import { normalizePersonName } from '@features/labor/utils/cpr-form.util';
import {
  adpPayPeriodMatchesWeek,
  normalizeEmployeeKey,
} from '@features/labor/utils/certified-payroll-week';

export const CPR_READY_CONFIDENCE = 0.85;
export const CPR_FUZZY_CONFIDENCE = 0.76;
export const CPR_FUZZY_GAP_REQUIRED = 0.12;

export interface AdpNameMatchResult {
  detail?: AdpPayrollDetail;
  source: string;
  confidence: number;
}

export interface CprMemoryMaps {
  byTimelogNorm: Map<string, CprMemoryRecord>;
  byAdpNorm: Map<string, CprMemoryRecord>;
}

const SEEDED_ALIAS_PAIRS: Array<[string, string[]]> = [
  ['aj todd', ['anthony j todd', 'anthony todd', 'todd anthony j']],
  ['anthony todd', ['anthony j todd', 'todd anthony j']],
  ['kyle patterson', ['james k patterson', 'james patterson', 'patterson james k']],
  ['kim rhoades', ['kimberly a rhoades', 'kimberly rhoades', 'rhoades kimberly a']],
  ['ellie todd nichol', ['elizabeth todd nichol', 'todd nichol elizabeth']],
  ['john dallas', ['jonathan dallas', 'dallas jonathan']],
  ['charles forbes', ['charles forbes', 'forbes charles a', 'charles silverest', 'silverest charles']],
  ['max albright', ['maxy albright', 'albright maxy', 'max albright', 'albright max']],
  ['maxy albright', ['max albright', 'albright max', 'maxy albright', 'albright maxy']],
];

export function buildCprMemoryMaps(records: CprMemoryRecord[]): CprMemoryMaps {
  const byTimelogNorm = new Map<string, CprMemoryRecord>();
  const byAdpNorm = new Map<string, CprMemoryRecord>();
  for (const record of records) {
    byTimelogNorm.set(record.timelogNorm, record);
    byAdpNorm.set(record.adpNorm, record);
  }
  return { byTimelogNorm, byAdpNorm };
}

function lastNameFromNorm(norm: string): string {
  const tokens = String(norm ?? '').split(' ').filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1] : '';
}

function tokenSimilarity(a: string, b: string): number {
  const setA = new Set(String(a ?? '').split(' ').filter(Boolean));
  const setB = new Set(String(b ?? '').split(' ').filter(Boolean));
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  setA.forEach(token => {
    if (setB.has(token)) intersection++;
  });
  return intersection / (setA.size + setB.size - intersection);
}

interface MatchCandidate {
  norm: string;
  rawName: string;
  detail: AdpPayrollDetail;
}

function adpDetailsForWeek(details: AdpPayrollDetail[], weekEnding: string): AdpPayrollDetail[] {
  return details.filter(d => adpPayPeriodMatchesWeek(d.payPeriodEnding, weekEnding));
}

function toCandidates(details: AdpPayrollDetail[]): MatchCandidate[] {
  return details.map(detail => ({
    norm: normalizePersonName(detail.employeeName),
    rawName: detail.employeeName,
    detail,
  }));
}

function seededAliasMatch(timeNorm: string, candidates: MatchCandidate[]): AdpPayrollDetail | undefined {
  for (const [source, aliases] of SEEDED_ALIAS_PAIRS) {
    if (timeNorm !== source) continue;
    for (const target of aliases) {
      const found = candidates.find(c =>
        c.norm === target || c.norm.includes(target) || target.includes(c.norm),
      );
      if (found) return found.detail;
    }
  }
  return undefined;
}

function bestTokenMatch(
  sourceNorm: string,
  candidates: MatchCandidate[],
): { item: MatchCandidate; score: number; nextScore: number } | null {
  let best: { item: MatchCandidate; score: number; nextScore: number } | null = null;
  let second = 0;

  for (const candidate of candidates) {
    const score = tokenSimilarity(sourceNorm, candidate.norm);
    if (!best || score > best.score) {
      second = best ? best.score : 0;
      best = { item: candidate, score, nextScore: second };
    } else if (score > second) {
      second = score;
    }
  }

  if (best) best.nextScore = second;
  return best;
}

function buildEmployeeDbMap(employeeInfo: EmployeePayrollInfo[]): Map<string, EmployeePayrollInfo> {
  const map = new Map<string, EmployeePayrollInfo>();
  for (const info of employeeInfo) {
    map.set(normalizePersonName(info.employeeName), info);
    if (info.legalName) map.set(normalizePersonName(info.legalName), info);
  }
  return map;
}

/** Resolve timelog employee name to ADP payroll detail (Apps Script resolveTimelogEmployeeToAdp_). */
export function resolveAdpPayrollDetail(input: {
  timelogEmployee: string;
  weekEnding: string;
  adpDetails: AdpPayrollDetail[];
  memory?: CprMemoryRecord[];
  employeeInfo?: EmployeePayrollInfo[];
}): AdpNameMatchResult {
  const timeNorm = normalizePersonName(input.timelogEmployee);
  if (!timeNorm) {
    return { source: 'missing timelog name', confidence: 0 };
  }

  const weekDetails = adpDetailsForWeek(input.adpDetails, input.weekEnding);
  const candidates = toCandidates(weekDetails);
  const memoryMaps = buildCprMemoryMaps(input.memory ?? []);
  const employeeDb = buildEmployeeDbMap(input.employeeInfo ?? []);

  const memory = memoryMaps.byTimelogNorm.get(timeNorm);
  if (memory?.adpNorm) {
    const found = candidates.find(c =>
      c.norm === memory.adpNorm || normalizePersonName(c.rawName) === memory.adpNorm,
    );
    if (found) return { detail: found.detail, source: 'CPR Memory', confidence: 1.0 };
  }

  const exact = candidates.find(c => c.norm === timeNorm);
  if (exact) return { detail: exact.detail, source: 'exact name', confidence: 1.0 };

  const exactKey = candidates.find(c => normalizeEmployeeKey(c.rawName) === normalizeEmployeeKey(input.timelogEmployee));
  if (exactKey) return { detail: exactKey.detail, source: 'exact employee key', confidence: 1.0 };

  const seeded = seededAliasMatch(timeNorm, candidates);
  if (seeded) return { detail: seeded, source: 'built-in alias', confidence: 0.97 };

  const empExact = employeeDb.get(timeNorm);
  if (empExact) {
    const empNorm = normalizePersonName(empExact.employeeName);
    const adpExact = candidates.find(c => c.norm === empNorm);
    if (adpExact) return { detail: adpExact.detail, source: 'employee db exact', confidence: 0.96 };
  }

  const best = bestTokenMatch(timeNorm, candidates);
  if (
    best
    && best.score >= CPR_FUZZY_CONFIDENCE
    && best.score - best.nextScore >= CPR_FUZZY_GAP_REQUIRED
  ) {
    return { detail: best.item.detail, source: 'fuzzy name', confidence: best.score };
  }

  const last = lastNameFromNorm(timeNorm);
  const lastMatches = candidates.filter(c => lastNameFromNorm(c.norm) === last);
  if (last && lastMatches.length === 1) {
    return { detail: lastMatches[0].detail, source: 'unique last name', confidence: 0.86 };
  }

  return { source: 'unmatched', confidence: 0 };
}
