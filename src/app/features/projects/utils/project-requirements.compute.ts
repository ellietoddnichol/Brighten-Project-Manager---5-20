import { ARRecord } from '@app/models/financial.types';
import { ProjectLaborActual } from '@app/models/labor-actual.types';
import { ChangeRequest, DailyLog, Submittal } from '@app/models/project-controls.types';
import {
  Billing,
  ChangeOrder,
  PO,
  Project,
  ProjectFolder,
  ProjectFile,
} from '@app/models/types';
import { ProjectSubcontractor, SubcontractorInvoice } from '@app/models/subcontractor.types';
import {
  ProjectProfile,
  PROJECT_PROFILE_LABELS,
  FolderRequirementLevel,
  FolderNeedStatus,
} from '@app/models/project-requirements.types';
import { isCertifiedPayrollProject } from '@features/labor/utils/certified-payroll-week';
import { isClosedProject, isOverheadJob } from '@shared/utils/project';

export type {
  ProjectProfile,
  FolderRequirementLevel,
  FolderNeedStatus,
} from '@app/models/project-requirements.types';
export { PROJECT_PROFILE_LABELS } from '@app/models/project-requirements.types';

export interface ProjectRequirementsContext {
  project: Project;
  folders: ProjectFolder[];
  changeOrders: ChangeOrder[];
  changeRequests: ChangeRequest[];
  billings: Billing[];
  arRecords: ARRecord[];
  projectSubcontractors: ProjectSubcontractor[];
  subcontractorInvoices: SubcontractorInvoice[];
  pos: PO[];
  submittals: Submittal[];
  dailyLogs: DailyLog[];
  projectFiles: ProjectFile[];
  laborActuals?: ProjectLaborActual[];
}

const ACTIVE_STATUSES = new Set(['Active', 'Closeout', 'Awarded']);
const CONTRACTED_STATUSES = new Set(['Active', 'Closeout', 'Awarded']);

export function isFolderLinked(folder?: ProjectFolder): boolean {
  return !!(folder?.folderId && folder.linkStatus !== 'Missing');
}

export function countLinkedFolders(folders: ProjectFolder[]): number {
  return folders.filter(f => f.folderKey !== 'PROJECT_ROOT' && isFolderLinked(f)).length;
}

export function needsProfileDecision(ctx: ProjectRequirementsContext): boolean {
  if (isOverheadJob(ctx.project)) return false;
  if (ctx.project.projectProfile) return false;
  if (!ctx.project.driveFolderId) return false;
  const linked = countLinkedFolders(ctx.folders);
  return linked > 0 && linked < 6 && ACTIVE_STATUSES.has(ctx.project.status);
}

function projectId(ctx: ProjectRequirementsContext): string {
  return ctx.project.id;
}

function hasChangeOrders(ctx: ProjectRequirementsContext): boolean {
  return ctx.changeOrders.some(c => c.projectId === projectId(ctx));
}

function hasChangeRequests(ctx: ProjectRequirementsContext): boolean {
  return ctx.changeRequests.some(c => c.projectId === projectId(ctx));
}

function hasBillings(ctx: ProjectRequirementsContext): boolean {
  return ctx.billings.some(b => b.projectId === projectId(ctx));
}

function hasOpenAr(ctx: ProjectRequirementsContext): boolean {
  return ctx.arRecords.some(r => r.projectId === projectId(ctx) && (r.openBalance ?? 0) > 0);
}

function hasSubcontractors(ctx: ProjectRequirementsContext): boolean {
  return ctx.projectSubcontractors.some(p => p.projectId === projectId(ctx));
}

function hasSubInvoicesOrPayments(ctx: ProjectRequirementsContext): boolean {
  return ctx.subcontractorInvoices.some(i =>
    i.projectId === projectId(ctx)
    && i.status !== 'Void'
    && (i.status === 'Approved' || i.status === 'PartiallyPaid' || i.status === 'Paid' || (i.paidAmount ?? 0) > 0),
  );
}

function hasSubPos(ctx: ProjectRequirementsContext): boolean {
  return ctx.pos.some(p =>
    p.projectId === projectId(ctx)
    && (p.category?.toLowerCase().includes('sub') || p.vendor),
  ) && hasSubcontractors(ctx);
}

function hasSubmittals(ctx: ProjectRequirementsContext): boolean {
  return ctx.submittals.some(s => s.projectId === projectId(ctx));
}

function hasDailyLogs(ctx: ProjectRequirementsContext): boolean {
  return ctx.dailyLogs.some(d => d.projectId === projectId(ctx));
}

function hasPoPhotos(ctx: ProjectRequirementsContext): boolean {
  return ctx.projectFiles.some(f =>
    f.projectId === projectId(ctx)
    && (f.folderKey === 'PO_IMAGES' || f.folderKey === 'PHOTOS' || f.documentType?.toLowerCase().includes('receipt')),
  );
}

function hasApprovedLabor(ctx: ProjectRequirementsContext): boolean {
  return (ctx.laborActuals ?? []).some(a =>
    a.projectId === projectId(ctx)
    && a.approvalStatus === 'Approved'
    && a.totalHours > 0,
  );
}

function isNearCloseout(project: Project): boolean {
  return project.status === 'Closeout' || project.status === 'Closed'
    || project.wipStatus === 'Closeout' || project.wipGroupOverride === 'CloseoutAR';
}

function isActiveContracted(project: Project): boolean {
  return CONTRACTED_STATUSES.has(project.status) && !isClosedProject(project);
}

export function effectiveProfile(ctx: ProjectRequirementsContext): ProjectProfile {
  if (ctx.project.projectProfile) return ctx.project.projectProfile;
  const p = ctx.project;

  if (p.status === 'Lead / Precon' || p.status === 'Setup Needed') return 'BidOnly';
  if (isNearCloseout(p) && hasOpenAr(ctx)) return 'CloseoutAR';
  if (isCertifiedPayrollProject(p) || hasApprovedLabor(ctx)) return 'PrevailingWage';
  if (hasSubcontractors(ctx) && !hasSubmittals(ctx)) return 'Subcontracted';
  if ((p.originalContractAmount ?? 0) < 25000 && countLinkedFolders(ctx.folders) < 6) return 'SmallInstall';
  if (p.billingType === 'T&M' || p.contractType?.toLowerCase().includes('time')) return 'TMWorkOrder';
  return 'FullProject';
}

export function folderRequirementLevel(
  folderKey: string,
  ctx: ProjectRequirementsContext,
): FolderRequirementLevel {
  if (folderKey === 'PROJECT_ROOT') {
    return ctx.project.driveFolderId ? 'optional' : 'required';
  }

  const profile = effectiveProfile(ctx);
  const p = ctx.project;

  if (isOverheadJob(p)) return 'not_needed';

  switch (folderKey) {
    case 'CONTRACT':
      if (profile === 'BidOnly') return 'optional';
      if (profile === 'SmallInstall' || profile === 'TMWorkOrder') return 'optional';
      if (isActiveContracted(p) || (p.originalContractAmount ?? 0) > 0) return 'required';
      return 'not_needed';

    case 'CHANGE_REQUESTS':
      if (hasChangeRequests(ctx)) return 'required';
      if (profile === 'FullProject' || profile === 'TMWorkOrder') return 'optional';
      return 'not_needed';

    case 'CHANGE_ORDERS':
      if (hasChangeOrders(ctx)) return 'required';
      if (profile === 'FullProject') return 'optional';
      return 'not_needed';

    case 'BILLING':
      if (hasBillings(ctx) || hasOpenAr(ctx)) return 'required';
      if (profile === 'FullProject' || profile === 'SmallInstall' || profile === 'TMWorkOrder' || profile === 'CloseoutAR') {
        return isActiveContracted(p) ? 'optional' : 'not_needed';
      }
      return 'not_needed';

    case 'CERTIFIED_PAYROLL':
      if (isCertifiedPayrollProject(p) || hasApprovedLabor(ctx)) return 'required';
      return 'not_needed';

    case 'SUBMITTALS':
    case 'APPROVED_SUBMITTALS':
      if (hasSubmittals(ctx)) return 'required';
      if (profile === 'FullProject' && (p.estMaterialCost ?? 0) > 0) return 'optional';
      return 'not_needed';

    case 'SUBS':
      if (hasSubcontractors(ctx) || hasSubPos(ctx)) return 'required';
      if (profile === 'Subcontracted') return 'required';
      return 'not_needed';

    case 'LIEN_WAIVERS':
      if (hasSubInvoicesOrPayments(ctx)) return 'required';
      if (profile === 'Subcontracted' && hasSubcontractors(ctx)) return 'optional';
      return 'not_needed';

    case 'CLOSEOUT':
      if (isNearCloseout(p) && profile !== 'SmallInstall') return 'required';
      if (hasSubInvoicesOrPayments(ctx) && isNearCloseout(p)) return 'required';
      return 'not_needed';

    case 'CORRESPONDENCE':
      if (profile === 'FullProject' && isActiveContracted(p)) return 'optional';
      return 'not_needed';

    case 'PLANS_SPECS':
      if (profile === 'FullProject' && isActiveContracted(p)) return 'optional';
      return 'not_needed';

    case 'DAILY_LOGS':
      if (hasDailyLogs(ctx)) return 'required';
      if (profile === 'TMWorkOrder' && isActiveContracted(p)) return 'optional';
      return 'not_needed';

    case 'PO_IMAGES':
    case 'PHOTOS':
      if (hasPoPhotos(ctx) || ctx.pos.some(po => po.projectId === projectId(ctx))) return 'optional';
      if (profile === 'SmallInstall' || profile === 'TMWorkOrder') return 'optional';
      return 'not_needed';

    case 'FIELD_RESOURCES':
      if (profile === 'FullProject' && isActiveContracted(p)) return 'optional';
      return 'not_needed';

    case 'TAX_EXEMPTION':
      if (p.taxExempt) return 'optional';
      return 'not_needed';

    case 'RFIS':
    case 'BID_PRICING':
    case 'SAFETY':
    case 'INSPECTIONS':
      return 'not_needed';

    default:
      return 'not_needed';
  }
}

export function folderNeedStatus(
  folderKey: string,
  folder: ProjectFolder | undefined,
  ctx: ProjectRequirementsContext,
): FolderNeedStatus {
  const level = folderRequirementLevel(folderKey, ctx);
  if (level === 'not_needed') return 'not_needed';
  if (isFolderLinked(folder)) return 'found';
  return level === 'required' ? 'missing_required' : 'missing_optional';
}

export interface FolderRequirementRow {
  folderKey: string;
  requirementLevel: FolderRequirementLevel;
  needStatus: FolderNeedStatus;
}

export function buildFolderRequirementRows(ctx: ProjectRequirementsContext): FolderRequirementRow[] {
  const folderMap = new Map(ctx.folders.map(f => [f.folderKey, f]));
  const keys = ctx.folders.map(f => f.folderKey);
  const uniqueKeys = [...new Set(keys.length ? keys : [
    'PROJECT_ROOT', 'CONTRACT', 'CHANGE_ORDERS', 'BILLING', 'SUBMITTALS', 'SUBS', 'CLOSEOUT',
  ])];

  return uniqueKeys
    .filter(k => k !== 'PROJECT_ROOT')
    .map(folderKey => ({
      folderKey,
      requirementLevel: folderRequirementLevel(folderKey, ctx),
      needStatus: folderNeedStatus(folderKey, folderMap.get(folderKey), ctx),
    }));
}

export interface DriveMappingSummary {
  found: number;
  missingRequired: number;
  missingOptional: number;
  notNeeded: number;
  needsProfile: boolean;
  profile: ProjectProfile;
  profileLabel: string;
}

export function summarizeDriveMapping(ctx: ProjectRequirementsContext): DriveMappingSummary {
  const rows = buildFolderRequirementRows(ctx);
  return {
    found: rows.filter(r => r.needStatus === 'found').length,
    missingRequired: rows.filter(r => r.needStatus === 'missing_required').length,
    missingOptional: rows.filter(r => r.needStatus === 'missing_optional').length,
    notNeeded: rows.filter(r => r.needStatus === 'not_needed').length,
    needsProfile: needsProfileDecision(ctx),
    profile: effectiveProfile(ctx),
    profileLabel: PROJECT_PROFILE_LABELS[effectiveProfile(ctx)],
  };
}

export interface DriveFolderTaskDescriptor {
  triggerKey: string;
  title: string;
  severity: 'warning' | 'error';
}

export function driveFolderTaskDescriptors(ctx: ProjectRequirementsContext): DriveFolderTaskDescriptor[] {
  if (isOverheadJob(ctx.project) || !ctx.project.driveFolderId) return [];

  const tasks: DriveFolderTaskDescriptor[] = [];

  if (needsProfileDecision(ctx)) {
    tasks.push({
      triggerKey: `drive-profile-${ctx.project.id}`,
      title: 'Choose project profile to determine required Drive folders',
      severity: 'warning',
    });
    return tasks;
  }

  for (const row of buildFolderRequirementRows(ctx)) {
    if (row.needStatus !== 'missing_required') continue;
    tasks.push({
      triggerKey: `drive-folder-${ctx.project.id}-${row.folderKey}`,
      title: `Missing required Drive folder: ${row.folderKey.replace(/_/g, ' ')}`,
      severity: 'warning',
    });
  }

  return tasks;
}

export function folderNeedStatusLabel(status: FolderNeedStatus): string {
  switch (status) {
    case 'found': return 'Found';
    case 'missing_required': return 'Missing — Required';
    case 'missing_optional': return 'Missing — Optional';
    case 'not_needed': return 'Not needed';
  }
}
