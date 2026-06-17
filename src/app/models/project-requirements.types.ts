/** Manual-first job profiles — exactly four types. */
export type ProjectProfile =
  | 'FullProjectSubcontractor'
  | 'FullContractGC'
  | 'TM'
  | 'SmallJob';

export type FolderRequirementLevel = 'required' | 'optional' | 'not_needed';

export type FolderNeedStatus =
  | 'found'
  | 'missing_required'
  | 'missing_optional'
  | 'not_needed';

export const PROJECT_PROFILE_LABELS: Record<ProjectProfile, string> = {
  FullProjectSubcontractor: 'Full Project - Subcontractor',
  FullContractGC: 'Full Contract - GC',
  TM: 'T&M',
  SmallJob: 'Small Job',
};

export const PROJECT_PROFILE_OPTIONS: ProjectProfile[] = [
  'FullProjectSubcontractor',
  'FullContractGC',
  'TM',
  'SmallJob',
];
