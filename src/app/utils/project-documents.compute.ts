import { FileView } from '../components/project/project-detail.types';
import { ProjectEnabledModules } from '../models/project-needs.types';
import {
  CATEGORY_LABELS,
  DocumentFileCategory,
  DocumentListItem,
  DocumentSourceType,
  FOLDER_KEY_LABELS,
  FILE_VIEW_TO_CATEGORY,
} from '../models/project-documents.types';
import { Project, ProjectFile, RequiredDocument } from '../models/types';
import { SeedCompletenessGap } from '../models/project-lifecycle.types';
import {
  ProjectRequirementsContext,
  buildFolderRequirementRows,
  folderRequirementLevel,
} from './project-requirements.compute';
import { setupGapsToMissingRequired } from './setup-gap-items';

const GENERATED_DOC_TYPES = new Set([
  'ChangeOrder', 'PayApp', 'Pay Application', 'CertifiedPayroll', 'RFI', 'Submittal',
  'ForemanBonus', 'WIP', 'AR', 'DailyLogPDF', 'Generated',
]);

const UPLOAD_DOC_TYPES = new Set([
  'Photo', 'Signed', 'Backup', 'W9', 'CertificateOfInsurance', 'LienWaiver', 'FinalLienWaiver',
  'SubcontractorInvoice', 'PaymentBackup', 'Upload', 'Manual',
]);

const FOLDER_TO_CATEGORY: Record<string, DocumentFileCategory> = {
  CONTRACT: 'Contract',
  CHANGE_ORDERS: 'ChangeOrder',
  CHANGE_REQUESTS: 'ChangeOrder',
  BILLING: 'Billing',
  CERTIFIED_PAYROLL: 'CertifiedPayroll',
  SUBMITTALS: 'Submittal',
  APPROVED_SUBMITTALS: 'Submittal',
  SUBS: 'Subcontractor',
  LIEN_WAIVERS: 'LienWaiver',
  CLOSEOUT: 'Closeout',
  RFIS: 'RFI',
  DAILY_LOGS: 'DailyLog',
  PHOTOS: 'Photo',
  PO_IMAGES: 'Photo',
};

const CATEGORY_TO_FOLDER: Partial<Record<DocumentFileCategory, string>> = {
  Contract: 'CONTRACT',
  ChangeOrder: 'CHANGE_ORDERS',
  Billing: 'BILLING',
  CertifiedPayroll: 'CERTIFIED_PAYROLL',
  Submittal: 'SUBMITTALS',
  Subcontractor: 'SUBS',
  LienWaiver: 'LIEN_WAIVERS',
  Closeout: 'CLOSEOUT',
};

export function normalizeFileCategory(file: ProjectFile): DocumentFileCategory {
  if (file.fileCategory) return file.fileCategory as DocumentFileCategory;

  if (file.changeOrderId || file.changeRequestId) return 'ChangeOrder';
  if (file.billingId) return 'Billing';
  if (file.certifiedPayrollWeekId) return 'CertifiedPayroll';
  if (file.submittalId) return 'Submittal';
  if (file.rfiId) return 'RFI';
  if (file.dailyLogId) return 'DailyLog';
  if (file.projectSubcontractorId || file.subcontractorInvoiceId) return 'Subcontractor';

  const docType = (file.documentType ?? '').toLowerCase();
  if (docType.includes('insurance') || docType.includes('coi') || docType.includes('certificate of insurance')) {
    return 'Insurance';
  }

  if (file.folderKey && FOLDER_TO_CATEGORY[file.folderKey]) {
    return FOLDER_TO_CATEGORY[file.folderKey];
  }

  const dt = (file.documentType ?? '').toLowerCase();
  if (dt.includes('contract')) return 'Contract';
  if (dt.includes('change order') || dt === 'co') return 'ChangeOrder';
  if (dt.includes('pay app') || dt.includes('billing') || dt.includes('invoice')) return 'Billing';
  if (dt.includes('certified payroll') || dt.includes('cpr')) return 'CertifiedPayroll';
  if (dt.includes('w-9') || dt === 'w9') return 'Subcontractor';
  if (dt.includes('insurance') || dt.includes('coi') || dt.includes('certificate of insurance')) return 'Insurance';
  if (dt.includes('final lien') || dt.includes('lien waiver')) return 'LienWaiver';
  if (dt.includes('submittal')) return 'Submittal';
  if (dt.includes('closeout')) return 'Closeout';
  if (dt.includes('rfi')) return 'RFI';
  if (dt.includes('daily log')) return 'DailyLog';
  if (dt.includes('photo') || dt.includes('damage') || dt.includes('issue') || file.photoCategory) return 'Photo';
  if (dt.includes('backup')) return 'Backup';
  if (dt.includes('signed')) return 'Upload';

  return 'Other';
}

export function persistableFileMetadata(
  file: Partial<ProjectFile>,
  savedToLabel?: string,
): Pick<ProjectFile, 'fileCategory' | 'sourceType' | 'savedToLabel'> {
  const asFile = file as ProjectFile;
  return {
    fileCategory: normalizeFileCategory(asFile),
    sourceType: normalizeSourceType(asFile),
    savedToLabel: savedToLabel ?? file.savedToLabel ?? file.notes,
  };
}

export function normalizeSourceType(file: ProjectFile): DocumentSourceType {
  if (file.sourceType) return file.sourceType as DocumentSourceType;

  if (
    file.generatedDocumentId
    || file.workflowType
    || file.sourceRecordId
    || file.changeOrderId
    || file.billingId
    || file.rfiId
    || file.submittalId
    || file.certifiedPayrollWeekId
    || GENERATED_DOC_TYPES.has(file.documentType)
    || (file.documentStatus?.toLowerCase() === 'generated')
  ) {
    return 'Generated';
  }

  if (
    file.uploadedBy
    || UPLOAD_DOC_TYPES.has(file.documentType)
    || normalizeFileCategory(file) === 'Photo'
    || normalizeFileCategory(file) === 'Backup'
    || (file.documentType?.toLowerCase().includes('signed'))
  ) {
    return 'Uploaded';
  }

  if (file.fileId || file.driveFolderId) return 'DriveLinked';
  if (file.relatedRecordType === 'Import') return 'Imported';

  return 'System';
}

export function requiredFileCategories(ctx: ProjectRequirementsContext): Set<DocumentFileCategory> {
  const categories = new Set<DocumentFileCategory>();
  const folderKeys = [
    'CONTRACT', 'CHANGE_ORDERS', 'BILLING', 'CERTIFIED_PAYROLL',
    'SUBMITTALS', 'SUBS', 'LIEN_WAIVERS', 'CLOSEOUT',
  ];

  for (const folderKey of folderKeys) {
    const level = folderRequirementLevel(folderKey, ctx);
    if (level === 'required') {
      const cat = FOLDER_TO_CATEGORY[folderKey];
      if (cat) categories.add(cat);
    }
  }

  if (folderRequirementLevel('SUBS', ctx) === 'required') {
    categories.add('Insurance');
  }

  return categories;
}

export interface MissingRequiredDoc {
  id: string;
  label: string;
  fileCategory: DocumentFileCategory;
  actionLabel: string;
}

export function missingRequiredDocuments(
  ctx: ProjectRequirementsContext,
  files: ProjectFile[],
  requiredDocs: RequiredDocument[],
): MissingRequiredDoc[] {
  const missing: MissingRequiredDoc[] = [];
  const pid = ctx.project.id;
  const projectFiles = files.filter(f => f.projectId === pid);
  const categoriesPresent = new Set(projectFiles.map(f => normalizeFileCategory(f)));

  for (const row of buildFolderRequirementRows(ctx)) {
    if (row.needStatus !== 'missing_required') continue;
    const cat = FOLDER_TO_CATEGORY[row.folderKey];
    if (!cat || categoriesPresent.has(cat)) continue;
    const label = `${CATEGORY_LABELS[cat]} document missing`;
    if (missing.some(m => m.fileCategory === cat)) continue;
    missing.push({
      id: `folder-${row.folderKey}`,
      label,
      fileCategory: cat,
      actionLabel: cat === 'Contract' ? 'Upload contract' : 'Link folder / upload',
    });
  }

  for (const req of requiredDocs.filter(r => r.projectId === pid && r.required)) {
    if (req.status === 'Received' || req.status === 'Approved' || req.status === 'Submitted') continue;
    if (req.relatedFileId) continue;
    const dt = req.documentType.toLowerCase();
    let cat: DocumentFileCategory = 'Other';
    if (dt.includes('contract')) cat = 'Contract';
    else if (dt.includes('payroll') || dt.includes('cpr')) cat = 'CertifiedPayroll';
    else if (dt.includes('coi') || dt.includes('insurance')) cat = 'Insurance';
    else if (dt.includes('w-9') || dt.includes('w9')) cat = 'Subcontractor';
    else if (dt.includes('lien')) cat = 'LienWaiver';
    else if (dt.includes('billing') || dt.includes('pay app')) cat = 'Billing';

    missing.push({
      id: `req-${req.id}`,
      label: req.documentType.includes('missing') ? req.documentType : `${req.documentType} missing`,
      fileCategory: cat,
      actionLabel: 'Upload document',
    });
  }

  return missing;
}

function linkedRecordLabel(file: ProjectFile): string | undefined {
  if (file.changeOrderId) return `Change Order`;
  if (file.changeRequestId) return `Change Request`;
  if (file.billingId) return `Pay App`;
  if (file.rfiId) return `RFI`;
  if (file.submittalId) return `Submittal`;
  if (file.dailyLogId) return `Daily Log`;
  if (file.certifiedPayrollWeekId) return `CPR Week`;
  if (file.projectSubcontractorId) return `Subcontractor`;
  if (file.subcontractorInvoiceId) return `Sub Invoice`;
  if (file.poId) return `PO`;
  if (file.relatedRecordType && file.relatedRecordId) {
    return `${file.relatedRecordType}`;
  }
  return undefined;
}

function locationLabel(file: ProjectFile): string {
  if (file.drivePath) return file.drivePath;
  if (file.folderKey) return FOLDER_KEY_LABELS[file.folderKey] ?? file.folderKey.replace(/_/g, ' ');
  return 'Project files';
}

function formatFileDate(file: ProjectFile): string | undefined {
  const ts = file.uploadedAt ?? file.lastModifiedAt;
  if (!ts) return undefined;
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
  } catch {
    return undefined;
  }
}

export function projectFileToListItem(file: ProjectFile): DocumentListItem {
  const fileCategory = normalizeFileCategory(file);
  const sourceType = normalizeSourceType(file);
  return {
    id: file.id,
    kind: 'file',
    fileName: file.fileName || 'Unnamed file',
    fileCategory,
    sourceType,
    locationLabel: locationLabel(file),
    dateLabel: formatFileDate(file),
    linkedRecord: linkedRecordLabel(file),
    fileUrl: file.fileUrl,
    file,
  };
}

export function matchesFileView(
  item: DocumentListItem,
  view: FileView,
  requiredCategories: Set<DocumentFileCategory>,
): boolean {
  if (view === 'all') return item.kind === 'file';
  if (view === 'drive-mapping') return false;

  if (view === 'required') {
    if (item.kind === 'missing') return true;
    return requiredCategories.has(item.fileCategory);
  }

  if (view === 'generated') {
    return item.kind === 'file' && (
      item.sourceType === 'Generated'
      || item.fileCategory === 'Generated'
      || !!item.file?.generatedDocumentId
    );
  }

  if (view === 'uploads') {
    return item.kind === 'file' && (
      item.sourceType === 'Uploaded'
      || item.fileCategory === 'Photo'
      || item.fileCategory === 'Backup'
      || item.fileCategory === 'Upload'
      || !!item.file?.uploadedBy
    );
  }

  const mapped = FILE_VIEW_TO_CATEGORY[view];
  if (!mapped) return item.kind === 'file';
  const cats = Array.isArray(mapped) ? mapped : [mapped];
  return item.kind === 'file' && cats.includes(item.fileCategory);
}

export function filterDocumentList(
  files: ProjectFile[],
  view: FileView,
  ctx: ProjectRequirementsContext,
  requiredDocs: RequiredDocument[],
  search = '',
  setupGaps: SeedCompletenessGap[] = [],
): DocumentListItem[] {
  const requiredCategories = requiredFileCategories(ctx);
  const pid = ctx.project.id;
  const scoped = files.filter(f => f.projectId === pid);

  let items: DocumentListItem[] = scoped.map(projectFileToListItem);

  if (view === 'required') {
    const missingDocs = missingRequiredDocuments(ctx, scoped, requiredDocs);
    const missingSetup = setupGapsToMissingRequired(setupGaps);
    items = [
      ...missingSetup.map(m => ({
        id: m.id,
        kind: 'missing' as const,
        fileName: m.label,
        fileCategory: m.fileCategory,
        actionLabel: m.actionLabel,
      })),
      ...missingDocs.map(m => ({
        id: m.id,
        kind: 'missing' as const,
        fileName: m.label,
        fileCategory: m.fileCategory,
        actionLabel: m.actionLabel,
      })),
      ...items.filter(i => requiredCategories.has(i.fileCategory)),
    ];
  } else {
    items = items.filter(i => matchesFileView(i, view, requiredCategories));
  }

  const q = search.trim().toLowerCase();
  if (q) {
    items = items.filter(i =>
      i.fileName.toLowerCase().includes(q)
      || CATEGORY_LABELS[i.fileCategory].toLowerCase().includes(q)
      || i.locationLabel?.toLowerCase().includes(q)
      || i.linkedRecord?.toLowerCase().includes(q),
    );
  }

  return items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'missing' ? -1 : 1;
    return a.fileName.localeCompare(b.fileName);
  });
}

export function countFilesForView(
  files: ProjectFile[],
  view: FileView,
  ctx: ProjectRequirementsContext,
  requiredDocs: RequiredDocument[],
  setupGaps: SeedCompletenessGap[] = [],
): number {
  return filterDocumentList(files, view, ctx, requiredDocs, '', setupGaps).length;
}

export function fileViewVisibleInNav(
  view: FileView,
  modules: ProjectEnabledModules,
  files: ProjectFile[],
  ctx: ProjectRequirementsContext,
  requiredDocs: RequiredDocument[],
): boolean {
  if (modules.showAllTools) return true;
  if (view === 'all' || view === 'required' || view === 'generated' || view === 'uploads') return true;
  if (view === 'drive-mapping') return true;

  const count = countFilesForView(files, view, ctx, requiredDocs);
  if (count > 0) return true;

  const mapped = FILE_VIEW_TO_CATEGORY[view];
  if (!mapped) return false;
  const cat = Array.isArray(mapped) ? mapped[0] : mapped;
  return requiredFileCategories(ctx).has(cat);
}

/** Defaults for new manual uploads */
export function defaultsForNewUpload(folderKey?: string): Partial<ProjectFile> {
  const fileCategory = folderKey ? FOLDER_TO_CATEGORY[folderKey] : undefined;
  return {
    sourceType: 'Uploaded',
    fileCategory: fileCategory ?? 'Upload',
    documentStatus: 'Received',
  };
}

export function categoryForFileView(view: FileView): DocumentFileCategory | undefined {
  const mapped = FILE_VIEW_TO_CATEGORY[view];
  return Array.isArray(mapped) ? mapped[0] : mapped;
}

export function folderKeyForCategory(cat: DocumentFileCategory): string | undefined {
  return CATEGORY_TO_FOLDER[cat];
}

export function enrichProjectFileOnSave(
  file: Partial<ProjectFile>,
  project: Project,
): Partial<ProjectFile> {
  const category = file.fileCategory as DocumentFileCategory | undefined
    ?? normalizeFileCategory({ ...file, projectId: project.id } as ProjectFile);
  const source = file.sourceType as DocumentSourceType | undefined
    ?? normalizeSourceType({ ...file, projectId: project.id } as ProjectFile);
  return {
    ...file,
    fileCategory: category,
    sourceType: source,
  };
}
