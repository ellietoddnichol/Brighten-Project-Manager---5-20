export interface WipForecastProjectRow {
  jobNumber?: string;
  projectLabel?: string;
  projectName?: string;
  customer?: string;
  status?: string;
  forecastTreatment?: string;
  startDate?: string;
  endDate?: string;
  contractBudget?: number;
  contractSource?: string;
  cumulativeBilledEarned?: number;
  billings2026Ytd?: number;
  openAr?: number;
  remainingBacklog?: number;
  forecastLowPct?: number;
  forecastBasePct?: number;
  forecastHighPct?: number;
  projected2026Low?: number;
  projected2026Base?: number;
  projected2026High?: number;
  cogs2026Ytd?: number;
  grossProfit2026?: number;
  gpMargin2026?: number;
  selfLabor?: number;
  subcontractors?: number;
  materials?: number;
  equipmentOther?: number;
  openApIdentified?: number;
  notes?: string;
}

export interface WipForecastArRow {
  jobNumber?: string;
  projectLabel?: string;
  status?: string;
  currentAmount?: number;
  days1To30?: number;
  days31To60?: number;
  days61To90?: number;
  days90Plus?: number;
  totalOpen?: number;
  treatment?: string;
}

export interface WipForecastPayAppRow {
  jobNumber?: string;
  projectLabel?: string;
  sourceFile?: string;
  contractSum?: number;
  completedToDate?: number;
  earnedLessRetainage?: number;
  currentDue?: number;
  balanceToFinish?: number;
  retainage?: number;
  notes?: string;
}

export interface WipForecastSeed {
  meta: {
    sourceFile: string;
    asOfDate: string;
    title: string;
    dashboard?: Record<string, string | number>;
  };
  projects: WipForecastProjectRow[];
  arAging: WipForecastArRow[];
  payApps: WipForecastPayAppRow[];
}

export interface WipForecastImportResult {
  projectsPatched: number;
  projectsCreated: number;
  arCreated: number;
  arUpdated: number;
  arClosed: number;
  exceptions: number;
  unmatched: number;
}
