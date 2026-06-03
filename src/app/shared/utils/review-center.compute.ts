import { ImportException } from '@app/models/import.types';
import { ProjectLifecycleSnapshot, SeedCompletenessGap } from '@app/models/project-lifecycle.types';
import { Project } from '@app/models/types';
import { isSetupBlockingGap, setupBlockingGaps } from '@features/projects/utils/project-lifecycle.compute';

export type ReviewCenterFilterId =
  | 'all'
  | 'missingSetup'
  | 'missingContract'
  | 'missingDrive'
  | 'billingReview'
  | 'missingBilling'
  | 'complianceLater'
  | 'dataConflict'
  | 'syncErrors';

export interface ReviewCenterItem {
  id: string;
  filter: ReviewCenterFilterId;
  jobNumber?: string;
  projectName?: string;
  projectId?: string;
  title: string;
  detail: string;
  severity: 'error' | 'warning' | 'info';
  route?: string;
  queryParams?: Record<string, string>;
}

export const REVIEW_CENTER_FILTERS: { id: ReviewCenterFilterId; label: string }[] = [
  { id: 'all', label: 'All items' },
  { id: 'missingSetup', label: 'Missing setup' },
  { id: 'missingContract', label: 'Missing contract' },
  { id: 'missingDrive', label: 'Missing Drive' },
  { id: 'billingReview', label: 'Billing / SOV review' },
  { id: 'missingBilling', label: 'Missing billing file' },
  { id: 'complianceLater', label: 'Compliance later' },
  { id: 'dataConflict', label: 'Data conflicts' },
  { id: 'syncErrors', label: 'Source sync errors' },
];

function gapFilter(gap: SeedCompletenessGap): ReviewCenterFilterId {
  if (gap.field === 'contractPending') return 'missingContract';
  if (gap.field === 'originalContractAmount') return 'missingContract';
  if (gap.field === 'driveFolderId') return 'missingDrive';
  if (gap.field === 'billingHistory') return 'missingBilling';
  if (gap.field === 'wageOrderNumber') return 'complianceLater';
  return 'missingSetup';
}

export function buildReviewCenterItems(input: {
  projects: Project[];
  lifecycleFor: (p: Project) => ProjectLifecycleSnapshot;
  importExceptions: ImportException[];
}): ReviewCenterItem[] {
  const items: ReviewCenterItem[] = [];

  for (const project of input.projects) {
    const lifecycle = input.lifecycleFor(project);
    if (!lifecycle.includeInDefaultScope || lifecycle.includeInArchive) continue;

    for (const gap of lifecycle.seedGaps) {
      if (gap.field === 'contractPending') {
        items.push({
          id: `gap-${project.id}-contract-pending`,
          filter: 'missingContract',
          jobNumber: project.projectNumber,
          projectName: project.projectName,
          projectId: project.id,
          title: gap.label,
          detail: 'Contract pending — not a blocker.',
          severity: 'info',
          route: `/projects/${project.id}`,
        });
        continue;
      }
      if (!isSetupBlockingGap(gap) && gap.field !== 'billingHistory') continue;

      const filter = gapFilter(gap);
      if (gap.field === 'billingHistory' && project.billingNotStarted) continue;

      items.push({
        id: `gap-${project.id}-${gap.field}`,
        filter,
        jobNumber: project.projectNumber,
        projectName: project.projectName,
        projectId: project.id,
        title: gap.label,
        detail: gap.blocksWorkflow
          ? `${gap.label} is required before this job can run cleanly.`
          : `${gap.label} — review when convenient.`,
        severity: gap.blocksWorkflow ? 'error' : 'warning',
        route: `/projects/${project.id}`,
      });
    }

    if (project.prevailingWage && !project.wageOrderNumber?.trim()) {
      items.push({
        id: `compliance-${project.id}-wage-order`,
        filter: 'complianceLater',
        jobNumber: project.projectNumber,
        projectName: project.projectName,
        projectId: project.id,
        title: 'Wage order number',
        detail: 'Future compliance item — does not block setup.',
        severity: 'info',
        route: `/projects/${project.id}`,
      });
    }
  }

  for (const ex of input.importExceptions) {
    if (ex.status !== 'NeedsReview' && ex.status !== 'Imported') continue;
    const isBilling = ex.type.includes('billing') || ex.type.includes('sov') || ex.type.includes('contract');
    const isConflict = ex.type.includes('conflict') || ex.type.includes('duplicate') || ex.type.includes('mismatch');
    items.push({
      id: `import-${ex.id}`,
      filter: isConflict ? 'dataConflict' : (isBilling ? 'billingReview' : 'syncErrors'),
      jobNumber: ex.jobNumber,
      projectName: ex.projectName,
      projectId: undefined,
      title: ex.type.replace(/([A-Z])/g, ' $1').trim(),
      detail: ex.message,
      severity: 'warning' as const,
      route: '/settings',
      queryParams: { section: 'financials', view: 'billing' },
    });
  }

  return items;
}

export function filterReviewCenterItems(
  items: ReviewCenterItem[],
  filter: ReviewCenterFilterId,
): ReviewCenterItem[] {
  if (filter === 'all') return items;
  return items.filter(i => i.filter === filter);
}

export function countReviewCenterByFilter(items: ReviewCenterItem[]): Partial<Record<ReviewCenterFilterId, number>> {
  const counts: Partial<Record<ReviewCenterFilterId, number>> = { all: items.length };
  for (const item of items) {
    counts[item.filter] = (counts[item.filter] ?? 0) + 1;
  }
  return counts;
}

export function projectSetupComplete(lifecycle: ProjectLifecycleSnapshot): boolean {
  return setupBlockingGaps(lifecycle.seedGaps).length === 0
    && lifecycle.seedCompletenessStatus === 'Complete';
}
