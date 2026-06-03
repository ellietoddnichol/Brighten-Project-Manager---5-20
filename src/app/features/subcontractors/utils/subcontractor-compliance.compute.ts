import {
  ProjectSubComplianceStatus,
  ProjectSubcontractor,
  ProjectSubcontractorStatus,
  Subcontractor,
  SubcontractorDocument,
  SubcontractorDocumentType,
  SubcontractorStatus,
  W9Status,
  InsuranceStatus,
} from '@app/models/subcontractor.types';

export const COI_EXPIRY_WARNING_DAYS = 30;

export const REQUIRED_FOR_APPROVED_TO_START: SubcontractorDocumentType[] = [
  'W9',
  'CertificateOfInsurance',
  'WorkersComp',
  'SubcontractAgreement',
];

export const INSURANCE_DOC_TYPES: SubcontractorDocumentType[] = [
  'CertificateOfInsurance',
  'WorkersComp',
  'GeneralLiability',
  'AutoLiability',
  'Umbrella',
];

export function folderKeyForSubDocumentType(documentType: SubcontractorDocumentType): string {
  switch (documentType) {
    case 'LienWaiver':
      return 'BILLING';
    case 'FinalLienWaiver':
    case 'CloseoutDocs':
      return 'CLOSEOUT';
    default:
      return 'SUBS';
  }
}

export function documentCategoryLabel(documentType: SubcontractorDocumentType): string {
  switch (documentType) {
    case 'W9':
      return 'Subs';
    case 'CertificateOfInsurance':
    case 'WorkersComp':
    case 'GeneralLiability':
    case 'AutoLiability':
    case 'Umbrella':
      return 'Insurance';
    case 'LienWaiver':
    case 'FinalLienWaiver':
      return 'Lien Waivers';
    case 'SubcontractAgreement':
      return 'Subcontract Agreements';
    default:
      return 'Subs';
  }
}

export function isDocumentExpired(expirationDate?: string, today = new Date()): boolean {
  if (!expirationDate) return false;
  const exp = new Date(`${expirationDate.slice(0, 10)}T23:59:59`);
  return exp.getTime() < today.getTime();
}

export function isCoiExpiringSoon(expirationDate?: string, today = new Date()): boolean {
  if (!expirationDate) return false;
  const exp = new Date(`${expirationDate.slice(0, 10)}T23:59:59`);
  const days = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= COI_EXPIRY_WARNING_DAYS;
}

export function resolveDocumentStatus(
  doc: Pick<SubcontractorDocument, 'documentType' | 'expirationDate' | 'status'>,
  today = new Date(),
): SubcontractorDocument['status'] {
  if (doc.status === 'NeedsReview') return 'NeedsReview';
  if (isDocumentExpired(doc.expirationDate, today)) return 'Expired';
  return doc.status === 'Missing' ? 'Missing' : 'Valid';
}

export function latestDocByType(
  docs: SubcontractorDocument[],
  documentType: SubcontractorDocumentType,
  projectSubcontractorId?: string,
): SubcontractorDocument | undefined {
  const filtered = docs.filter(d =>
    d.documentType === documentType
    && d.status !== 'Missing'
    && (!projectSubcontractorId || d.projectSubcontractorId === projectSubcontractorId || !d.projectSubcontractorId),
  );
  return filtered.sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))[0];
}

export function computeProjectSubComplianceStatus(
  master: Subcontractor,
  docs: SubcontractorDocument[],
  projectSubcontractorId: string,
  today = new Date(),
): ProjectSubComplianceStatus {
  const scoped = docs.filter(d =>
    d.subcontractorId === master.id
    && (d.projectSubcontractorId === projectSubcontractorId || !d.projectSubcontractorId),
  );

  const required = REQUIRED_FOR_APPROVED_TO_START.filter(t =>
    t !== 'W9' || master.w9Status !== 'NotRequired',
  );

  let hasExpired = false;
  let hasMissing = false;
  let hasReview = false;

  for (const docType of required) {
    const doc = latestDocByType(scoped, docType, projectSubcontractorId);
    if (!doc) {
      hasMissing = true;
      continue;
    }
    const status = resolveDocumentStatus(doc, today);
    if (status === 'Expired') hasExpired = true;
    else if (status === 'Missing') hasMissing = true;
    else if (status === 'NeedsReview') hasReview = true;
  }

  if (hasExpired) return 'ExpiredItems';
  if (hasMissing) return 'MissingItems';
  if (hasReview) return 'Review';
  return 'Complete';
}

export function canSetApprovedToStart(
  ps: Pick<ProjectSubcontractor, 'complianceStatus' | 'complianceOverrideNote'>,
): boolean {
  if (ps.complianceStatus === 'Complete') return true;
  return !!(ps.complianceOverrideNote?.trim());
}

export function validateApprovedToStartStatus(
  ps: Pick<ProjectSubcontractor, 'status' | 'complianceStatus' | 'complianceOverrideNote'>,
  nextStatus: ProjectSubcontractorStatus,
): { allowed: boolean; reason?: string } {
  if (nextStatus !== 'ApprovedToStart') return { allowed: true };
  if (canSetApprovedToStart(ps)) return { allowed: true };
  return {
    allowed: false,
    reason: 'Required compliance documents are missing or expired. Enter an override note to proceed.',
  };
}

export function computeMasterSubcontractorStatus(
  sub: Pick<Subcontractor, 'w9Status' | 'insuranceStatus' | 'status'>,
): SubcontractorStatus {
  if (sub.status === 'DoNotUse' || sub.status === 'Inactive') return sub.status;
  if (sub.w9Status !== 'NotRequired' && sub.w9Status !== 'OnFile') return 'MissingCompliance';
  if (sub.insuranceStatus === 'Missing' || sub.insuranceStatus === 'Expired') return 'MissingCompliance';
  if (sub.status === 'PendingSetup') return 'PendingSetup';
  return 'Approved';
}

export function deriveMasterW9Status(
  w9Status: W9Status,
  docs: SubcontractorDocument[],
  subcontractorId: string,
): W9Status {
  if (w9Status === 'NotRequired') return 'NotRequired';
  const w9 = latestDocByType(docs.filter(d => d.subcontractorId === subcontractorId), 'W9');
  if (!w9) return 'Missing';
  if (resolveDocumentStatus(w9) === 'Expired') return 'Expired';
  return 'OnFile';
}

export function deriveMasterInsuranceStatus(
  docs: SubcontractorDocument[],
  subcontractorId: string,
  coiExpirationDate?: string,
  today = new Date(),
): InsuranceStatus {
  const coi = latestDocByType(
    docs.filter(d => d.subcontractorId === subcontractorId),
    'CertificateOfInsurance',
  );
  const expDate = coi?.expirationDate ?? coiExpirationDate;
  if (!coi && !expDate) return 'Missing';
  if (isDocumentExpired(expDate, today)) return 'Expired';
  if (coi && resolveDocumentStatus(coi, today) === 'NeedsReview') return 'Review';
  if (isCoiExpiringSoon(expDate, today)) return 'Review';
  return 'Valid';
}

export interface SubComplianceTaskDescriptor {
  triggerKey: string;
  title: string;
  severity: 'warning' | 'error';
}

export function complianceTasksForProjectSub(
  master: Subcontractor,
  ps: ProjectSubcontractor,
  docs: SubcontractorDocument[],
  projectActive: boolean,
  today = new Date(),
): SubComplianceTaskDescriptor[] {
  const tasks: SubComplianceTaskDescriptor[] = [];
  const scoped = docs.filter(d => d.subcontractorId === master.id);

  if (master.w9Status !== 'NotRequired' && master.w9Status !== 'OnFile') {
    tasks.push({
      triggerKey: `sub-w9-${ps.id}`,
      title: `Collect subcontractor W-9: ${master.companyName}`,
      severity: 'warning',
    });
  }

  if (master.insuranceStatus === 'Missing') {
    tasks.push({
      triggerKey: `sub-coi-${ps.id}`,
      title: `Collect subcontractor COI: ${master.companyName}`,
      severity: 'warning',
    });
  }

  const coi = latestDocByType(scoped, 'CertificateOfInsurance');
  const coiExp = coi?.expirationDate ?? master.coiExpirationDate;
  if (coiExp && isCoiExpiringSoon(coiExp, today) && !isDocumentExpired(coiExp, today)) {
    tasks.push({
      triggerKey: `sub-coi-expiring-${ps.id}`,
      title: `Update expiring subcontractor COI: ${master.companyName}`,
      severity: 'warning',
    });
  }
  if (master.insuranceStatus === 'Expired' || (coiExp && isDocumentExpired(coiExp, today))) {
    tasks.push({
      triggerKey: `sub-coi-expired-${ps.id}`,
      title: `Review expired subcontractor COI: ${master.companyName}`,
      severity: 'error',
    });
  }

  if (!latestDocByType(scoped, 'SubcontractAgreement', ps.id)) {
    tasks.push({
      triggerKey: `sub-agreement-${ps.id}`,
      title: `Collect signed subcontract: ${master.companyName}`,
      severity: 'warning',
    });
  }

  if (ps.status === 'WorkComplete' || ps.status === 'FinalWaiverNeeded') {
    if (!latestDocByType(scoped, 'FinalLienWaiver', ps.id)) {
      tasks.push({
        triggerKey: `sub-final-waiver-${ps.id}`,
        title: `Collect final lien waiver: ${master.companyName}`,
        severity: 'warning',
      });
    }
  }

  if (master.status === 'DoNotUse' && projectActive) {
    tasks.push({
      triggerKey: `sub-dnu-${ps.id}`,
      title: `Review Do Not Use subcontractor assignment: ${master.companyName}`,
      severity: 'error',
    });
  }

  return tasks;
}

export function countActiveProjectsForSub(
  subcontractorId: string,
  projectSubs: ProjectSubcontractor[],
): number {
  const activeStatuses = new Set<ProjectSubcontractorStatus>([
    'ApprovedToStart', 'Active', 'WorkComplete', 'FinalWaiverNeeded', 'PendingCompliance', 'PendingContract',
  ]);
  return new Set(
    projectSubs
      .filter(ps => ps.subcontractorId === subcontractorId && activeStatuses.has(ps.status))
      .map(ps => ps.projectId),
  ).size;
}
