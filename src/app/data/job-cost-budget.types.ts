export type JobCostBudgetCategory = 'Labor' | 'Materials' | 'Subcontractors' | 'Equipment' | 'Other';

export interface JobCostBudgetLineSeed {
  costCode: string;
  category: JobCostBudgetCategory;
  originalBudget: number;
  actualCost: number;
  approvedCOBudget: number;
  revisedBudget: number;
  costToComplete: number;
  projectedFinalCost: number;
  variance: number;
  hoursBudgeted?: number;
  hoursActual?: number;
}

export interface JobCostBudgetProjectSeed {
  jobNumber: string;
  projectName: string;
  sourceFile: string;
  sourceSheet?: string;
  updatedContract?: number;
  changeOrderCount?: number;
  estCostBudget?: number;
  actualCostToDate?: number;
  estimatedProfit?: number;
  estimatedMargin?: number;
  percentComplete?: number;
  estLaborCost?: number;
  estMaterialCost?: number;
  estSubCost?: number;
  estOtherCost?: number;
  lines: JobCostBudgetLineSeed[];
}

export interface JobCostPortfolioSummarySeed {
  jobNumber: string;
  jobLabel: string;
  status?: string;
  contractAmount?: number;
  currentCost?: number;
  costToComplete?: number;
  estTotalCost?: number;
  estProfit?: number;
  estProfitPercent?: number;
  totalInvoiced?: number;
  leftToInvoice?: number;
  laborCost?: number;
  materialCost?: number;
  subcontractorCost?: number;
  foreman?: string;
}

export interface JobCostBudgetSeedBundle {
  meta: {
    generatedAt: string;
    sourceFiles: string[];
    projectCount: number;
    lineCount: number;
  };
  projects: JobCostBudgetProjectSeed[];
  portfolioSummaries: JobCostPortfolioSummarySeed[];
}
