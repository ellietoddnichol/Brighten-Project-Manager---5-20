import { ChangeOrder, Billing, Project, ProjectBudgetLine } from '../models/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [, m] = key.split('-');
  return MONTHS[Number(m) - 1] ?? key;
}

export function buildMonthlyBillingChart(
  billings: Billing[],
  changeOrders: ChangeOrder[],
): { labels: string[]; rows: Record<string, number>[] } {
  const byMonth = new Map<string, { contract: number; changes: number }>();

  for (const b of billings) {
    const key = monthKey(b.billingPeriod || b.paymentDate);
    if (!key) continue;
    const bucket = byMonth.get(key) ?? { contract: 0, changes: 0 };
    bucket.contract += b.workCompletedThisPeriod ?? b.totalBilledToDate ?? 0;
    byMonth.set(key, bucket);
  }

  for (const co of changeOrders.filter(c => c.status === 'Approved')) {
    const key = monthKey(co.dateApproved || co.dateSubmitted);
    if (!key) continue;
    const bucket = byMonth.get(key) ?? { contract: 0, changes: 0 };
    bucket.changes += co.approvedAmount ?? 0;
    byMonth.set(key, bucket);
  }

  const keys = [...byMonth.keys()].sort().slice(-6);
  if (!keys.length) {
    return {
      labels: MONTHS.slice(0, 5),
      rows: MONTHS.slice(0, 5).map(() => ({ contract: 0, changes: 0 })),
    };
  }

  return {
    labels: keys.map(monthLabel),
    rows: keys.map(k => byMonth.get(k) ?? { contract: 0, changes: 0 }),
  };
}

export function buildChangeStatusDonut(changeOrders: ChangeOrder[]): { label: string; value: number; color: string }[] {
  const buckets = {
    Approved: { value: 0, color: '#10b981' },
    Pending: { value: 0, color: '#f59e0b' },
    'In Review': { value: 0, color: '#8b5cf6' },
    Rejected: { value: 0, color: '#ef4444' },
  };

  for (const co of changeOrders) {
    const amount = co.approvedAmount || co.sellPrice || 0;
    if (co.status === 'Approved') buckets.Approved.value += amount;
    else if (co.status === 'Submitted' || co.status === 'Need Pricing') buckets.Pending.value += amount;
    else if (co.status === 'Draft' || co.status === 'Internal Review') buckets['In Review'].value += amount;
    else if (co.status === 'Rejected' || co.status === 'Void') buckets.Rejected.value += amount;
  }

  return Object.entries(buckets).map(([label, { value, color }]) => ({ label, value, color }));
}

export function buildBilledVsForecastChart(
  projects: Project[],
  billings: Billing[],
): { labels: string[]; rows: Record<string, number>[] } {
  const totalRevised = projects.reduce((s, p) => s + (p.originalContractAmount ?? 0), 0);
  let cumulative = 0;
  const byMonth = new Map<string, number>();

  const sorted = [...billings].sort((a, b) =>
    (a.billingPeriod || '').localeCompare(b.billingPeriod || ''),
  );

  for (const b of sorted) {
    const key = monthKey(b.billingPeriod || b.paymentDate);
    if (!key) continue;
    cumulative += b.workCompletedThisPeriod ?? b.totalBilledToDate ?? 0;
    byMonth.set(key, cumulative);
  }

  const keys = [...byMonth.keys()].sort().slice(-6);
  if (!keys.length) {
    return {
      labels: MONTHS.slice(0, 5),
      rows: MONTHS.slice(0, 5).map((_, i) => ({
        billed: 0,
        forecast: (totalRevised / 5) * (i + 1),
      })),
    };
  }

  const step = totalRevised / keys.length;
  return {
    labels: keys.map(monthLabel),
    rows: keys.map((_, i) => ({
      billed: byMonth.get(keys[i]) ?? 0,
      forecast: step * (i + 1),
    })),
  };
}

export function buildInvoiceStatusDonut(billings: Billing[]): { label: string; value: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const b of billings) {
    counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
  }

  const colors: Record<string, string> = {
    Paid: '#10b981',
    Approved: '#3b82f6',
    Submitted: '#f59e0b',
    'Past Due': '#ef4444',
    Draft: '#94a3b8',
  };

  return [...counts.entries()].map(([label, value]) => ({
    label,
    value,
    color: colors[label] ?? '#64748b',
  }));
}

export function buildArTrendChart(billings: Billing[]): { labels: string[]; rows: Record<string, number>[] } {
  const byMonth = new Map<string, number>();
  for (const b of billings) {
    const key = monthKey(b.billingPeriod || b.paymentDate);
    if (!key) continue;
    const ar = (b.totalBilledToDate ?? 0) - (b.amountPaid ?? 0);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.max(0, ar));
  }

  const keys = [...byMonth.keys()].sort().slice(-6);
  if (!keys.length) {
    return { labels: [], rows: [] };
  }

  let rolling = 0;
  return {
    labels: keys.map(monthLabel),
    rows: keys.map(k => {
      const ar = byMonth.get(k) ?? 0;
      rolling = rolling * 0.7 + ar * 0.3;
      return { ar, rolling };
    }),
  };
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function buildProjectCostDonut(project: Project): DonutSlice[] {
  const hasQboBreakdown = (project.qboLaborCost ?? 0) + (project.qboMaterialCost ?? 0) + (project.qboSubCost ?? 0) > 0;
  const slices = hasQboBreakdown
    ? [
        { label: 'Labor', value: project.qboLaborCost ?? 0, color: '#3b82f6' },
        { label: 'Material', value: project.qboMaterialCost ?? 0, color: '#8b5cf6' },
        { label: 'Sub', value: project.qboSubCost ?? 0, color: '#f59e0b' },
        { label: 'Equipment', value: project.qboEquipmentCost ?? 0, color: '#10b981' },
        { label: 'Other', value: project.qboOtherCost ?? 0, color: '#64748b' },
      ]
    : [
        { label: 'Labor', value: project.estLaborCost ?? 0, color: '#3b82f6' },
        { label: 'Material', value: project.estMaterialCost ?? 0, color: '#8b5cf6' },
        { label: 'Sub', value: project.estSubCost ?? 0, color: '#f59e0b' },
        { label: 'Equipment', value: project.estEquipmentCost ?? 0, color: '#10b981' },
        { label: 'Other', value: project.estOtherCost ?? 0, color: '#64748b' },
      ];
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0 && project.estCostBudget) {
    return [{ label: 'Budget', value: project.estCostBudget, color: '#3b82f6' }];
  }
  return slices;
}

export function buildBudgetVsActualFromLines(lines: ProjectBudgetLine[]): {
  labels: string[];
  rows: Record<string, number>[];
} {
  const buckets = new Map<string, { budget: number; actual: number }>();
  for (const line of lines) {
    const label =
      line.category === 'Materials' ? 'Material'
      : line.category === 'Subcontractors' ? 'Sub'
      : line.category === 'Equipment' ? 'Equipment'
      : line.category;
    const current = buckets.get(label) ?? { budget: 0, actual: 0 };
    current.budget += line.budgetAmount ?? line.revisedBudget ?? line.originalBudget ?? 0;
    current.actual += line.actualCost ?? 0;
    buckets.set(label, current);
  }

  const order = ['Labor', 'Material', 'Sub', 'Equipment', 'Other'];
  const labels = order.filter(l => buckets.has(l));
  const extra = [...buckets.keys()].filter(l => !order.includes(l));
  const allLabels = [...labels, ...extra];

  return {
    labels: allLabels,
    rows: allLabels.map(label => buckets.get(label) ?? { budget: 0, actual: 0 }),
  };
}

export function buildBudgetVsActualBars(project: Project): {
  labels: string[];
  rows: Record<string, number>[];
} {
  const categories = [
    { label: 'Labor', budget: project.estLaborCost ?? 0, actual: (project.estLaborCost ?? 0) * 0.6 },
    { label: 'Material', budget: project.estMaterialCost ?? 0, actual: (project.estMaterialCost ?? 0) * 0.55 },
    { label: 'Sub', budget: project.estSubCost ?? 0, actual: (project.estSubCost ?? 0) * 0.7 },
    { label: 'Equipment', budget: project.estEquipmentCost ?? 0, actual: project.estEquipmentCost ?? 0 },
  ];

  if (!categories.some(c => c.budget > 0)) {
    const budget = project.estCostBudget ?? 0;
    const actual = project.actualCostToDate ?? 0;
    return {
      labels: ['Total'],
      rows: [{ budget, actual }],
    };
  }

  return {
    labels: categories.map(c => c.label),
    rows: categories.map(c => ({ budget: c.budget, actual: c.actual })),
  };
}
