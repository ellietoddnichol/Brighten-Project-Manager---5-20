export type ProjectCostCategory = 'labor' | 'sub' | 'material' | 'equipment' | 'other';

export interface ProjectCostTransaction {
  vendor?: string;
  transactionType?: string;
  date?: string;
  month?: string;
  num?: string;
  account: string;
  accountType?: string;
  className?: string;
  memo?: string;
  amount: number;
  category: ProjectCostCategory;
}

export interface ProjectCostSummary {
  jobNumber: string;
  qboLabel: string;
  projectName?: string;
  laborCost: number;
  subCost: number;
  materialCost: number;
  equipmentCost: number;
  otherCost: number;
  totalCost: number;
  transactionCount: number;
}

export interface ProjectCostMonthlyLabor {
  jobNumber: string;
  qboLabel: string;
  month: string;
  laborCost: number;
  wageCost: number;
  fringeCost: number;
  transactionCount: number;
}

export interface ProjectCostsSeedBundle {
  meta: {
    company: string;
    importedAt: string;
    asOfDate: string;
    periodLabel?: string;
    sourceFile: string;
    projectCount: number;
    transactionCount: number;
  };
  projects: ProjectCostSummary[];
  monthlyLabor: ProjectCostMonthlyLabor[];
  transactions?: ProjectCostTransaction[];
}
