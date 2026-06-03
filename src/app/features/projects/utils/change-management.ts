import { ChangeRequest, ChangeOrderStatus as CoStatusType } from '@app/models/project-controls.types';
import { ChangeOrder } from '@app/models/types';
import type { CoBillingStatus } from '@app/models/financial.types';

export type { CoBillingStatus } from '@app/models/financial.types';

/** Canonical change order statuses for the workflow. */
export type ChangeOrderWorkflowStatus =
  | 'Draft'
  | 'Pricing'
  | 'Needs Backup'
  | 'Sent'
  | 'Approved'
  | 'Rejected'
  | 'Void'
  | 'Billed';

export type ChangeRequestWorkflowStatus =
  | 'Draft'
  | 'Submitted'
  | 'Pricing'
  | 'Needs Backup'
  | 'Converted'
  | 'Void';

export const CHANGE_REQUEST_WORKFLOW_STATUSES: ChangeRequestWorkflowStatus[] = [
  'Draft', 'Submitted', 'Pricing', 'Needs Backup', 'Converted', 'Void',
];

export const CHANGE_ORDER_WORKFLOW_STATUSES: ChangeOrderWorkflowStatus[] = [
  'Draft', 'Pricing', 'Needs Backup', 'Sent', 'Approved', 'Rejected', 'Void', 'Billed',
];

const CO_STATUS_ALIASES: Record<string, ChangeOrderWorkflowStatus> = {
  'Sent to GC/Owner': 'Sent',
  Submitted: 'Pricing',
  'Internal Review': 'Pricing',
  'Need Pricing': 'Needs Backup',
};

export function normalizeCoStatus(status?: string): ChangeOrderWorkflowStatus {
  if (!status) return 'Draft';
  if (CO_STATUS_ALIASES[status]) return CO_STATUS_ALIASES[status];
  if (CHANGE_ORDER_WORKFLOW_STATUSES.includes(status as ChangeOrderWorkflowStatus)) {
    return status as ChangeOrderWorkflowStatus;
  }
  return 'Draft';
}

export function coStatusMatches(co: ChangeOrder, ...statuses: ChangeOrderWorkflowStatus[]): boolean {
  const normalized = normalizeCoStatus(co.status);
  return statuses.includes(normalized);
}

export function crNumber(cr: ChangeRequest): string {
  return cr.changeRequestNumber ?? cr.crNumber ?? '';
}

export function coNumber(co: ChangeOrder): string {
  return co.changeOrderNumber ?? co.coNumber ?? '';
}

export function crTitle(cr: ChangeRequest): string {
  return cr.title ?? cr.description?.slice(0, 80) ?? 'Change Request';
}

export function coTotalAmount(co: ChangeOrder): number {
  if (co.status === 'Approved' || co.status === 'Billed' || normalizeCoStatus(co.status) === 'Approved') {
    return co.approvedAmount ?? co.totalAmount ?? co.sellPrice ?? 0;
  }
  return co.totalAmount ?? co.sellPrice ?? co.approvedAmount ?? 0;
}

export function coApprovedAmount(co: ChangeOrder): number {
  return co.approvedAmount ?? co.totalAmount ?? co.sellPrice ?? 0;
}

export function isApprovedCo(co: ChangeOrder): boolean {
  const s = normalizeCoStatus(co.status);
  return s === 'Approved' || s === 'Billed';
}

export function coBillingStatus(co: ChangeOrder): CoBillingStatus | null {
  const raw = co.billingStatus as CoBillingStatus | undefined;
  if (raw === 'Approved' || raw === 'IncludedInDraftPayApp' || raw === 'SubmittedForBilling' || raw === 'Billed' || raw === 'Paid') {
    return raw;
  }
  if (co.dateBilled || normalizeCoStatus(co.status) === 'Billed') return 'Billed';
  if (co.payAppId && isApprovedCo(co)) return 'IncludedInDraftPayApp';
  if (isApprovedCo(co)) return 'Approved';
  return null;
}

export function isApprovedUnbilledCo(co: ChangeOrder): boolean {
  return isApprovedCo(co) && coBillingStatus(co) === 'Approved';
}

export function isIncludedInDraftPayApp(co: ChangeOrder): boolean {
  return isApprovedCo(co) && coBillingStatus(co) === 'IncludedInDraftPayApp';
}

export function isSubmittedForBillingCo(co: ChangeOrder): boolean {
  return coBillingStatus(co) === 'SubmittedForBilling';
}

export function countsTowardApprovedContract(co: ChangeOrder): boolean {
  const s = normalizeCoStatus(co.status);
  if (s === 'Rejected' || s === 'Void') return false;
  return isApprovedCo(co);
}

export function isPendingCo(co: ChangeOrder): boolean {
  const s = normalizeCoStatus(co.status);
  return s === 'Draft' || s === 'Pricing' || s === 'Needs Backup' || s === 'Sent';
}

export function isOpenChangeRequest(cr: ChangeRequest): boolean {
  return cr.status !== 'Converted' && cr.status !== 'Void';
}

export function nextSequentialNumber(prefix: 'CR' | 'CO', existingNumbers: string[]): string {
  let max = 0;
  for (const raw of existingNumbers) {
    const match = raw.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export function coPricingFromOrder(co: ChangeOrder) {
  return {
    laborCost: co.laborAmount ?? co.laborCost ?? 0,
    materialCost: co.materialAmount ?? co.materialCost ?? 0,
    subCost: co.subcontractorAmount ?? co.subCost ?? 0,
    equipmentCost: co.equipmentAmount ?? co.equipmentCost ?? 0,
    otherCost: co.otherAmount ?? co.otherCost ?? 0,
    overheadPercent: co.overheadPercent ?? 0,
    profitPercent: co.profitPercent ?? 0,
    bondInsurancePercent: co.bondAmount != null ? undefined : (co.bondInsurancePercent ?? 0),
    taxAmount: co.taxAmount ?? 0,
    scheduleImpactDays: co.daysAdded ?? co.scheduleImpactDays ?? 0,
    clarifications: co.clarifications,
    exclusions: co.exclusions,
  };
}

type CoStoragePricingInput =
  Partial<ReturnType<typeof coPricingFromOrder>> & { sellPrice?: number; directCost?: number };

export function toCoStorageFields(pricing: CoStoragePricingInput): Partial<ChangeOrder> {
  const laborCost = pricing.laborCost ?? 0;
  const materialCost = pricing.materialCost ?? 0;
  const subCost = pricing.subCost ?? 0;
  const equipmentCost = pricing.equipmentCost ?? 0;
  const otherCost = pricing.otherCost ?? 0;
  return {
    laborCost,
    laborAmount: laborCost,
    materialCost,
    materialAmount: materialCost,
    subCost,
    subcontractorAmount: subCost,
    equipmentCost,
    equipmentAmount: equipmentCost,
    otherCost,
    otherAmount: otherCost,
    overheadPercent: pricing.overheadPercent,
    profitPercent: pricing.profitPercent,
    bondInsurancePercent: pricing.bondInsurancePercent,
    taxAmount: pricing.taxAmount,
    scheduleImpactDays: pricing.scheduleImpactDays,
    daysAdded: pricing.scheduleImpactDays,
    clarifications: pricing.clarifications,
    exclusions: pricing.exclusions,
    costImpact: pricing.directCost,
    sellPrice: pricing.sellPrice,
    totalAmount: pricing.sellPrice,
  };
}

export type ChangeMetrics = {
  openChangeRequests: number;
  needsPricing: number;
  awaitingApproval: number;
  approvedUnbilled: number;
  approvedUnbilledAmount: number;
  totalApprovedAmount: number;
  pendingCoAmount: number;
};

export function computeChangeMetrics(
  changeRequests: ChangeRequest[],
  changeOrders: ChangeOrder[],
): ChangeMetrics {
  const openChangeRequests = changeRequests.filter(isOpenChangeRequest).length;
  const needsPricing = changeRequests.filter(cr =>
    cr.status === 'Submitted' || cr.status === 'Pricing',
  ).length + changeOrders.filter(co => coStatusMatches(co, 'Draft', 'Pricing', 'Needs Backup')).length;

  const awaitingApproval = changeOrders.filter(co => coStatusMatches(co, 'Sent')).length;

  const approvedUnbilledCos = changeOrders.filter(isApprovedUnbilledCo);
  const approvedCos = changeOrders.filter(countsTowardApprovedContract);
  const pendingCos = changeOrders.filter(co => isPendingCo(co));

  return {
    openChangeRequests,
    needsPricing,
    awaitingApproval,
    approvedUnbilled: approvedUnbilledCos.length,
    approvedUnbilledAmount: approvedUnbilledCos.reduce((s, co) => s + coApprovedAmount(co), 0),
    totalApprovedAmount: approvedCos.reduce((s, co) => s + coApprovedAmount(co), 0),
    pendingCoAmount: pendingCos.reduce((s, co) => s + coTotalAmount(co), 0),
  };
}

export function legacyCoStatusForStorage(status: ChangeOrderWorkflowStatus): CoStatusType {
  if (status === 'Sent') return 'Sent to GC/Owner';
  return status as CoStatusType;
}
