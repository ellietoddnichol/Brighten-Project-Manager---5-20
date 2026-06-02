import { ProjectProfile } from '../models/project-requirements.types';

export interface WipSetupProjectRow {
  jobNumber: string;
  projectName?: string;
  address?: string;
  county?: string;
  profileLabel?: string;
  customer?: string;
  foreman?: string;
  prevailingWage?: boolean;
  arStatus?: string;
  originalContractAmount?: number;
  /** @deprecated Use contractPending */
  contractTbd?: boolean;
  contractPending?: boolean;
  contractPendingNote?: string;
  billingNotStarted?: boolean;
  billingType?: 'T&M' | 'Lump Sum' | 'Progress Billing';
  driveFolderUrl?: string;
  targetCompletionDate?: string;
  taxExempt?: boolean;
  setupComplete?: boolean;
  setupNotes?: string;
}

export interface WipSetupSeed {
  meta: {
    sourceFile: string;
    importedAt: string;
  };
  projects: WipSetupProjectRow[];
}

export interface WipSetupImportResult {
  projectsPatched: number;
  projectsCreated: number;
  foremanDefaultsApplied: number;
  unmatched: number;
}
