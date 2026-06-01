import { NormalizedLaborEntry } from '../models/labor.types';
import { ProjectBudgetLine } from '../models/types';
import { laborBudgetFromLines } from './foreman-bonus.compute';

/** Monthly labor rolled up to a single classification (wages + fringe). */
export interface ClassificationLaborRow {
  classification: string;
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  wageCost: number;
  fringeCost: number;
  estimatedLaborTotal: number;
  rowCount: number;
  hasMissingRate: boolean;
}

export interface ClassificationLaborTotals {
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  totalHours: number;
  wageCost: number;
  fringeCost: number;
  estimatedLaborTotal: number;
  rowCount: number;
}

/** Cumulative labor budget consumption across active jobs. */
export interface LaborBudgetSummary {
  totalLaborBudget: number;
  estLaborToDate: number;
  /** 0..1+ (can exceed 1 when over budget). 0 when no budget exists. */
  pctUsed: number;
  /** budget - spent; negative when over budget. */
  remaining: number;
  jobsWithBudget: number;
  jobsMissingBudget: number;
}

export const UNCLASSIFIED_LABEL = '— Unclassified';

export function normalizeClassificationLabel(classification?: string): string {
  const trimmed = classification?.trim();
  return trimmed && trimmed !== '—' ? trimmed : UNCLASSIFIED_LABEL;
}

/** Strip job prefixes/punctuation so "J204", "204", "J-204 " all match. */
export function normalizeJobNumberKey(value?: string): string {
  if (!value) return '';
  return value.trim().toUpperCase().replace(/^J/, '').replace(/[^A-Z0-9]/g, '');
}

/**
 * Group normalized labor entries into per-classification rows for a given month.
 * Pass month = 'all' to roll up every loaded month. Entries are expected to be
 * pre-filtered to the jobs you care about (e.g. active jobs).
 */
export function buildClassificationLaborRows(
  entries: NormalizedLaborEntry[],
  month: string,
): ClassificationLaborRow[] {
  const map = new Map<string, ClassificationLaborRow>();

  for (const entry of entries) {
    if (month !== 'all' && entry.month !== month) continue;

    const classification = normalizeClassificationLabel(entry.classification);
    const existing = map.get(classification);
    if (existing) {
      existing.regularHours += entry.regularHours;
      existing.overtimeHours += entry.overtimeHours;
      existing.doubleTimeHours += entry.doubleTimeHours;
      existing.totalHours += entry.totalHours;
      existing.wageCost += entry.wageCost;
      existing.fringeCost += entry.fringeCost;
      existing.estimatedLaborTotal += entry.estimatedLaborTotal;
      existing.rowCount += 1;
      existing.hasMissingRate = existing.hasMissingRate || entry.rateMissing;
    } else {
      map.set(classification, {
        classification,
        regularHours: entry.regularHours,
        overtimeHours: entry.overtimeHours,
        doubleTimeHours: entry.doubleTimeHours,
        totalHours: entry.totalHours,
        wageCost: entry.wageCost,
        fringeCost: entry.fringeCost,
        estimatedLaborTotal: entry.estimatedLaborTotal,
        rowCount: 1,
        hasMissingRate: entry.rateMissing,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.estimatedLaborTotal - a.estimatedLaborTotal);
}

export function summarizeClassificationLabor(rows: ClassificationLaborRow[]): ClassificationLaborTotals {
  return rows.reduce<ClassificationLaborTotals>(
    (acc, row) => ({
      regularHours: acc.regularHours + row.regularHours,
      overtimeHours: acc.overtimeHours + row.overtimeHours,
      doubleTimeHours: acc.doubleTimeHours + row.doubleTimeHours,
      totalHours: acc.totalHours + row.totalHours,
      wageCost: acc.wageCost + row.wageCost,
      fringeCost: acc.fringeCost + row.fringeCost,
      estimatedLaborTotal: acc.estimatedLaborTotal + row.estimatedLaborTotal,
      rowCount: acc.rowCount + row.rowCount,
    }),
    {
      regularHours: 0,
      overtimeHours: 0,
      doubleTimeHours: 0,
      totalHours: 0,
      wageCost: 0,
      fringeCost: 0,
      estimatedLaborTotal: 0,
      rowCount: 0,
    },
  );
}

/**
 * Compare cumulative estimated labor (wages + fringe, to-date) against the total
 * Labor-category budget for the given active jobs. `activeEntries` should be the
 * entries already scoped to those jobs (every loaded month).
 */
export function computeLaborBudgetSummary(
  activeProjects: { id: string }[],
  budgetLines: ProjectBudgetLine[],
  activeEntries: NormalizedLaborEntry[],
): LaborBudgetSummary {
  let totalLaborBudget = 0;
  let jobsWithBudget = 0;
  let jobsMissingBudget = 0;

  for (const project of activeProjects) {
    const budget = laborBudgetFromLines(project.id, budgetLines);
    if (budget > 0) {
      totalLaborBudget += budget;
      jobsWithBudget += 1;
    } else {
      jobsMissingBudget += 1;
    }
  }

  const estLaborToDate = activeEntries.reduce((sum, e) => sum + e.estimatedLaborTotal, 0);
  const pctUsed = totalLaborBudget > 0 ? estLaborToDate / totalLaborBudget : 0;
  const remaining = totalLaborBudget - estLaborToDate;

  return {
    totalLaborBudget,
    estLaborToDate,
    pctUsed,
    remaining,
    jobsWithBudget,
    jobsMissingBudget,
  };
}
