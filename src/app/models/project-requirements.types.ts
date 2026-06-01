export type ProjectProfile =
  | 'FullProject'
  | 'SmallInstall'
  | 'TMWorkOrder'
  | 'PrevailingWage'
  | 'Subcontracted'
  | 'CloseoutAR'
  | 'BidOnly';

export type FolderRequirementLevel = 'required' | 'optional' | 'not_needed';

export type FolderNeedStatus =
  | 'found'
  | 'missing_required'
  | 'missing_optional'
  | 'not_needed';

export const PROJECT_PROFILE_LABELS: Record<ProjectProfile, string> = {
  FullProject: 'Full Construction Project',
  SmallInstall: 'Small Install / Service',
  TMWorkOrder: 'T&M / Work Order',
  PrevailingWage: 'Prevailing Wage / CPR',
  Subcontracted: 'Subcontracted Job',
  CloseoutAR: 'Closeout / AR Only',
  BidOnly: 'Bid Only',
};

export const PROJECT_PROFILE_OPTIONS: ProjectProfile[] = [
  'FullProject',
  'SmallInstall',
  'TMWorkOrder',
  'PrevailingWage',
  'Subcontracted',
  'CloseoutAR',
  'BidOnly',
];
