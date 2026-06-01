export interface BrightenSeedMeta {
  company: string;
  generatedAt: string;
  asOfDate: string;
  description: string;
}

export interface BrightenSeedProject {
  projectId: string;
  jobNumber: number | string | null;
  projectName: string;
  displayName: string;
  customer: string | null;
  status: string;
  dashboardGroup: string;
  includeOnActiveDashboard: boolean;
  scopeType?: string | null;
  scopeSummary?: string | null;
  phase?: string | null;
  currentActivity?: string | null;
  nextMilestone?: string | null;
  nextMilestoneDate?: string | null;
  targetCompletionDate?: string | null;
  priority?: string | null;
  riskLevel?: string | null;
  actionRequired?: string | null;
  notes?: string | null;
  source?: string | null;
}

export interface BrightenSeedFinancial {
  projectId: string;
  displayName: string;
  dashboardGroup?: string;
  contractAmount2026?: number | null;
  fullContractReference?: number | null;
  estimatedCostBudget2026?: number | null;
  costToDate2026?: number | null;
  percentComplete?: number | null;
  earnedRevenue?: number | null;
  billedToDate2026?: number | null;
  overUnderBilled?: number | null;
  currentAR?: number | null;
  leftToBill2026?: number | null;
  costToComplete?: number | null;
  forecastGrossProfit?: number | null;
  forecastMargin?: number | null;
  source?: string | null;
}

export interface BrightenSeedMilestone {
  milestoneId: string;
  projectId: string;
  displayName: string;
  title: string;
  targetDate?: string | null;
  status: string;
  notes?: string | null;
  source?: string | null;
}

export interface BrightenSeedNote {
  projectId: string;
  displayName: string;
  noteType?: string;
  note?: string;
  source?: string | null;
}

export interface BrightenSeedChangeOrder {
  changeOrderId: string;
  projectId: string;
  displayName: string;
  coNumber: string;
  title: string;
  description: string;
  amount: number | null;
  status: 'Pending' | 'Accepted' | 'Paid' | 'Rejected' | 'Draft';
  sourceUrl?: string | null;
  sourceUrls?: string[] | null;
  dateSubmitted?: string | null;
  dateApproved?: string | null;
}

export interface BrightenSeedBundle {
  meta: BrightenSeedMeta;
  projects: BrightenSeedProject[];
  financials: BrightenSeedFinancial[];
  milestones: BrightenSeedMilestone[];
  notes?: BrightenSeedNote[];
  changeOrders?: BrightenSeedChangeOrder[];
}
