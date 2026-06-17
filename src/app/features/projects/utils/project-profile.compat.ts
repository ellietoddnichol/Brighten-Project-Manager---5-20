import { ProjectProfile, PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';

/** Map legacy profile values stored in Firestore to the four manual-first profiles. */
const LEGACY_PROFILE_MAP: Record<string, ProjectProfile> = {
  FullProject: 'FullContractGC',
  Subcontracted: 'FullProjectSubcontractor',
  SmallInstall: 'SmallJob',
  TMWorkOrder: 'TM',
  PrevailingWage: 'FullContractGC',
  CloseoutAR: 'SmallJob',
  BidOnly: 'SmallJob',
};

export function normalizeProjectProfile(value: string | undefined | null): ProjectProfile | undefined {
  if (!value) return undefined;
  if (value in PROJECT_PROFILE_LABELS) return value as ProjectProfile;
  return LEGACY_PROFILE_MAP[value];
}

export function projectProfileLabel(value: string | undefined | null): string {
  const normalized = normalizeProjectProfile(value);
  if (!normalized) return '—';
  return PROJECT_PROFILE_LABELS[normalized];
}
