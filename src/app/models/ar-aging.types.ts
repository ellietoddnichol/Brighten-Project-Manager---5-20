export interface ArAgingSeedRow {
  jobNumber: string;
  projectName?: string;
  customerGroup?: string;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  total: number;
}

export interface ArAgingSeed {
  meta: {
    asOfDate: string;
    sourceFile: string;
    grandTotal: number;
  };
  rows: ArAgingSeedRow[];
}

export interface ArAgingImportResult {
  arCreated: number;
  arUpdated: number;
  arClosed: number;
  projectsPatched: number;
  unmatched: number;
}
