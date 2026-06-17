export interface ProjectProfitInput {
  revisedContractAmount: number;
  billedToDate: number;
  costToDate: number;
  estimatedTotalCost: number;
}

export interface ProjectProfitMetrics {
  billedPercent: number | null;
  costPercent: number | null;
  profitToDate: number;
  expectedCostAtBilledPercent: number | null;
  costVariance: number | null;
  projectedTotalCost: number | null;
  projectedProfit: number | null;
  projectedMargin: number | null;
  costAheadOfBilling: boolean | null;
}

function safeDiv(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

export function computeProjectProfitMetrics(input: ProjectProfitInput): ProjectProfitMetrics {
  const revised = input.revisedContractAmount ?? 0;
  const billed = input.billedToDate ?? 0;
  const cost = input.costToDate ?? 0;
  const estimated = input.estimatedTotalCost ?? 0;

  const billedPercent = billed > 0 ? safeDiv(billed, revised) : null;
  const costPercent = safeDiv(cost, estimated);
  const profitToDate = billed - cost;

  const expectedCostAtBilledPercent =
    billedPercent != null && estimated > 0 ? estimated * billedPercent : null;

  const costVariance =
    expectedCostAtBilledPercent != null ? expectedCostAtBilledPercent - cost : null;

  const projectedTotalCost = billedPercent != null && billedPercent > 0 ? cost / billedPercent : null;

  const projectedProfit =
    projectedTotalCost != null && revised > 0 ? revised - projectedTotalCost : null;

  const projectedMargin = projectedProfit != null ? safeDiv(projectedProfit, revised) : null;

  return {
    billedPercent,
    costPercent,
    profitToDate,
    expectedCostAtBilledPercent,
    costVariance,
    projectedTotalCost,
    projectedProfit,
    projectedMargin,
    costAheadOfBilling: costVariance != null ? costVariance > 0 : null,
  };
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
