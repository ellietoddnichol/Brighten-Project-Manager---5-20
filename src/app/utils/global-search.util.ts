import { ChangeOrder, Project } from '../models/types';
import { DataService } from '../services/data.service';

export type GlobalSearchResultType =
  | 'project'
  | 'changeOrder'
  | 'billing'
  | 'ar'
  | 'subcontractorInvoice'
  | 'subcontractor'
  | 'po';

export interface GlobalSearchResult {
  id: string;
  type: GlobalSearchResultType;
  label: string;
  sublabel?: string;
  route: string[];
  queryParams?: Record<string, string>;
}

const TYPE_LABELS: Record<GlobalSearchResultType, string> = {
  project: 'Project',
  changeOrder: 'Change Order',
  billing: 'Billing Invoice',
  ar: 'AR Invoice',
  subcontractorInvoice: 'Sub Invoice',
  subcontractor: 'Subcontractor',
  po: 'PO',
};

function matchesQuery(q: string, ...parts: (string | undefined | null)[]): boolean {
  return parts.filter(Boolean).join(' ').toLowerCase().includes(q);
}

function projectHaystack(p: Project): string {
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

function coLabel(co: ChangeOrder): string {
  return co.changeOrderNumber || co.coNumber || co.id.slice(0, 8);
}

function uniqueProjects(projects: Project[]): Project[] {
  const seen = new Set<string>();
  const out: Project[] = [];
  for (const p of projects) {
    const key = (p.projectNumber || p.id).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function searchTypeLabel(type: GlobalSearchResultType): string {
  return TYPE_LABELS[type];
}

export function runGlobalSearch(data: DataService, query: string, limit = 14): GlobalSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const results: GlobalSearchResult[] = [];
  const projects = uniqueProjects(data.projectsSnapshot());
  const projectName = (id?: string) =>
    projects.find(p => p.id === id)?.projectName ?? id?.slice(0, 8) ?? '';

  for (const p of projects) {
    if (results.filter(r => r.type === 'project').length >= 5) break;
    if (!projectHaystack(p).includes(q)) continue;
    results.push({
      id: `project-${p.id}`,
      type: 'project',
      label: `#${p.projectNumber} · ${p.projectName}`,
      sublabel: p.customer,
      route: ['/projects', p.id],
    });
  }

  for (const co of data.changeOrdersSnapshot()) {
    if (!co.projectId) continue;
    if (results.filter(r => r.type === 'changeOrder').length >= 4) break;
    if (!matchesQuery(q, coLabel(co), co.title, co.description, projectName(co.projectId))) continue;
    results.push({
      id: `co-${co.id}`,
      type: 'changeOrder',
      label: `${coLabel(co)} · ${co.title || 'Change order'}`,
      sublabel: projectName(co.projectId),
      route: ['/projects', co.projectId],
      queryParams: { tab: 'changes' },
    });
  }

  for (const inv of data.subcontractorInvoicesSnapshot()) {
    if (results.filter(r => r.type === 'subcontractorInvoice').length >= 3) break;
    if (!matchesQuery(q, inv.invoiceNumber, inv.subcontractorName, inv.projectName, inv.jobNumber, inv.description)) continue;
    results.push({
      id: `sub-inv-${inv.id}`,
      type: 'subcontractorInvoice',
      label: `${inv.invoiceNumber} · ${inv.subcontractorName}`,
      sublabel: inv.projectName || inv.jobNumber,
      route: inv.projectId ? ['/projects', inv.projectId] : ['/subcontractors'],
      queryParams: inv.projectId
        ? { section: 'financials', view: 'pos' }
        : { view: 'invoices' },
    });
  }

  for (const bill of data.billingsSnapshot()) {
    if (results.filter(r => r.type === 'billing').length >= 2) break;
    if (!matchesQuery(q, bill.invoiceNumber, bill.payAppNumber, projectName(bill.projectId))) continue;
    results.push({
      id: `bill-${bill.id}`,
      type: 'billing',
      label: bill.invoiceNumber || bill.payAppNumber || 'Billing',
      sublabel: projectName(bill.projectId),
      route: bill.projectId ? ['/projects', bill.projectId] : ['/billing'],
      queryParams: bill.projectId ? { section: 'financials', view: 'billing' } : undefined,
    });
  }

  for (const ar of data.arRecordsSnapshot()) {
    if (results.filter(r => r.type === 'ar').length >= 2) break;
    if (!matchesQuery(q, ar.invoiceNumber, ar.customer, ar.projectName, projectName(ar.projectId))) continue;
    results.push({
      id: `ar-${ar.id}`,
      type: 'ar',
      label: ar.invoiceNumber || 'AR Invoice',
      sublabel: projectName(ar.projectId),
      route: ar.projectId ? ['/projects', ar.projectId] : ['/ar'],
      queryParams: ar.projectId ? { section: 'financials', view: 'ar' } : undefined,
    });
  }

  for (const sub of data.subcontractorsSnapshot()) {
    if (results.filter(r => r.type === 'subcontractor').length >= 2) break;
    if (!matchesQuery(q, sub.companyName, sub.trade, sub.contactName, sub.email)) continue;
    results.push({
      id: `sub-${sub.id}`,
      type: 'subcontractor',
      label: sub.companyName,
      sublabel: sub.trade,
      route: ['/subcontractors'],
    });
  }

  for (const po of data.posSnapshot()) {
    if (results.filter(r => r.type === 'po').length >= 2) break;
    if (!matchesQuery(q, po.poNumber, po.vendor, po.itemsPurchased, po.category, projectName(po.projectId))) continue;
    results.push({
      id: `po-${po.id}`,
      type: 'po',
      label: `${po.poNumber || 'PO'} · ${po.vendor}`,
      sublabel: projectName(po.projectId),
      route: po.projectId ? ['/projects', po.projectId] : ['/pos'],
      queryParams: po.projectId ? { section: 'financials', view: 'pos' } : undefined,
    });
  }

  return results.slice(0, limit);
}
