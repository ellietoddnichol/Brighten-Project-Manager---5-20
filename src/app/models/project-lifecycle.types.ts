export type NormalizedProjectStatus =
  | 'Upcoming'
  | 'Precon'
  | 'Active'
  | 'OnHold'
  | 'Closeout'
  | 'Complete'
  | 'Closed'
  | 'Archived';

export type ProjectLifecycleGroup =
  | 'Active'
  | 'Upcoming'
  | 'Closeout'
  | 'Closed2026'
  | 'Archive'
  | 'NeedsReview';

export type SeedCompletenessStatus =
  | 'Complete'
  | 'MissingFinancials'
  | 'MissingDrive'
  | 'MissingStatus'
  | 'MissingCustomer'
  | 'NeedsReview';

export type ProjectsListView =
  | 'default'
  | 'active'
  | 'upcoming'
  | 'closeout'
  | 'closed2026'
  | 'archive'
  | 'needsReview'
  | 'all';

export interface SeedCompletenessGap {
  field: string;
  label: string;
  category: 'identity' | 'financials' | 'drive' | 'status' | 'team' | 'compliance' | 'reporting';
  blocksWorkflow: boolean;
}

export interface ProjectLifecycleSnapshot {
  projectId: string;
  jobNumber?: string;
  projectName?: string;
  normalizedStatus: NormalizedProjectStatus;
  projectLifecycleGroup: ProjectLifecycleGroup;
  /** Job is on the Active 2026 Job Control List. */
  isActive2026ControlJob: boolean;
  /** Default Projects / Active WIP scope (control list or AR/retainage/closeout/2026 activity). */
  includeInDefaultScope: boolean;
  includeInProjectsList: boolean;
  includeInActiveWip: boolean;
  includeInClosed2026: boolean;
  includeInArchive: boolean;
  /** Closed/complete job with open AR or retainage — Closeout AR WIP bucket only. */
  includeInCloseoutAr: boolean;
  hasRetainage: boolean;
  closedDate?: string;
  fiscalYear?: number;
  has2026Activity: boolean;
  hasOpenWipWork: boolean;
  hasOpenAr: boolean;
  hasOpenTasks: boolean;
  hasOpenCompliance: boolean;
  seedCompletenessStatus: SeedCompletenessStatus;
  seedGaps: SeedCompletenessGap[];
  /** Earliest detected start from time, billing, or manual override. */
  derivedStartDate?: string;
  /** 2026 financial rollups for Closed 2026 view */
  billed2026?: number;
  cost2026?: number;
  ar2026?: number;
  reviewReasons: string[];
}
