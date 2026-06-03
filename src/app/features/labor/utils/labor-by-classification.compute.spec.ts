import { describe, it, expect } from 'vitest';
import { NormalizedLaborEntry } from '@app/models/labor.types';
import { ProjectBudgetLine } from '@app/models/types';
import {
  buildClassificationLaborRows,
  computeLaborBudgetSummary,
  normalizeClassificationLabel,
  normalizeJobNumberKey,
  summarizeClassificationLabor,
  UNCLASSIFIED_LABEL,
} from '@features/labor/utils/labor-by-classification.compute';

function entry(partial: Partial<NormalizedLaborEntry>): NormalizedLaborEntry {
  return {
    id: Math.random().toString(36).slice(2),
    month: '2026-05',
    totalHours: 0,
    rateSource: 'classification',
    regularHours: 0,
    overtimeHours: 0,
    doubleTimeHours: 0,
    wageCost: 0,
    fringeCost: 0,
    estimatedLaborTotal: 0,
    rateMissing: false,
    ...partial,
  } as NormalizedLaborEntry;
}

function budgetLine(partial: Partial<ProjectBudgetLine>): ProjectBudgetLine {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: 'p1',
    category: 'Labor',
    originalBudget: 0,
    approvedCOBudget: 0,
    revisedBudget: 0,
    ...partial,
  } as ProjectBudgetLine;
}

describe('normalizeClassificationLabel', () => {
  it('falls back to Unclassified for empty/placeholder values', () => {
    expect(normalizeClassificationLabel(undefined)).toBe(UNCLASSIFIED_LABEL);
    expect(normalizeClassificationLabel('  ')).toBe(UNCLASSIFIED_LABEL);
    expect(normalizeClassificationLabel('—')).toBe(UNCLASSIFIED_LABEL);
    expect(normalizeClassificationLabel(' Electrician ')).toBe('Electrician');
  });
});

describe('normalizeJobNumberKey', () => {
  it('strips J prefix and punctuation so variants match', () => {
    expect(normalizeJobNumberKey('J204')).toBe('204');
    expect(normalizeJobNumberKey('204')).toBe('204');
    expect(normalizeJobNumberKey('J-204 ')).toBe('204');
    expect(normalizeJobNumberKey(undefined)).toBe('');
  });
});

describe('buildClassificationLaborRows', () => {
  const entries: NormalizedLaborEntry[] = [
    entry({ classification: 'Electrician', month: '2026-05', regularHours: 40, totalHours: 40, wageCost: 2000, fringeCost: 800, estimatedLaborTotal: 2800 }),
    entry({ classification: 'Electrician', month: '2026-05', overtimeHours: 5, totalHours: 5, wageCost: 375, fringeCost: 100, estimatedLaborTotal: 475 }),
    entry({ classification: 'Foreman', month: '2026-05', regularHours: 40, totalHours: 40, wageCost: 3200, fringeCost: 900, estimatedLaborTotal: 4100 }),
    entry({ classification: 'Electrician', month: '2026-04', regularHours: 40, totalHours: 40, wageCost: 2000, fringeCost: 800, estimatedLaborTotal: 2800 }),
    entry({ classification: undefined, month: '2026-05', regularHours: 8, totalHours: 8, wageCost: 0, fringeCost: 0, estimatedLaborTotal: 0, rateMissing: true }),
  ];

  it('groups by classification for a single month and merges rows', () => {
    const rows = buildClassificationLaborRows(entries, '2026-05');
    const electrician = rows.find(r => r.classification === 'Electrician');
    expect(electrician?.totalHours).toBe(45);
    expect(electrician?.wageCost).toBe(2375);
    expect(electrician?.fringeCost).toBe(900);
    expect(electrician?.estimatedLaborTotal).toBe(3275);
    expect(electrician?.rowCount).toBe(2);
  });

  it('excludes other months and sorts by estimated total desc', () => {
    const rows = buildClassificationLaborRows(entries, '2026-05');
    expect(rows[0].classification).toBe('Foreman');
    // April Electrician row should not inflate May totals
    expect(rows.find(r => r.classification === 'Electrician')?.totalHours).toBe(45);
  });

  it('flags missing rate and labels unclassified rows', () => {
    const rows = buildClassificationLaborRows(entries, '2026-05');
    const unclassified = rows.find(r => r.classification === UNCLASSIFIED_LABEL);
    expect(unclassified?.hasMissingRate).toBe(true);
  });

  it('rolls up every month when month = all', () => {
    const rows = buildClassificationLaborRows(entries, 'all');
    expect(rows.find(r => r.classification === 'Electrician')?.totalHours).toBe(85);
  });
});

describe('summarizeClassificationLabor', () => {
  it('totals all rows', () => {
    const rows = buildClassificationLaborRows(
      [
        entry({ classification: 'Electrician', regularHours: 40, totalHours: 40, wageCost: 2000, fringeCost: 800, estimatedLaborTotal: 2800 }),
        entry({ classification: 'Foreman', regularHours: 40, totalHours: 40, wageCost: 3200, fringeCost: 900, estimatedLaborTotal: 4100 }),
      ],
      '2026-05',
    );
    const totals = summarizeClassificationLabor(rows);
    expect(totals.totalHours).toBe(80);
    expect(totals.estimatedLaborTotal).toBe(6900);
    expect(totals.rowCount).toBe(2);
  });
});

describe('computeLaborBudgetSummary', () => {
  const projects = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  const budgetLines = [
    budgetLine({ projectId: 'p1', category: 'Labor', budgetAmount: 100000 }),
    budgetLine({ projectId: 'p1', category: 'Materials', budgetAmount: 50000 }),
    budgetLine({ projectId: 'p2', category: 'Labor', budgetAmount: 60000 }),
  ];
  const activeEntries = [
    entry({ projectId: 'p1', estimatedLaborTotal: 40000 }),
    entry({ projectId: 'p2', estimatedLaborTotal: 20000 }),
  ];

  it('sums only Labor-category budget and compares to estimated to-date', () => {
    const summary = computeLaborBudgetSummary(projects, budgetLines, activeEntries);
    expect(summary.totalLaborBudget).toBe(160000);
    expect(summary.estLaborToDate).toBe(60000);
    expect(summary.pctUsed).toBeCloseTo(0.375, 5);
    expect(summary.remaining).toBe(100000);
    expect(summary.jobsWithBudget).toBe(2);
    expect(summary.jobsMissingBudget).toBe(1);
  });

  it('returns 0 pctUsed when no labor budget exists', () => {
    const summary = computeLaborBudgetSummary([{ id: 'x' }], [], [entry({ estimatedLaborTotal: 5000 })]);
    expect(summary.totalLaborBudget).toBe(0);
    expect(summary.pctUsed).toBe(0);
    expect(summary.remaining).toBe(-5000);
  });
});
