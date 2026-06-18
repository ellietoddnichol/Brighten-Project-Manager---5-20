import { ImportException } from '@app/models/import.types';
import { ProjectFinancial } from '@app/models/financial.types';
import { QuickBooksVendorBalance } from '@app/models/quickbooks-sync.types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';
import {
  ProjectSubcontractor,
  Subcontractor,
  VendorClassification,
  W9Status,
} from '@app/models/subcontractor.types';
import { Employee, Project } from '@app/models/types';
import { Company } from '@app/models/job-record.types';
import {
  countActiveProjectsForSub,
  isCoiExpiringSoon,
  isDocumentExpired,
} from '@features/subcontractors/utils/subcontractor-compliance.compute';
import { isOpenArRecord } from '@features/financials/utils/wip.compute';
import { normalizeCompanyName, vendorNamesMatch } from '@shared/utils/vendor-normalizers';

export type DirectorySegmentId =
  | 'overview'
  | 'subcontractors'
  | 'vendors'
  | 'customers'
  | 'employees'
  | 'needsReview';

export type DirectorySubFilterId =
  | 'all'
  | 'active'
  | 'missingW9'
  | 'missingCoi'
  | 'expiringCoi'
  | 'needsReview'
  | 'doNotUse'
  | 'inactive';

export type DirectoryOverviewSection =
  | 'classification'
  | 'compliance'
  | 'coiExpiry'
  | 'activeSubs'
  | 'sourceIssues';

export interface DirectoryHubSummary {
  companies: number;
  needsReview: number;
  missingCoi: number;
  missingW9: number;
  fromQuickBooks: number;
  fromDrive: number;
  activeProjectSubs: number;
  expiringCois: number;
  ignoredVendors: number;
}

export interface DirectoryOverviewRow {
  id: string;
  name: string;
  typeLabel: string;
  sourceLabel: string;
  activeProjectCount: number;
  complianceIssue?: string;
  nextAction: string;
  route: string;
  section: DirectoryOverviewSection;
  severity: 'error' | 'warning';
}

export interface DirectorySubRow {
  id: string;
  companyName: string;
  trade?: string;
  sourceLabel: string;
  activeProjects: number;
  w9Status: W9Status;
  coiLabel: string;
  costLabel: string;
  status: string;
  nextAction: string;
  badges: string[];
  sub: Subcontractor;
}

export interface DirectoryVendorRow {
  id: string;
  vendorName: string;
  classification: string;
  sourceLabel: string;
  balanceLabel: string;
  linkedProjects: number;
  nextAction: string;
  sub: Subcontractor;
}

export interface DirectoryCustomerRow {
  id: string;
  customerName: string;
  companyType: string;
  sourceLabel: string;
  activeProjects: number;
  openAr: number;
  contractValue: number;
  primaryContact?: string;
  nextAction: string;
  route: string;
}

export interface DirectoryContactRow {
  id: string;
  name: string;
  company: string;
  role: string;
  contact: string;
  activeProjectLinks: number;
  sourceLabel: string;
  nextAction: string;
  route: string;
}

export interface DirectoryNeedsReviewRow {
  id: string;
  name: string;
  issueType: string;
  sourceLabel: string;
  detail: string;
  nextAction: string;
  route: string;
  severity: 'error' | 'warning';
}

export const DIRECTORY_SEGMENT_OPTIONS: { id: DirectorySegmentId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'subcontractors', label: 'Subcontractors' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'customers', label: 'Companies' },
  { id: 'employees', label: 'Employees / Contacts' },
  { id: 'needsReview', label: 'Needs Review' },
];

export const DIRECTORY_SUB_FILTER_OPTIONS: { id: DirectorySubFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'missingW9', label: 'Missing W-9' },
  { id: 'missingCoi', label: 'Missing COI' },
  { id: 'expiringCoi', label: 'Expiring COI' },
  { id: 'needsReview', label: 'Needs Review' },
  { id: 'doNotUse', label: 'Do Not Use' },
  { id: 'inactive', label: 'Inactive' },
];

export function normalizeDirectorySegment(value: string | null | undefined): DirectorySegmentId {
  if (!value) return 'overview';
  const allowed = new Set(DIRECTORY_SEGMENT_OPTIONS.map(o => o.id));
  return allowed.has(value as DirectorySegmentId) ? (value as DirectorySegmentId) : 'overview';
}

export function normalizeDirectorySubFilter(value: string | null | undefined): DirectorySubFilterId {
  if (!value) return 'all';
  const allowed = new Set(DIRECTORY_SUB_FILTER_OPTIONS.map(o => o.id));
  return allowed.has(value as DirectorySubFilterId) ? (value as DirectorySubFilterId) : 'all';
}

export function isQuickBooksSource(source?: Subcontractor['source']): boolean {
  return source === 'QuickBooksSync' || source === 'QuickBooksSeed';
}

export function isDriveSource(source?: Subcontractor['source']): boolean {
  return source === 'DriveDiscovery' || source === 'DriveSeed';
}

export function directorySourceLabel(source?: Subcontractor['source']): string {
  if (isQuickBooksSource(source)) return 'QuickBooks';
  if (isDriveSource(source)) return 'Drive';
  if (source === 'Manual') return 'Manual';
  return 'Project';
}

export function effectiveVendorClassification(sub: Subcontractor): VendorClassification {
  return sub.vendorClassification ?? 'NeedsReview';
}

export function directoryTypeLabel(sub: Subcontractor): string {
  const cls = effectiveVendorClassification(sub);
  switch (cls) {
    case 'Subcontractor': return 'Subcontractor';
    case 'Supplier': return 'Supplier';
    case 'Consultant': return 'Consultant';
    case 'Ignore': return 'Ignore';
    default: return 'Needs Review';
  }
}

export function subCoiLabel(sub: Subcontractor, today = new Date()): string {
  if (sub.insuranceStatus === 'Missing') return 'Missing';
  if (sub.insuranceStatus === 'Expired') return 'Expired';
  if (sub.coiExpirationDate && isDocumentExpired(sub.coiExpirationDate, today)) return 'Expired';
  if (sub.coiExpirationDate && isCoiExpiringSoon(sub.coiExpirationDate, today)) {
    return `Expiring ${sub.coiExpirationDate.slice(0, 10)}`;
  }
  if (sub.insuranceStatus === 'Valid' && sub.coiExpirationDate) return sub.coiExpirationDate.slice(0, 10);
  if (sub.insuranceStatus === 'Review') return 'Review';
  return sub.insuranceStatus;
}

export function subBadges(sub: Subcontractor, today = new Date()): string[] {
  const badges: string[] = [];
  if (sub.status === 'DoNotUse') badges.push('Do Not Use');
  if (sub.w9Status === 'Missing') badges.push('Missing W-9');
  if (sub.insuranceStatus === 'Missing') badges.push('Missing COI');
  if (sub.insuranceStatus === 'Expired' || (sub.coiExpirationDate && isDocumentExpired(sub.coiExpirationDate, today))) {
    badges.push('Expired COI');
  } else if (sub.coiExpirationDate && isCoiExpiringSoon(sub.coiExpirationDate, today)) {
    badges.push('Expiring');
  }
  if (effectiveVendorClassification(sub) === 'NeedsReview') badges.push('Needs Review');
  return badges;
}

function subCostLabel(sub: Subcontractor): string {
  if (sub.seededTotalCost && sub.seededTotalCost > 0) {
    return `$${Math.round(sub.seededTotalCost).toLocaleString()}`;
  }
  return '—';
}

function qbBalanceForSub(sub: Subcontractor, vendorBalances: QuickBooksVendorBalance[]): number | undefined {
  const row = vendorBalances.find(v =>
    vendorNamesMatch(v.vendorName, sub.companyName) || v.subcontractorId === sub.id,
  );
  return row?.totalOpenBalance;
}

function subNextAction(sub: Subcontractor, activeProjects: number): string {
  if (sub.status === 'DoNotUse') return 'Review status';
  if (effectiveVendorClassification(sub) === 'NeedsReview') return 'Classify vendor';
  if (sub.w9Status === 'Missing') return 'Collect W-9';
  if (sub.insuranceStatus === 'Missing' || sub.insuranceStatus === 'Expired') return 'Collect COI';
  if (sub.coiExpirationDate && isCoiExpiringSoon(sub.coiExpirationDate)) return 'Renew COI';
  if (activeProjects > 0) return 'Open record';
  if (sub.status === 'PendingSetup') return 'Complete setup';
  return 'Open record';
}

function isSubcontractorRecord(sub: Subcontractor, activeProjects: number): boolean {
  const cls = effectiveVendorClassification(sub);
  if (cls === 'Subcontractor') return true;
  if (cls === 'Supplier' || cls === 'Consultant' || cls === 'Ignore') return false;
  return activeProjects > 0;
}

function isVendorRecord(sub: Subcontractor, activeProjects: number): boolean {
  const cls = effectiveVendorClassification(sub);
  if (cls === 'Supplier' || cls === 'Consultant') return true;
  if (cls === 'Subcontractor') return false;
  if (cls === 'Ignore') return true;
  return activeProjects === 0;
}

export function matchesSubHubFilter(
  sub: Subcontractor,
  activeProjects: number,
  filter: DirectorySubFilterId,
  today = new Date(),
): boolean {
  switch (filter) {
    case 'active':
      return (sub.status === 'Approved' || activeProjects > 0)
        && sub.status !== 'Inactive'
        && sub.status !== 'DoNotUse';
    case 'missingW9':
      return sub.w9Status === 'Missing';
    case 'missingCoi':
      return sub.insuranceStatus === 'Missing';
    case 'expiringCoi':
      return !!(sub.coiExpirationDate && isCoiExpiringSoon(sub.coiExpirationDate, today) && !isDocumentExpired(sub.coiExpirationDate, today));
    case 'needsReview':
      return effectiveVendorClassification(sub) === 'NeedsReview';
    case 'doNotUse':
      return sub.status === 'DoNotUse';
    case 'inactive':
      return sub.status === 'Inactive';
    default:
      return true;
  }
}

export function summarizeDirectoryHub(input: {
  subs: Subcontractor[];
  projectSubs: ProjectSubcontractor[];
  companies?: Company[];
  projects?: Project[];
}): DirectoryHubSummary {
  const subs = input.subs.filter(s => effectiveVendorClassification(s) !== 'Ignore');
  const today = new Date();
  const companyNames = new Set<string>();
  for (const c of input.companies ?? []) {
    if (c.name?.trim()) companyNames.add(normalizeCompanyName(c.name));
  }
  for (const p of input.projects ?? []) {
    if (p.customer?.trim()) companyNames.add(normalizeCompanyName(p.customer));
  }
  for (const s of subs) {
    if (s.companyName?.trim()) companyNames.add(normalizeCompanyName(s.companyName));
  }

  return {
    companies: companyNames.size,
    needsReview: subs.filter(s => effectiveVendorClassification(s) === 'NeedsReview').length,
    missingCoi: subs.filter(s => s.insuranceStatus === 'Missing').length,
    missingW9: subs.filter(s => s.w9Status === 'Missing').length,
    fromQuickBooks: subs.filter(s => isQuickBooksSource(s.source)).length,
    fromDrive: subs.filter(s => isDriveSource(s.source)).length,
    activeProjectSubs: new Set(
      input.projectSubs
        .filter(ps => ['ApprovedToStart', 'Active', 'WorkComplete', 'FinalWaiverNeeded', 'PendingCompliance', 'PendingContract'].includes(ps.status))
        .map(ps => ps.subcontractorId),
    ).size,
    expiringCois: subs.filter(s =>
      s.coiExpirationDate && isCoiExpiringSoon(s.coiExpirationDate, today) && !isDocumentExpired(s.coiExpirationDate, today),
    ).length,
    ignoredVendors: input.subs.filter(s => effectiveVendorClassification(s) === 'Ignore').length,
  };
}

export function buildDirectorySubRows(input: {
  subs: Subcontractor[];
  projectSubs: ProjectSubcontractor[];
  vendorBalances: QuickBooksVendorBalance[];
}): DirectorySubRow[] {
  return input.subs
    .filter(sub => {
      const active = countActiveProjectsForSub(sub.id, input.projectSubs);
      return isSubcontractorRecord(sub, active);
    })
    .map(sub => {
      const activeProjects = countActiveProjectsForSub(sub.id, input.projectSubs);
      const balance = qbBalanceForSub(sub, input.vendorBalances);
      const cost = subCostLabel(sub);
      return {
        id: sub.id,
        companyName: sub.companyName,
        trade: sub.trade,
        sourceLabel: directorySourceLabel(sub.source),
        activeProjects,
        w9Status: sub.w9Status,
        coiLabel: subCoiLabel(sub),
        costLabel: balance != null && balance > 0 ? `$${Math.round(balance).toLocaleString()} QB` : cost,
        status: sub.status,
        nextAction: subNextAction(sub, activeProjects),
        badges: subBadges(sub),
        sub,
      };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}

export function buildDirectoryVendorRows(input: {
  subs: Subcontractor[];
  projectSubs: ProjectSubcontractor[];
  vendorBalances: QuickBooksVendorBalance[];
}): DirectoryVendorRow[] {
  return input.subs
    .filter(sub => {
      const active = countActiveProjectsForSub(sub.id, input.projectSubs);
      return isVendorRecord(sub, active);
    })
    .map(sub => {
      const linkedProjects = new Set(
        input.projectSubs.filter(ps => ps.subcontractorId === sub.id).map(ps => ps.projectId),
      ).size;
      const balance = qbBalanceForSub(sub, input.vendorBalances);
      const cls = effectiveVendorClassification(sub);
      return {
        id: sub.id,
        vendorName: sub.companyName,
        classification: directoryTypeLabel(sub),
        sourceLabel: directorySourceLabel(sub.source),
        balanceLabel: balance != null ? `$${Math.round(balance).toLocaleString()}` : subCostLabel(sub),
        linkedProjects,
        nextAction: cls === 'NeedsReview' ? 'Classify vendor' : cls === 'Ignore' ? 'Review ignore' : 'Open record',
        sub,
      };
    })
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

export function buildDirectoryCustomerRows(input: {
  projects: Project[];
  lifecycleByProjectId: Map<string, ProjectLifecycleSnapshot>;
  financialByProjectId: Map<string, ProjectFinancial>;
  arRecords: { projectId: string; status: string; openBalance?: number }[];
  companies?: Company[];
  subs?: Subcontractor[];
}): DirectoryCustomerRow[] {
  const byKey = new Map<string, {
    customerName: string;
    companyType: string;
    sourceLabel: string;
    projects: Project[];
    openAr: number;
    contractValue: number;
    primaryContact?: string;
  }>();

  const ensure = (
    name: string,
    companyType: string,
    sourceLabel: string,
    contact?: string,
  ) => {
    const key = normalizeCompanyName(name);
    if (!key) return;
    const bucket = byKey.get(key) ?? {
      customerName: name.trim(),
      companyType,
      sourceLabel,
      projects: [],
      openAr: 0,
      contractValue: 0,
      primaryContact: contact,
    };
    if (!bucket.primaryContact && contact) bucket.primaryContact = contact;
    byKey.set(key, bucket);
    return bucket;
  };

  for (const company of input.companies ?? []) {
    ensure(company.name, company.type ?? 'Company', 'Job record', company.contactName);
  }

  for (const sub of input.subs ?? []) {
    ensure(sub.companyName, 'Subcontractor', sub.source ?? 'Manual', sub.contactName);
  }

  for (const project of input.projects) {
    const customer = project.customer?.trim();
    if (!customer) continue;
    const bucket = ensure(customer, 'Customer', 'Job') ?? byKey.get(normalizeCompanyName(customer))!;
    bucket.projects.push(project);
    const financial = input.financialByProjectId.get(project.id);
    bucket.contractValue += financial?.currentContractAmount ?? project.originalContractAmount ?? 0;
    bucket.openAr += input.arRecords
      .filter(r => r.projectId === project.id && isOpenArRecord(r.status))
      .reduce((s, r) => s + (r.openBalance ?? 0), 0);
    if (!bucket.primaryContact && project.owner?.trim()) bucket.primaryContact = project.owner.trim();
  }

  return [...byKey.values()]
    .map(bucket => {
      const activeProjects = bucket.projects.filter(p => {
        const lc = input.lifecycleByProjectId.get(p.id);
        return lc?.includeInDefaultScope ?? ['Active', 'Awarded', 'Setup Needed', 'Closeout'].includes(p.status);
      }).length;
      const sampleProject = bucket.projects.find(p => activeProjects > 0) ?? bucket.projects[0];
      return {
        id: normalizeCompanyName(bucket.customerName),
        customerName: bucket.customerName,
        companyType: bucket.companyType,
        sourceLabel: bucket.sourceLabel,
        activeProjects,
        openAr: bucket.openAr,
        contractValue: bucket.contractValue,
        primaryContact: bucket.primaryContact,
        nextAction: activeProjects > 0 ? 'View jobs' : 'Review company',
        route: sampleProject ? `/projects/${sampleProject.id}` : '/projects',
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
}

export function buildDirectoryContactRows(input: {
  employees: Employee[];
  subs: Subcontractor[];
  projects: Project[];
  projectSubs: ProjectSubcontractor[];
}): DirectoryContactRow[] {
  const rows: DirectoryContactRow[] = [];

  for (const emp of input.employees) {
    const linked = input.projects.filter(p =>
      p.projectManager === emp.name || p.superintendent === emp.name,
    ).length;
    rows.push({
      id: `emp-${emp.id}`,
      name: emp.name,
      company: 'Brighten',
      role: emp.department ?? emp.hoursType ?? 'Employee',
      contact: [emp.status].filter(Boolean).join(' · ') || '—',
      activeProjectLinks: linked,
      sourceLabel: emp.source === 'manual' ? 'Manual' : 'Time sheet',
      nextAction: linked > 0 ? 'View projects' : 'Open record',
      route: '/projects',
    });
  }

  for (const sub of input.subs) {
    if (!sub.contactName?.trim() && !sub.email?.trim() && !sub.phone?.trim()) continue;
    const linked = new Set(
      input.projectSubs.filter(ps => ps.subcontractorId === sub.id).map(ps => ps.projectId),
    ).size;
    rows.push({
      id: `sub-contact-${sub.id}`,
      name: sub.contactName?.trim() || sub.companyName,
      company: sub.companyName,
      role: sub.trade ?? directoryTypeLabel(sub),
      contact: [sub.email, sub.phone].filter(Boolean).join(' · ') || '—',
      activeProjectLinks: linked,
      sourceLabel: directorySourceLabel(sub.source),
      nextAction: 'Open company',
      route: '/subcontractors',
    });
  }

  for (const project of input.projects) {
    for (const [role, name] of [
      ['PM', project.projectManager],
      ['Superintendent', project.superintendent],
    ] as const) {
      if (!name?.trim()) continue;
      if (rows.some(r => r.name === name.trim() && r.role === role)) continue;
      rows.push({
        id: `proj-${project.id}-${role}`,
        name: name.trim(),
        company: project.customer || project.projectName,
        role,
        contact: project.projectNumber ? `J${project.projectNumber}` : '—',
        activeProjectLinks: 1,
        sourceLabel: 'Project',
        nextAction: 'Open job',
        route: `/projects/${project.id}`,
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

function duplicateVendorNames(subs: Subcontractor[]): string[] {
  const byNorm = new Map<string, string[]>();
  for (const sub of subs) {
    const norm = normalizeCompanyName(sub.companyName);
    byNorm.set(norm, [...(byNorm.get(norm) ?? []), sub.companyName]);
  }
  return [...byNorm.values()].filter(names => names.length > 1).map(names => names[0]);
}

export function buildDirectoryNeedsReviewRows(input: {
  subs: Subcontractor[];
  projectSubs: ProjectSubcontractor[];
  importExceptions: ImportException[];
}): DirectoryNeedsReviewRow[] {
  const rows: DirectoryNeedsReviewRow[] = [];
  const dupes = new Set(duplicateVendorNames(input.subs));

  for (const sub of input.subs) {
    const active = countActiveProjectsForSub(sub.id, input.projectSubs);
    const cls = effectiveVendorClassification(sub);
    const push = (issueType: string, detail: string, severity: 'error' | 'warning', nextAction: string) => {
      rows.push({
        id: `${issueType}-${sub.id}`,
        name: sub.companyName,
        issueType,
        sourceLabel: directorySourceLabel(sub.source),
        detail,
        nextAction,
        route: '/settings',
        severity,
      });
    };

    if (cls === 'NeedsReview') {
      push('Needs classification', 'Vendor type not confirmed after discovery', 'warning', 'Classify vendor');
    }
    if (dupes.has(sub.companyName)) {
      push('Duplicate vendor name', 'Possible duplicate company record', 'warning', 'Source Review');
    }
    if (isDriveSource(sub.source) && !isQuickBooksSource(sub.source)) {
      push('Drive-only vendor', 'Found in Drive but not matched in QuickBooks', 'warning', 'Source Review');
    }
    if (isQuickBooksSource(sub.source) && !isDriveSource(sub.source) && active === 0 && cls === 'NeedsReview') {
      push('QuickBooks-only vendor', 'QuickBooks vendor without project or Drive link', 'warning', 'Classify vendor');
    }
    if (sub.w9Status === 'Missing' && active > 0) {
      push('Missing W-9', 'Active on jobs without W-9 on file', 'error', 'Collect W-9');
    }
    if (sub.insuranceStatus === 'Missing' && active > 0) {
      push('Missing COI', 'Active on jobs without COI on file', 'error', 'Collect COI');
    }
    if (sub.insuranceStatus === 'Expired' || (sub.coiExpirationDate && isDocumentExpired(sub.coiExpirationDate))) {
      push('Expired COI', sub.coiExpirationDate ? `Expired ${sub.coiExpirationDate.slice(0, 10)}` : 'Insurance expired', 'error', 'Renew COI');
    }
    if (!sub.email?.trim() && !sub.phone?.trim() && !sub.contactName?.trim() && cls !== 'Ignore') {
      push('Missing contact info', 'No contact name, email, or phone on file', 'warning', 'Add contact');
    }
  }

  for (const ex of input.importExceptions) {
    if (ex.status !== 'NeedsReview') continue;
    if (!ex.type.includes('vendor') && ex.type !== 'unmatchedVendor' && ex.type !== 'duplicateVendorName' && ex.type !== 'unmatchedSubcontractor') {
      continue;
    }
    rows.push({
      id: `ex-${ex.id}`,
      name: ex.vendorName ?? ex.message.slice(0, 48),
      issueType: ex.type === 'unmatchedVendor' ? 'Unmatched vendor' : ex.type === 'duplicateVendorName' ? 'Duplicate vendor name' : 'Source issue',
      sourceLabel: ex.source.includes('QuickBooks') ? 'QuickBooks' : ex.source.includes('Drive') ? 'Drive' : 'Import',
      detail: ex.message,
      nextAction: 'Source Review',
      route: '/settings',
      severity: 'warning',
    });
  }

  return rows;
}

export function buildDirectoryOverviewRows(input: {
  subs: Subcontractor[];
  projectSubs: ProjectSubcontractor[];
  importExceptions: ImportException[];
}): DirectoryOverviewRow[] {
  const rows: DirectoryOverviewRow[] = [];
  const today = new Date();

  for (const sub of input.subs) {
    if (effectiveVendorClassification(sub) === 'Ignore') continue;
    const active = countActiveProjectsForSub(sub.id, input.projectSubs);
    const base = {
      name: sub.companyName,
      typeLabel: directoryTypeLabel(sub),
      sourceLabel: directorySourceLabel(sub.source),
      activeProjectCount: active,
      route: '/directory',
    };

    if (effectiveVendorClassification(sub) === 'NeedsReview') {
      rows.push({
        ...base,
        id: `class-${sub.id}`,
        section: 'classification',
        complianceIssue: 'Needs classification',
        nextAction: 'Classify vendor',
        severity: 'warning',
      });
    }

    if (sub.status === 'MissingCompliance' || (active > 0 && (sub.w9Status === 'Missing' || sub.insuranceStatus === 'Missing'))) {
      rows.push({
        ...base,
        id: `comp-${sub.id}`,
        section: 'compliance',
        complianceIssue: sub.w9Status === 'Missing' ? 'Missing W-9' : 'Missing COI',
        nextAction: sub.w9Status === 'Missing' ? 'Collect W-9' : 'Collect COI',
        severity: 'error',
      });
    }

    if (sub.coiExpirationDate && (isDocumentExpired(sub.coiExpirationDate, today) || isCoiExpiringSoon(sub.coiExpirationDate, today))) {
      rows.push({
        ...base,
        id: `coi-${sub.id}`,
        section: 'coiExpiry',
        complianceIssue: isDocumentExpired(sub.coiExpirationDate, today) ? 'Expired COI' : 'Expiring COI',
        nextAction: 'Renew COI',
        severity: isDocumentExpired(sub.coiExpirationDate, today) ? 'error' : 'warning',
      });
    }

    if (active > 0 && effectiveVendorClassification(sub) === 'Subcontractor') {
      rows.push({
        ...base,
        id: `active-${sub.id}`,
        section: 'activeSubs',
        complianceIssue: subBadges(sub, today)[0],
        nextAction: 'Open subcontractor',
        severity: subBadges(sub, today).length ? 'warning' : 'warning',
      });
    }
  }

  for (const ex of input.importExceptions.filter(e => e.status === 'NeedsReview' && (e.type.includes('vendor') || e.type === 'unmatchedVendor'))) {
    rows.push({
      id: `src-${ex.id}`,
      name: ex.vendorName ?? 'Vendor import issue',
      typeLabel: 'Needs Review',
      sourceLabel: ex.source.includes('QuickBooks') ? 'QuickBooks' : 'Drive',
      activeProjectCount: 0,
      complianceIssue: ex.type === 'unmatchedVendor' ? 'Unmatched vendor' : 'Source conflict',
      nextAction: 'Source Review',
      route: '/settings',
      section: 'sourceIssues',
      severity: 'warning',
    });
  }

  const order: DirectoryOverviewSection[] = ['classification', 'compliance', 'coiExpiry', 'activeSubs', 'sourceIssues'];
  return rows
    .sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.name.localeCompare(b.name))
    .slice(0, 40);
}

export function directoryHubCsvRows(
  segment: DirectorySegmentId,
  overview: DirectoryOverviewRow[],
  subs: DirectorySubRow[],
  vendors: DirectoryVendorRow[],
  customers: DirectoryCustomerRow[],
  contacts: DirectoryContactRow[],
  needsReview: DirectoryNeedsReviewRow[],
): string[][] {
  switch (segment) {
    case 'subcontractors':
      return subs.map(r => [
        r.companyName,
        r.trade ?? '',
        r.sourceLabel,
        String(r.activeProjects),
        r.w9Status,
        r.coiLabel,
        r.costLabel,
        r.status,
        r.nextAction,
      ]);
    case 'vendors':
      return vendors.map(r => [
        r.vendorName,
        r.classification,
        r.sourceLabel,
        r.balanceLabel,
        String(r.linkedProjects),
        r.nextAction,
      ]);
    case 'customers':
      return customers.map(r => [
        r.customerName,
        String(r.activeProjects),
        String(r.openAr),
        String(r.contractValue),
        r.primaryContact ?? '',
        r.nextAction,
      ]);
    case 'employees':
      return contacts.map(r => [
        r.name,
        r.company,
        r.role,
        r.contact,
        String(r.activeProjectLinks),
        r.sourceLabel,
        r.nextAction,
      ]);
    case 'needsReview':
      return needsReview.map(r => [r.name, r.issueType, r.sourceLabel, r.detail, r.nextAction]);
    default:
      return overview.map(r => [
        r.name,
        r.typeLabel,
        r.sourceLabel,
        String(r.activeProjectCount),
        r.complianceIssue ?? '',
        r.nextAction,
      ]);
  }
}

export function directoryOverviewSectionLabel(section: DirectoryOverviewSection): string {
  switch (section) {
    case 'classification': return 'Needs classification';
    case 'compliance': return 'Missing compliance';
    case 'coiExpiry': return 'COI expiring / expired';
    case 'activeSubs': return 'Active project subs';
    case 'sourceIssues': return 'Source / discovery';
    default: return section;
  }
}
