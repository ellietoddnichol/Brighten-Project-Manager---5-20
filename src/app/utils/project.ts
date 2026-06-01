import { Project, ProjectStatus } from '../models/types';
import {
  extractLeadingJobNumber,
  findProjectMatches,
  pickCanonicalProject,
} from './project-dedupe';

export function projectStatusClass(status: ProjectStatus | undefined): string {
  switch (status) {
    case 'Lead / Precon':
    case 'Setup Needed':
      return 'bg-slate-100 text-slate-700';
    case 'Active':
      return 'bg-orange-100 text-orange-800';
    case 'Awarded':
      return 'bg-emerald-100 text-emerald-800';
    case 'Closeout':
      return 'bg-amber-100 text-amber-800';
    case 'Closed':
      return 'bg-slate-200 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function formatProjectDate(value?: string): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function projectSearchText(p: Project): string {
  return [
    p.projectNumber,
    p.projectName,
    p.customer,
    p.address,
    p.county,
    p.projectManager,
    p.supplier,
    p.wipStatus,
    p.status,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function isFullyBilled(project: Project): boolean {
  const contract = project.originalContractAmount ?? 0;
  const billed = project.billedToDate ?? 0;
  return contract > 0 && billed >= contract;
}

export function isClosedProject(project: Project): boolean {
  if (project.status === 'Closed') return true;
  const wip = project.wipStatus?.trim();
  if (wip === 'Closed' || wip === 'Complete') return true;
  return false;
}

/** Non-job codes used for time and PO tracking only (no site address, contract, or pipeline). */
export const OVERHEAD_JOB_CODES = ['PTO', 'OFFICE', 'SHOP'] as const;

export function isOverheadJobLabel(label: string | undefined | null): boolean {
  if (!label?.trim()) return false;
  const normalized = label.trim().toUpperCase();
  if ((OVERHEAD_JOB_CODES as readonly string[]).includes(normalized)) return true;
  const firstToken = normalized.split(/\s*[-–—]/)[0]?.trim();
  return firstToken ? (OVERHEAD_JOB_CODES as readonly string[]).includes(firstToken) : false;
}

export function isOverheadJob(
  project: Pick<Project, 'projectNumber' | 'projectName' | 'seedProjectId'>,
): boolean {
  return (
    isOverheadJobLabel(project.projectNumber) ||
    isOverheadJobLabel(project.projectName) ||
    isOverheadJobLabel(project.seedProjectId)
  );
}

export type PipelineStage = 'precon' | 'in-progress' | 'waiting' | 'ready-to-bill';

const PIPELINE_LABELS: Record<PipelineStage, string> = {
  precon: 'New / Pre-Con',
  'in-progress': 'In Progress',
  waiting: 'Waiting',
  'ready-to-bill': 'Ready to Bill',
};

export function getPipelineStage(project: Project): PipelineStage | null {
  if (isOverheadJob(project) || isClosedProject(project)) return null;

  const wip = project.wipStatus?.trim();
  if (wip) {
    switch (wip) {
      case 'Pre Con':
        return 'precon';
      case 'In Progress':
      case 'T&M':
        return 'in-progress';
      case 'Needs Review':
        return 'waiting';
      case 'Complete':
        return 'ready-to-bill';
      case 'Closed':
        return null;
    }
  }

  switch (project.status) {
    case 'Lead / Precon':
      return 'precon';
    case 'Active':
      return 'in-progress';
    case 'Setup Needed':
    case 'Awarded':
      return 'waiting';
    case 'Closeout':
      return 'ready-to-bill';
    default:
      return null;
  }
}

export function getPipelineLabel(stage: PipelineStage): string {
  return PIPELINE_LABELS[stage];
}

export function projectsInPipelineStage(projects: Project[], stage: PipelineStage): Project[] {
  return projects
    .filter(p => getPipelineStage(p) === stage)
    .sort((a, b) => a.projectName.localeCompare(b.projectName));
}

export interface ProjectReference {
  projectId?: string;
  payAppNumber?: string;
  projectNo?: string;
}

/** Match a billing/CO row to a Firestore project by UUID, seed id (J218), or job # in the invoice label. */
export function resolveProjectByReference(
  projects: Project[],
  ref: ProjectReference,
): Project | undefined {
  if (!projects.length) return undefined;

  if (ref.projectId) {
    const byId = projects.find(p => p.id === ref.projectId);
    if (byId) return byId;

    const bySeed = projects.find(p =>
      p.seedProjectId === ref.projectId
      || p.seedProjectId?.toUpperCase() === ref.projectId?.toUpperCase(),
    );
    if (bySeed) return bySeed;

    const fromId = extractLeadingJobNumber(ref.projectId);
    if (fromId) {
      const matches = findProjectMatches(projects, {
        projectNumber: fromId,
        seedProjectId: ref.projectId,
      });
      if (matches.length) return pickCanonicalProject(matches);
    }
  }

  if (ref.projectNo) {
    const matches = findProjectMatches(projects, { projectNumber: ref.projectNo });
    if (matches.length) return pickCanonicalProject(matches);
  }

  const fromLabel = extractLeadingJobNumber(ref.payAppNumber);
  if (fromLabel) {
    const matches = findProjectMatches(projects, { projectNumber: fromLabel });
    if (matches.length) return pickCanonicalProject(matches);
  }

  return undefined;
}

export function formatProjectDisplayName(project: Project): string {
  const num = project.projectNumber?.trim();
  const name = project.projectName?.trim();
  if (num && name && !name.startsWith(num)) return `#${num} ${name}`;
  if (num) return `#${num}${name ? ` ${name}` : ''}`;
  return name || 'Unknown';
}

/** Label when the project record is missing but the invoice/pay-app string has a job number. */
export function fallbackProjectLabel(ref: ProjectReference): string {
  const num =
    extractLeadingJobNumber(ref.payAppNumber)
    || extractLeadingJobNumber(ref.projectId)
    || extractLeadingJobNumber(ref.projectNo);
  if (num) return `#${num}`;
  if (ref.projectId && !ref.projectId.includes('-')) return ref.projectId;
  return 'Unknown';
}

export function resolveProjectLabel(projects: Project[], ref: ProjectReference): string {
  const project = resolveProjectByReference(projects, ref);
  return project ? formatProjectDisplayName(project) : fallbackProjectLabel(ref);
}

export function pipelineStageQueryParam(stage: PipelineStage): { wip: string } {
  switch (stage) {
    case 'precon':
      return { wip: 'Pre Con' };
    case 'in-progress':
      return { wip: 'In Progress' };
    case 'waiting':
      return { wip: 'Needs Review' };
    case 'ready-to-bill':
      return { wip: 'Complete' };
  }
}
