import { Project } from '../models/types';

/** Fields owned by the read-only Master Data Sheet sync — not editable in the app. */
export const MASTER_SHEET_SYNCED_PROJECT_FIELDS: (keyof Project)[] = [
  'projectNumber',
  'projectName',
  'address',
  'county',
  'supplier',
  'customer',
  'billingTerms',
  'owner',
  'taxExempt',
  'taxable',
  'kansasRemodelTax',
  'regularHours',
  'overtimeHours',
  'doubleTimeHours',
  'totalLaborHours',
  'lastTimelogDate',
  'timelogEntryCount',
  'masterSheetJobId',
  'masterSheetStatus',
  'masterSheetSyncedAt',
  'masterSheetUrl',
];

export function isMasterSheetLinkedProject(project: Pick<Project, 'masterSheetJobId'>): boolean {
  return !!project.masterSheetJobId?.trim();
}

export function isMasterSheetReadOnlyField(
  field: keyof Project,
  project: Pick<Project, 'masterSheetJobId'>,
): boolean {
  if (!isMasterSheetLinkedProject(project)) return false;
  return MASTER_SHEET_SYNCED_PROJECT_FIELDS.includes(field);
}

/** Prevent accidental overwrites when saving project edits from the UI. */
export function stripMasterSheetFieldsFromUserPatch(
  project: Project,
  patch: Partial<Project>,
): Partial<Project> {
  if (!isMasterSheetLinkedProject(project)) return patch;
  const safe = { ...patch };
  for (const field of MASTER_SHEET_SYNCED_PROJECT_FIELDS) {
    delete (safe as Record<string, unknown>)[field];
  }
  return safe;
}
