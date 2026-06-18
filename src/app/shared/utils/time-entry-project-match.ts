import { Project, TimeEntry } from '@app/models/types';
import { normalizeJobKey, parseJobLabel } from '@shared/utils/master-sheet-parser';

function projectMatchKeys(project: Project): Set<string> {
  const keys = new Set<string>();
  const num = project.projectNumber?.trim();
  if (num) {
    keys.add(normalizeJobKey(num));
    const name = project.projectName?.trim();
    if (name) {
      keys.add(normalizeJobKey(`${num} - ${name}`));
      keys.add(normalizeJobKey(name));
    }
  }
  if (project.masterSheetJobId?.trim()) {
    keys.add(normalizeJobKey(project.masterSheetJobId));
  }
  return keys;
}

/** True when a Master Time row belongs to this project (strict — no prefix guessing). */
export function timeEntryMatchesProject(
  project: Project,
  entry: Pick<TimeEntry, 'projectId' | 'jobIdLabel'>,
): boolean {
  const label = entry.jobIdLabel?.trim();
  if (!label) {
    return false;
  }

  if (entry.projectId && entry.projectId === project.id) {
    return true;
  }

  const keys = projectMatchKeys(project);
  const labelKey = normalizeJobKey(label);
  if (keys.has(labelKey)) {
    return true;
  }

  const parsed = parseJobLabel(label);
  if (parsed.projectNumber && keys.has(normalizeJobKey(parsed.projectNumber))) {
    return true;
  }
  if (parsed.projectName && keys.has(normalizeJobKey(parsed.projectName))) {
    return true;
  }

  return false;
}
