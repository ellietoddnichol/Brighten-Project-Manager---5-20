import { isActive2026ControlJob } from '../config/active-2026-jobs.config';
import { ProjectLifecycleSnapshot } from '../models/project-lifecycle.types';
import { Project } from '../models/types';
import { isArchiveJobNumber } from './wip.compute';
import { isClosedProject, isOverheadJob } from './project';
import { isExplicitlyClosed, isExplicitlyReopened, isManuallyActive } from './project-lifecycle.compute';

/** Fields imports must never set — lifecycle is computed separately. */
const LIFECYCLE_BLOCKED_PATCH_KEYS = new Set<keyof Project>([
  'projectStatus',
  'projectLifecycleGroup',
  'includeInProjectsList',
  'includeInActiveWip',
  'includeOnActiveDashboard',
  'status',
  'wipStatus',
]);

/** Manual app fields — imports must not overwrite when already set; conflicts → Import Review. */
export const IMPORT_PROTECTED_PROJECT_FIELDS: (keyof Project)[] = [
  'projectManager',
  'superintendent',
  'projectProfile',
  'certifiedPayrollRequired',
  'prevailingWage',
  'originalContractAmount',
  'driveFolderId',
  'driveFolderUrl',
  'wipBudgetOverride',
  'estCostBudget',
];

export interface ImportPatchMergeResult {
  patch: Partial<Project>;
  conflicts: Array<{ field: keyof Project; currentValue: unknown; incomingValue: unknown }>;
}

function isManualValueSet(field: keyof Project, value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return true;
}

/**
 * Strip lifecycle/status fields from an import patch so closed jobs cannot be promoted to Active.
 */
export function sanitizeImportProjectPatch(patch: Partial<Project>): Partial<Project> {
  const safe = { ...patch };
  for (const key of LIFECYCLE_BLOCKED_PATCH_KEYS) {
    delete (safe as Record<string, unknown>)[key];
  }
  return safe;
}

/**
 * Merge an import patch into a project without silently overwriting manual fields.
 * Stripped conflicts should be logged to Import Review by the caller.
 */
export function mergeImportProjectPatch(
  project: Project,
  patch: Partial<Project>,
): ImportPatchMergeResult {
  const safe = sanitizeImportProjectPatch(patch);
  const conflicts: ImportPatchMergeResult['conflicts'] = [];

  for (const field of IMPORT_PROTECTED_PROJECT_FIELDS) {
    const incoming = safe[field];
    if (incoming === undefined) continue;
    const current = project[field];
    if (!isManualValueSet(field, current)) continue;
    if (incoming === current) continue;
    conflicts.push({ field, currentValue: current, incomingValue: incoming });
    delete (safe as Record<string, unknown>)[field];
  }

  return { patch: safe, conflicts };
}

/** Status for a newly created project from import — never default to Active for closed/archive jobs. */
export function inferImportedProjectCreateFields(jobNumber: string): Partial<Project> {
  if (isOverheadJob({ projectNumber: jobNumber, projectName: '' })) {
    return { status: 'Closed' };
  }
  if (isActive2026ControlJob(jobNumber)) {
    return { status: 'Active' };
  }
  if (isArchiveJobNumber(jobNumber)) {
    return { status: 'Closed', wipStatus: 'Complete' };
  }
  return { status: 'Closed', wipStatus: 'Complete' };
}

/** Whether financial/budget data from import should patch this project. */
export function shouldApplyImportFinancialPatch(
  project: Project,
  snapshot?: ProjectLifecycleSnapshot,
): boolean {
  if (isOverheadJob(project)) return false;
  if (isManuallyActive(project) || isExplicitlyReopened(project)) return true;
  if (isExplicitlyClosed(project)) return true;
  if (snapshot?.includeInArchive || snapshot?.includeInClosed2026) return true;
  if (isActive2026ControlJob(project.projectNumber)) return true;
  if (snapshot?.includeInDefaultScope) return true;
  return false;
}

/** Whether importing should create missing project records (control list only). */
export function shouldCreateProjectFromImport(jobNumber: string): boolean {
  return isActive2026ControlJob(jobNumber);
}

export function importScopeLabel(snapshot?: ProjectLifecycleSnapshot): string {
  if (!snapshot) return 'unknown';
  if (snapshot.includeInActiveWip) return 'active-wip';
  if (snapshot.includeInCloseoutAr) return 'closeout-ar';
  if (snapshot.includeInClosed2026) return 'closed-2026';
  if (snapshot.includeInArchive) return 'archive';
  return 'out-of-scope';
}
