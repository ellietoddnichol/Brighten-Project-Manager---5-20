export interface QboReportsMeta {
  company: string;
  importedAt: string;
  asOfDate: string;
  description: string;
  sourceFiles: string[];
}

export interface QboProjectsReportRow {
  income?: number | null;
  cost?: number | null;
  profitMargin?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface QboWipReportRow {
  totalActCosts?: number | null;
  difference?: number | null;
  profit?: number | null;
  profitMargin?: number | null;
  totalActIncome?: number | null;
}

export interface QboReportRecord {
  slug: string;
  jobNumber?: string | null;
  qboLabel: string;
  customer?: string | null;
  projectsReport?: QboProjectsReportRow | null;
  wipReport?: QboWipReportRow | null;
}

export interface QboReportsBundle {
  meta: QboReportsMeta;
  records: QboReportRecord[];
}
