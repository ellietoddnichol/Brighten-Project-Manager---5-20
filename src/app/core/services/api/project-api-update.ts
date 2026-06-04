import { Project } from '@app/models/types';
import { isMasterSheetReadOnlyField } from '@shared/utils/master-sheet-fields';

/** Payload keys accepted by PATCH /api/projects/:id (UI-shaped). */
export type ProjectApiUpdatePayload = Record<string, unknown>;

function datePart(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  return value.slice(0, 10);
}

/**
 * Build API PATCH body from edit draft vs current project.
 * Covers Phase 1A fields plus Phase 1B Overview completion (profile, retainage,
 * award date, current phase, project scope). PM/contacts remain out of scope.
 */
export function buildProjectApiUpdatePayload(
  current: Project,
  draft: Partial<Project>,
): ProjectApiUpdatePayload {
  const patch: ProjectApiUpdatePayload = {};

  const setIfChanged = <K extends keyof Project>(
    key: K,
    toApi?: (v: Project[K]) => unknown,
  ): void => {
    if (isMasterSheetReadOnlyField(key, current)) return;
    const next = draft[key];
    if (next === undefined) return;
    if (next === current[key]) return;
    patch[String(key)] = toApi ? toApi(next) : next;
  };

  setIfChanged('projectNumber');
  setIfChanged('projectName');
  setIfChanged('customer');
  setIfChanged('status');
  setIfChanged('address');
  setIfChanged('city');
  setIfChanged('state');
  setIfChanged('county');
  setIfChanged('originalContractAmount');
  setIfChanged('billingStatus');
  setIfChanged('startDate', (v) => datePart(v as string));
  setIfChanged('targetCompletionDate', (v) => datePart(v as string));
  setIfChanged('taxExempt');
  setIfChanged('driveFolderId');

  // Phase 1B — Overview completion
  setIfChanged('projectProfile');
  setIfChanged('retainagePercent');
  setIfChanged('awardDate', (v) => datePart(v as string));
  setIfChanged('currentPhase');
  setIfChanged('scopeSummary');
  setIfChanged('includedWork');
  setIfChanged('exclusions');
  setIfChanged('scheduleAccessNotes');
  setIfChanged('closeoutRequirements');

  if (!isMasterSheetReadOnlyField('superintendent', current)) {
    const sup = draft.superintendent;
    if (sup !== undefined && sup !== current.superintendent) {
      patch['superintendent'] = sup;
    }
  }

  const draftPw = draft.prevailingWage ?? draft.certifiedPayrollRequired;
  const curPw = current.prevailingWage || current.certifiedPayrollRequired;
  if (draftPw !== undefined && Boolean(draftPw) !== Boolean(curPw)) {
    patch['prevailingWage'] = Boolean(draftPw);
  }

  return patch;
}

export function hasApiUpdateFields(patch: ProjectApiUpdatePayload): boolean {
  return Object.keys(patch).length > 0;
}
