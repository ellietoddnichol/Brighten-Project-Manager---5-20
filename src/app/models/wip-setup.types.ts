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
  billingType?: 'T&M' | 'Lump Sum' | 'Progress Billing';
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
  foremanDefaultsApplied: number;
  unmatched: number;
}
