import {
  ProjectPayAppApiItem,
  ProjectPayAppDetailApiResponse,
  ProjectPayAppsApiResponse,
  ProjectSovLineApiItem,
} from './project-api.types';

export interface ProjectSqlPayApp {
  id: string;
  projectId: string;
  jobNumber: string;
  payAppNumber: string | null;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  applicationDate: string | null;
  contractSum: number | null;
  netChangeByChangeOrders: number | null;
  contractSumToDate: number | null;
  totalCompletedStoredToDate: number | null;
  retainageAmount: number | null;
  totalEarnedLessRetainage: number | null;
  previousCertificates: number | null;
  currentPaymentDue: number | null;
  balanceToFinish: number | null;
  status: string | null;
  notes: string | null;
  sovLineCount: number;
  sourceDocumentId: string | null;
  createdAt: string | null;
}

export interface ProjectSqlSovLine {
  id: string;
  payAppId: string;
  projectId: string;
  lineNumber: string | null;
  description: string | null;
  scheduledValue: number | null;
  workCompletedPrevious: number | null;
  workCompletedThisPeriod: number | null;
  materialsPresentlyStored: number | null;
  totalCompletedAndStored: number | null;
  percentComplete: number | null;
  balanceToFinish: number | null;
  retainage: number | null;
  costCode: string | null;
  createdAt: string | null;
}

export interface ProjectSqlPayAppDetail extends ProjectSqlPayApp {
  lines: ProjectSqlSovLine[];
}

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function datePart(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function text(value: string | null | undefined): string | null {
  return value ?? null;
}

export function mapPayAppItem(item: ProjectPayAppApiItem): ProjectSqlPayApp {
  return {
    id: item.id,
    projectId: item.projectId,
    jobNumber: item.jobNumber,
    payAppNumber: text(item.payAppNumber),
    billingPeriodStart: datePart(item.billingPeriodStart),
    billingPeriodEnd: datePart(item.billingPeriodEnd),
    applicationDate: datePart(item.applicationDate),
    contractSum: num(item.contractSum),
    netChangeByChangeOrders: num(item.netChangeByChangeOrders),
    contractSumToDate: num(item.contractSumToDate),
    totalCompletedStoredToDate: num(item.totalCompletedStoredToDate),
    retainageAmount: num(item.retainageAmount),
    totalEarnedLessRetainage: num(item.totalEarnedLessRetainage),
    previousCertificates: num(item.previousCertificates),
    currentPaymentDue: num(item.currentPaymentDue),
    balanceToFinish: num(item.balanceToFinish),
    status: text(item.status),
    notes: text(item.notes),
    sovLineCount: num(item.sovLineCount) ?? 0,
    sourceDocumentId: text(item.sourceDocumentId),
    createdAt: item.createdAt ?? null,
  };
}

export function mapSovLineItem(item: ProjectSovLineApiItem): ProjectSqlSovLine {
  return {
    id: item.id,
    payAppId: item.payAppId,
    projectId: item.projectId,
    lineNumber: text(item.lineNumber),
    description: text(item.description),
    scheduledValue: num(item.scheduledValue),
    workCompletedPrevious: num(item.workCompletedPrevious),
    workCompletedThisPeriod: num(item.workCompletedThisPeriod),
    materialsPresentlyStored: num(item.materialsPresentlyStored),
    totalCompletedAndStored: num(item.totalCompletedAndStored),
    percentComplete: num(item.percentComplete),
    balanceToFinish: num(item.balanceToFinish),
    retainage: num(item.retainage),
    costCode: text(item.costCode),
    createdAt: item.createdAt ?? null,
  };
}

export function mapPayAppsResponse(resp: ProjectPayAppsApiResponse): ProjectSqlPayApp[] {
  return (resp.items ?? []).map(mapPayAppItem);
}

export function mapPayAppDetailResponse(resp: ProjectPayAppDetailApiResponse): ProjectSqlPayAppDetail {
  return {
    ...mapPayAppItem(resp.item),
    lines: (resp.item.lines ?? []).map(mapSovLineItem),
  };
}
