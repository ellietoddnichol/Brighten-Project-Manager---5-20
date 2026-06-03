import { ImportException } from '@app/models/import.types';
import {
  CATEGORY_LABELS,
  DocumentFileCategory,
  DocumentListItem,
  DocumentSourceType,
} from '@app/models/project-documents.types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import { Project, ProjectFile, ProjectFolder, RequiredDocument } from '@app/models/types';
import {
  filterDocumentList,
  missingRequiredDocuments,
  normalizeFileCategory,
  normalizeSourceType,
  projectFileToListItem,
} from '@features/projects/utils/project-documents.compute';
import { FileView } from '@app/components/project/project-detail.types';
import {
  ProjectRequirementsContext,
  buildFolderRequirementRows,
  summarizeDriveMapping,
} from '@features/projects/utils/project-requirements.compute';

export type DocumentsSegmentId =
  | 'overview'
  | 'all'
  | 'required'
  | 'generated'
  | 'uploads'
  | 'driveLinks'
  | 'needsReview';

export type DocumentsOverviewSection =
  | 'missingRequired'
  | 'driveSetup'
  | 'recentGenerated'
  | 'recentUploads'
  | 'sourceIssues';

export interface DocumentsHubProjectContext {
  project: Project;
  lifecycle: ProjectLifecycleSnapshot;
  reqCtx: ProjectRequirementsContext;
  requiredDocs: RequiredDocument[];
}

export interface DocumentsHubSummary {
  projectFiles: number;
  missingRequired: number;
  generatedDocs: number;
  driveIssues: number;
}

export interface DocumentsHubCategoryCounts {
  contracts: number;
  changeOrders: number;
  billing: number;
  insurance: number;
  lienWaivers: number;
  closeout: number;
  recentlyAdded: number;
}

export interface DocumentsOverviewRow {
  id: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  documentLabel: string;
  issueOrStatus: string;
  locationLabel: string;
  dateLabel: string;
  nextAction: string;
  route: string;
  section: DocumentsOverviewSection;
  severity: 'error' | 'warning';
}

export interface DocumentsHubFileRow {
  id: string;
  fileName: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  categoryLabel: string;
  sourceType: string;
  locationLabel: string;
  linkedRecord?: string;
  dateLabel: string;
  documentStatus: string;
  fileUrl?: string;
  item: DocumentListItem;
}

export interface DocumentsDriveLinkRow {
  id: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  rootLinked: boolean;
  mappedFolders: number;
  missingRequired: number;
  needsReview: number;
  statusLabel: string;
  nextAction: string;
}

export interface DocumentsNeedsReviewRow {
  id: string;
  jobNumber: string;
  projectName: string;
  projectId: string;
  issueType: string;
  detail: string;
  nextAction: string;
  route: string;
  severity: 'error' | 'warning';
}

export const DOCUMENTS_SEGMENT_OPTIONS: { id: DocumentsSegmentId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'all', label: 'All Files' },
  { id: 'required', label: 'Required' },
  { id: 'generated', label: 'Generated' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'driveLinks', label: 'Drive Links' },
  { id: 'needsReview', label: 'Needs Review' },
];

const SEGMENT_TO_FILE_VIEW: Partial<Record<DocumentsSegmentId, FileView>> = {
  all: 'all',
  required: 'required',
  generated: 'generated',
  uploads: 'uploads',
};

export function normalizeDocumentsSegment(value: string | null | undefined): DocumentsSegmentId {
  if (!value) return 'overview';
  const allowed = new Set(DOCUMENTS_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as DocumentsSegmentId) ? (value as DocumentsSegmentId) : 'overview';
}

export function isActiveDocumentsProject(lifecycle: ProjectLifecycleSnapshot): boolean {
  return lifecycle.includeInDefaultScope && !lifecycle.includeInArchive && !lifecycle.includeInClosed2026;
}

export function projectFileTimestamp(file: ProjectFile): number {
  const ts = file.uploadedAt ?? file.lastModifiedAt;
  if (!ts) return 0;
  try {
    return typeof ts.toDate === 'function' ? ts.toDate().getTime() : new Date(ts).getTime();
  } catch {
    return 0;
  }
}

function formatFileDate(file: ProjectFile): string {
  const ts = projectFileTimestamp(file);
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

function projectRoute(projectId: string, view?: string): string {
  return view ? `/projects/${projectId}?section=documents&view=${view}` : `/projects/${projectId}?section=documents`;
}

function sourceTypeLabel(source?: DocumentSourceType | string): string {
  switch (source) {
    case 'Generated': return 'Generated';
    case 'Uploaded': return 'Uploaded';
    case 'DriveLinked': return 'Drive';
    case 'Imported': return 'Imported';
    default: return source ?? 'System';
  }
}

function categoryCount(files: ProjectFile[], category: DocumentFileCategory): number {
  return files.filter(f => normalizeFileCategory(f) === category).length;
}

export function summarizeDocumentsHub(input: {
  files: ProjectFile[];
  contexts: DocumentsHubProjectContext[];
}): DocumentsHubSummary {
  const activeIds = new Set(
    input.contexts.filter(c => isActiveDocumentsProject(c.lifecycle)).map(c => c.project.id),
  );
  const activeFiles = input.files.filter(f => activeIds.has(f.projectId));

  let missingRequired = 0;
  let driveIssues = 0;

  for (const ctx of input.contexts) {
    if (!isActiveDocumentsProject(ctx.lifecycle)) continue;
    const scoped = input.files.filter(f => f.projectId === ctx.project.id);
    missingRequired += missingRequiredDocuments(ctx.reqCtx, scoped, ctx.requiredDocs).length;
    if (!ctx.project.driveFolderId) {
      driveIssues++;
      continue;
    }
    const mapping = summarizeDriveMapping(ctx.reqCtx);
    if (mapping.missingRequired > 0 || mapping.needsProfile) driveIssues++;
  }

  return {
    projectFiles: input.files.length,
    missingRequired,
    generatedDocs: activeFiles.filter(f => normalizeSourceType(f) === 'Generated').length,
    driveIssues,
  };
}

export function summarizeDocumentsCategoryCounts(files: ProjectFile[]): DocumentsHubCategoryCounts {
  const weekAgo = Date.now() - 7 * 86400000;
  return {
    contracts: categoryCount(files, 'Contract'),
    changeOrders: categoryCount(files, 'ChangeOrder'),
    billing: categoryCount(files, 'Billing'),
    insurance: categoryCount(files, 'Insurance'),
    lienWaivers: categoryCount(files, 'LienWaiver'),
    closeout: categoryCount(files, 'Closeout'),
    recentlyAdded: files.filter(f => projectFileTimestamp(f) >= weekAgo).length,
  };
}

export function buildDocumentsOverviewRows(input: {
  files: ProjectFile[];
  contexts: DocumentsHubProjectContext[];
  importExceptions: ImportException[];
}): DocumentsOverviewRow[] {
  const rows: DocumentsOverviewRow[] = [];
  const now = Date.now();
  const recentCutoff = now - 14 * 86400000;

  for (const ctx of input.contexts) {
    if (!isActiveDocumentsProject(ctx.lifecycle)) continue;
    const project = ctx.project;
    const jobNumber = project.projectNumber ? `#${project.projectNumber}` : '—';
    const scoped = input.files.filter(f => f.projectId === project.id);

    for (const missing of missingRequiredDocuments(ctx.reqCtx, scoped, ctx.requiredDocs)) {
      rows.push({
        id: `miss-${project.id}-${missing.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        documentLabel: missing.label,
        issueOrStatus: 'Missing required',
        locationLabel: 'Required folder',
        dateLabel: '—',
        nextAction: missing.actionLabel,
        route: projectRoute(project.id, 'required'),
        section: 'missingRequired',
        severity: 'error',
      });
    }

    if (!project.driveFolderId) {
      rows.push({
        id: `drive-${project.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        documentLabel: 'Drive folder',
        issueOrStatus: 'Not linked',
        locationLabel: 'Project root',
        dateLabel: '—',
        nextAction: 'Link Drive folder',
        route: projectRoute(project.id, 'drive-mapping'),
        section: 'driveSetup',
        severity: 'warning',
      });
    } else {
      const mapping = summarizeDriveMapping(ctx.reqCtx);
      if (mapping.missingRequired > 0) {
        rows.push({
          id: `map-${project.id}`,
          jobNumber,
          projectName: project.projectName,
          projectId: project.id,
          documentLabel: 'Drive mapping',
          issueOrStatus: `${mapping.missingRequired} required folder(s) missing`,
          locationLabel: 'Drive mapping',
          dateLabel: '—',
          nextAction: 'Open Drive Mapping',
          route: projectRoute(project.id, 'drive-mapping'),
          section: 'driveSetup',
          severity: 'warning',
        });
      }
    }
  }

  const generatedRecent = input.files
    .filter(f => normalizeSourceType(f) === 'Generated' && projectFileTimestamp(f) >= recentCutoff)
    .sort((a, b) => projectFileTimestamp(b) - projectFileTimestamp(a))
    .slice(0, 8);

  for (const file of generatedRecent) {
    const project = input.contexts.find(c => c.project.id === file.projectId)?.project;
    if (!project) continue;
    const item = projectFileToListItem(file);
    rows.push({
      id: `gen-${file.id}`,
      jobNumber: project.projectNumber ? `#${project.projectNumber}` : '—',
      projectName: project.projectName,
      projectId: project.id,
      documentLabel: item.fileName,
      issueOrStatus: CATEGORY_LABELS[item.fileCategory],
      locationLabel: item.locationLabel ?? '—',
      dateLabel: formatFileDate(file),
      nextAction: 'Open file',
      route: projectRoute(project.id, 'generated'),
      section: 'recentGenerated',
      severity: 'warning',
    });
  }

  const uploadRecent = input.files
    .filter(f => {
      const src = normalizeSourceType(f);
      return (src === 'Uploaded' || src === 'DriveLinked') && projectFileTimestamp(f) >= recentCutoff;
    })
    .sort((a, b) => projectFileTimestamp(b) - projectFileTimestamp(a))
    .slice(0, 8);

  for (const file of uploadRecent) {
    const project = input.contexts.find(c => c.project.id === file.projectId)?.project;
    if (!project) continue;
    const item = projectFileToListItem(file);
    rows.push({
      id: `up-${file.id}`,
      jobNumber: project.projectNumber ? `#${project.projectNumber}` : '—',
      projectName: project.projectName,
      projectId: project.id,
      documentLabel: item.fileName,
      issueOrStatus: sourceTypeLabel(item.sourceType),
      locationLabel: item.locationLabel ?? '—',
      dateLabel: formatFileDate(file),
      nextAction: 'Open file',
      route: projectRoute(project.id, 'uploads'),
      section: 'recentUploads',
      severity: 'warning',
    });
  }

  for (const ex of input.importExceptions.filter(e => e.status === 'NeedsReview')) {
    if (!ex.type.includes('Drive') && ex.type !== 'duplicateDriveFolder' && ex.type !== 'budgetParseFailed') continue;
    const project = input.contexts.find(c => c.project.projectNumber === ex.jobNumber)?.project;
    rows.push({
      id: `ex-${ex.id}`,
      jobNumber: ex.jobNumber ? `#${ex.jobNumber}` : '—',
      projectName: ex.projectName ?? ex.message.slice(0, 40),
      projectId: project?.id ?? '',
      documentLabel: 'Source issue',
      issueOrStatus: ex.type === 'duplicateDriveFolder' ? 'Duplicate folder mapping' : 'File / Drive issue',
      locationLabel: ex.source.includes('Drive') ? 'Drive' : 'Import',
      dateLabel: '—',
      nextAction: 'Source Review',
      route: '/settings',
      section: 'sourceIssues',
      severity: 'warning',
    });
  }

  const order: DocumentsOverviewSection[] = [
    'missingRequired', 'driveSetup', 'recentGenerated', 'recentUploads', 'sourceIssues',
  ];
  return rows
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section))
    .slice(0, 40);
}

export function buildDocumentsHubFileRows(input: {
  files: ProjectFile[];
  contexts: DocumentsHubProjectContext[];
  segment: DocumentsSegmentId;
  search: string;
}): DocumentsHubFileRow[] {
  const fileView = SEGMENT_TO_FILE_VIEW[input.segment];
  if (!fileView) return [];

  const rows: DocumentsHubFileRow[] = [];
  const activeContexts = input.contexts.filter(c =>
    input.segment === 'required' ? isActiveDocumentsProject(c.lifecycle) : true,
  );

  for (const ctx of activeContexts) {
    const scoped = input.files.filter(f => f.projectId === ctx.project.id);
    const items = filterDocumentList(scoped, fileView, ctx.reqCtx, ctx.requiredDocs, input.search);
    for (const item of items) {
      rows.push({
        id: item.id,
        fileName: item.fileName,
        jobNumber: ctx.project.projectNumber ? `#${ctx.project.projectNumber}` : '—',
        projectName: ctx.project.projectName,
        projectId: ctx.project.id,
        categoryLabel: CATEGORY_LABELS[item.fileCategory],
        sourceType: item.kind === 'missing' ? 'Required' : sourceTypeLabel(item.sourceType),
        locationLabel: item.locationLabel ?? '—',
        linkedRecord: item.linkedRecord,
        dateLabel: item.dateLabel ?? '—',
        documentStatus: item.kind === 'missing' ? 'Missing' : (item.file?.documentStatus ?? '—'),
        fileUrl: item.fileUrl,
        item,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.item.kind !== b.item.kind) return a.item.kind === 'missing' ? -1 : 1;
    return b.dateLabel.localeCompare(a.dateLabel) || a.fileName.localeCompare(b.fileName);
  });
}

export function buildDocumentsDriveLinkRows(contexts: DocumentsHubProjectContext[]): DocumentsDriveLinkRow[] {
  return contexts
    .filter(c => isActiveDocumentsProject(c.lifecycle))
    .map(ctx => {
      const mapping = summarizeDriveMapping(ctx.reqCtx);
      const rows = buildFolderRequirementRows(ctx.reqCtx);
      const needsReview = rows.filter(r => r.needStatus === 'missing_required').length
        + ctx.reqCtx.folders.filter(f => f.needsReview || f.linkStatus === 'Needs Review').length;
      const rootLinked = !!ctx.project.driveFolderId;
      let statusLabel = 'Linked';
      if (!rootLinked) statusLabel = 'Root not linked';
      else if (mapping.missingRequired) statusLabel = `${mapping.missingRequired} required missing`;
      else if (needsReview) statusLabel = 'Needs review';
      else if (mapping.found) statusLabel = `${mapping.found} folders mapped`;

      return {
        id: ctx.project.id,
        jobNumber: ctx.project.projectNumber ? `#${ctx.project.projectNumber}` : '—',
        projectName: ctx.project.projectName,
        projectId: ctx.project.id,
        rootLinked,
        mappedFolders: mapping.found,
        missingRequired: mapping.missingRequired,
        needsReview,
        statusLabel,
        nextAction: rootLinked ? 'Open Drive Mapping' : 'Link project folder',
      };
    })
    .sort((a, b) => {
      if (a.rootLinked !== b.rootLinked) return a.rootLinked ? 1 : -1;
      return b.missingRequired - a.missingRequired || a.projectName.localeCompare(b.projectName);
    });
}

export function buildDocumentsNeedsReviewRows(input: {
  files: ProjectFile[];
  contexts: DocumentsHubProjectContext[];
  folders: ProjectFolder[];
  importExceptions: ImportException[];
}): DocumentsNeedsReviewRow[] {
  const rows: DocumentsNeedsReviewRow[] = [];

  for (const ctx of input.contexts) {
    if (!isActiveDocumentsProject(ctx.lifecycle)) continue;
    const project = ctx.project;
    const jobNumber = project.projectNumber ? `#${project.projectNumber}` : '—';

    if (!project.driveFolderId) {
      rows.push({
        id: `no-drive-${project.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        issueType: 'Missing Drive folder',
        detail: 'Active job without a linked project root folder',
        nextAction: 'Link folder',
        route: projectRoute(project.id, 'drive-mapping'),
        severity: 'warning',
      });
    }

    for (const folder of input.folders.filter(f => f.projectId === project.id)) {
      if (folder.needsReview || folder.linkStatus === 'Needs Review') {
        rows.push({
          id: `folder-review-${folder.id}`,
          jobNumber,
          projectName: project.projectName,
          projectId: project.id,
          issueType: 'Duplicate folder mapping',
          detail: `${folder.folderName} — review recommended match`,
          nextAction: 'Open Drive Mapping',
          route: projectRoute(project.id, 'drive-mapping'),
          severity: 'warning',
        });
      }
    }
  }

  for (const file of input.files) {
    const project = input.contexts.find(c => c.project.id === file.projectId)?.project;
    if (!project) {
      rows.push({
        id: `no-proj-${file.id}`,
        jobNumber: '—',
        projectName: 'Unknown project',
        projectId: '',
        issueType: 'File without project',
        detail: file.fileName,
        nextAction: 'Review file',
        route: '/documents',
        severity: 'error',
      });
      continue;
    }

    const jobNumber = project.projectNumber ? `#${project.projectNumber}` : '—';
    const category = normalizeFileCategory(file);
    const source = normalizeSourceType(file);

    if (category === 'Other' && !file.folderKey) {
      rows.push({
        id: `nocat-${file.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        issueType: 'File without category',
        detail: file.fileName,
        nextAction: 'Classify file',
        route: projectRoute(project.id),
        severity: 'warning',
      });
    }

    if (file.saveWarning) {
      rows.push({
        id: `save-${file.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        issueType: 'Generated doc not in expected folder',
        detail: file.saveWarning,
        nextAction: 'Review save location',
        route: projectRoute(project.id, 'generated'),
        severity: 'warning',
      });
    }

    if (source === 'Uploaded' && !file.changeOrderId && !file.billingId && !file.rfiId
      && !file.submittalId && !file.projectSubcontractorId && !file.relatedRecordId
      && category !== 'Photo' && category !== 'Backup') {
      rows.push({
        id: `unlink-${file.id}`,
        jobNumber,
        projectName: project.projectName,
        projectId: project.id,
        issueType: 'Uploaded doc not linked to record',
        detail: file.fileName,
        nextAction: 'Link record',
        route: projectRoute(project.id, 'uploads'),
        severity: 'warning',
      });
    }
  }

  for (const ctx of input.contexts) {
    if (!isActiveDocumentsProject(ctx.lifecycle)) continue;
    const scoped = input.files.filter(f => f.projectId === ctx.project.id);
    for (const missing of missingRequiredDocuments(ctx.reqCtx, scoped, ctx.requiredDocs)) {
      rows.push({
        id: `req-${ctx.project.id}-${missing.id}`,
        jobNumber: ctx.project.projectNumber ? `#${ctx.project.projectNumber}` : '—',
        projectName: ctx.project.projectName,
        projectId: ctx.project.id,
        issueType: 'Missing required file',
        detail: missing.label,
        nextAction: missing.actionLabel,
        route: projectRoute(ctx.project.id, 'required'),
        severity: 'error',
      });
    }
  }

  for (const ex of input.importExceptions.filter(e => e.status === 'NeedsReview')) {
    if (ex.type !== 'duplicateDriveFolder' && !ex.type.includes('Drive')) continue;
    const project = input.contexts.find(c => c.project.projectNumber === ex.jobNumber)?.project;
    rows.push({
      id: `impex-${ex.id}`,
      jobNumber: ex.jobNumber ? `#${ex.jobNumber}` : '—',
      projectName: ex.projectName ?? 'Drive import',
      projectId: project?.id ?? '',
      issueType: ex.type === 'duplicateDriveFolder' ? 'Duplicate folder mapping' : 'Drive source issue',
      detail: ex.message,
      nextAction: 'Source Review',
      route: '/settings',
      severity: 'warning',
    });
  }

  return rows;
}

export function documentsOverviewSectionLabel(section: DocumentsOverviewSection): string {
  switch (section) {
    case 'missingRequired': return 'Missing required documents';
    case 'driveSetup': return 'Drive folders needing setup';
    case 'recentGenerated': return 'Recent generated docs';
    case 'recentUploads': return 'Recent uploads';
    case 'sourceIssues': return 'File / source issues';
    default: return section;
  }
}

export function documentsHubCsvRows(
  segment: DocumentsSegmentId,
  overview: DocumentsOverviewRow[],
  files: DocumentsHubFileRow[],
  driveLinks: DocumentsDriveLinkRow[],
  needsReview: DocumentsNeedsReviewRow[],
): string[][] {
  switch (segment) {
    case 'driveLinks':
      return driveLinks.map(r => [
        r.jobNumber,
        r.projectName,
        r.rootLinked ? 'Yes' : 'No',
        String(r.mappedFolders),
        String(r.missingRequired),
        String(r.needsReview),
        r.statusLabel,
        r.nextAction,
      ]);
    case 'needsReview':
      return needsReview.map(r => [r.jobNumber, r.projectName, r.issueType, r.detail, r.nextAction]);
    case 'all':
    case 'required':
    case 'generated':
    case 'uploads':
      return files.map(r => [
        r.fileName,
        r.jobNumber,
        r.projectName,
        r.categoryLabel,
        r.sourceType,
        r.locationLabel,
        r.linkedRecord ?? '',
        r.dateLabel,
        r.documentStatus,
      ]);
    default:
      return overview.map(r => [
        r.jobNumber,
        r.projectName,
        r.documentLabel,
        r.issueOrStatus,
        r.locationLabel,
        r.dateLabel,
        r.nextAction,
      ]);
  }
}
