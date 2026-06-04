import { ProjectFinancialSummaryApiResponse } from './project-api.types';

export interface ProjectSqlFinancialSummary {
  source: 'sql';
  asOfDate: string | null;
  projectId: string;
  jobNumber: string;
  contract: {
    originalContractAmount: number | null;
    revisedContractAmount: number | null;
  };
  billing: {
    billedToDate: number | null;
    remainingToBill: number | null;
    arBalance: number | null;
  };
  cost: {
    estimatedCost: number | null;
    actualCost: number | null;
    laborActual: number | null;
    materialsActual: number | null;
    subcontractorsActual: number | null;
    otherPreconActual: number | null;
  };
  profit: {
    profit: number | null;
    marginPercent: number | null;
  };
  dataWarnings: string[];
  costBreakdown: ProjectSqlCostBreakdown;
}

export interface ProjectSqlCostBreakdown {
  asOfDate: string | null;
  confidence: string | null;
  categories: ProjectSqlCostBreakdownCategory[];
  dataWarnings: string[];
}

export interface ProjectSqlCostBreakdownCategory {
  category: string;
  budget: number | null;
  actual: number | null;
  remaining: number | null;
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function datePart(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export function mapFinancialSummaryResponse(
  resp: ProjectFinancialSummaryApiResponse,
): ProjectSqlFinancialSummary {
  const item = resp.item;
  return {
    source: 'sql',
    asOfDate: datePart(resp.asOfDate),
    projectId: item.projectId,
    jobNumber: item.jobNumber,
    contract: {
      originalContractAmount: num(item.contract.originalContractAmount),
      revisedContractAmount: num(item.contract.revisedContractAmount),
    },
    billing: {
      billedToDate: num(item.billing.billedToDate),
      remainingToBill: num(item.billing.remainingToBill),
      arBalance: num(item.billing.arBalance),
    },
    cost: {
      estimatedCost: num(item.cost.estimatedCost),
      actualCost: num(item.cost.actualCost),
      laborActual: num(item.cost.laborActual),
      materialsActual: num(item.cost.materialsActual),
      subcontractorsActual: num(item.cost.subcontractorsActual),
      otherPreconActual: num(item.cost.otherPreconActual),
    },
    profit: {
      profit: num(item.profit.profit),
      marginPercent: num(item.profit.marginPercent),
    },
    dataWarnings: item.dataWarnings ?? [],
    costBreakdown: {
      asOfDate: datePart(item.costBreakdown?.asOfDate),
      confidence: item.costBreakdown?.confidence ?? null,
      categories: (item.costBreakdown?.categories ?? []).map((category) => ({
        category: category.category,
        budget: num(category.budget),
        actual: num(category.actual),
        remaining: num(category.remaining),
      })),
      dataWarnings: item.costBreakdown?.dataWarnings ?? [],
    },
  };
}
