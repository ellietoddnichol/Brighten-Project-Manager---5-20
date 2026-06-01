import { Injectable } from '@angular/core';
import {
  NormalizedChangeLog,
  NormalizedInvoice,
  NormalizedMonthlyBilling,
  NormalizedProject,
  NormalizedWorkbookData,
} from '../models/normalized-workbook';
import { PortfolioMetrics, computePortfolioMetrics, getProjectFinancialSummary } from '../utils/financial';
import { ChangeOrder, Billing, Project } from '../models/types';
import { workbookToLegacyCollections } from '../utils/sheet-normalizers';
import { isOverheadJob, isOverheadJobLabel } from '../utils/project';

export interface ProjectCalculatedSummary {
  projectId: string;
  originalContract: number;
  revisedContract: number;
  approvedChanges: number;
  pendingChanges: number;
  approvedChangesNotBilled: number;
  billedToDate: number;
  paidToDate: number;
  openAR: number;
  remainingToBill: number;
  budgetTotal: number;
  actualTotal: number;
  selfPerformedAmount: number;
  subcontractorAmount: number;
  vendorMaterialAmount: number;
  projectedFinalCost: number;
  variance: number;
  forecastBilling2026: number;
}

export interface DashboardData {
  metrics: PortfolioMetrics;
  projects: NormalizedProject[];
  activeProjects: NormalizedProject[];
  legacyProjects: Project[];
  legacyChangeOrders: ChangeOrder[];
  legacyBillings: Billing[];
}

export interface MonthlyBillingPoint {
  month: string;
  contract: number;
  changes: number;
}

@Injectable({ providedIn: 'root' })
export class ProjectCalculationsService {
  calculateProjectSummary(
    project: NormalizedProject,
    changes: NormalizedChangeLog[],
    invoices: NormalizedInvoice[],
    monthlyBilling: NormalizedMonthlyBilling[],
  ): ProjectCalculatedSummary {
    const projectChanges = changes.filter(c => c.projectId === project.projectId);
    const projectInvoices = invoices.filter(i => i.projectId === project.projectId);
    const projectMonthly = monthlyBilling.filter(m => m.projectId === project.projectId);

    const approvedChanges = projectChanges
      .filter(c => c.status === 'Approved')
      .reduce((s, c) => s + c.approvedAmount, 0);
    const pendingChanges = projectChanges
      .filter(c => !['Approved', 'Rejected', 'Void'].includes(c.status))
      .reduce((s, c) => s + (c.submittedAmount || c.approvedAmount), 0);
    const billedChangeAmount = projectChanges.reduce((s, c) => s + c.billedAmount, 0);
    const approvedChangesNotBilled = Math.max(0, approvedChanges - billedChangeAmount);

    const billedToDate = projectInvoices.reduce((s, i) => s + i.grossBilled, 0) || project.billedToDate;
    const paidToDate = projectInvoices.reduce((s, i) => s + i.paid, 0);
    const revisedContract = project.revisedContract || project.originalContract + approvedChanges;
    const openAR = projectInvoices.reduce((s, i) => s + i.arBalance, 0) || project.openAR || Math.max(0, billedToDate - paidToDate);
    const remainingToBill = Math.max(0, revisedContract - billedToDate);

    const ytdBilled = projectMonthly.reduce((s, m) => s + m.contractBilling + m.changeBilling, 0);
    const forecastRemaining = projectMonthly.reduce((s, m) => s + m.forecastBilling, 0);

    return {
      projectId: project.projectId,
      originalContract: project.originalContract,
      revisedContract,
      approvedChanges,
      pendingChanges,
      approvedChangesNotBilled,
      billedToDate,
      paidToDate,
      openAR,
      remainingToBill,
      budgetTotal: project.budgetTotal ?? 0,
      actualTotal: project.actualTotal ?? 0,
      selfPerformedAmount: project.selfPerformedAmount ?? 0,
      subcontractorAmount: project.subcontractorAmount ?? 0,
      vendorMaterialAmount: project.vendorMaterialAmount ?? 0,
      projectedFinalCost: project.projectedFinalCost ?? project.actualTotal ?? 0,
      variance: project.variance ?? 0,
      forecastBilling2026: ytdBilled + forecastRemaining,
    };
  }

  calculatePortfolioMetrics(data: NormalizedWorkbookData): PortfolioMetrics {
    const legacy = workbookToLegacyCollections(data);
    const jobProjects = legacy.projects.filter(
      p => !isOverheadJob(p) && !isOverheadJobLabel(p.projectNumber) && !isOverheadJobLabel(p.projectName),
    );
    return computePortfolioMetrics(jobProjects, legacy.changeOrders, legacy.billings);
  }

  buildDashboardData(data: NormalizedWorkbookData): DashboardData {
    const legacy = workbookToLegacyCollections(data);
    const metrics = this.calculatePortfolioMetrics(data);
    const activeProjects = data.projects.filter(
      p => !isOverheadJobLabel(p.projectNo) && !isOverheadJobLabel(p.projectName) && p.status !== 'Closed',
    );

    return {
      metrics,
      projects: data.projects,
      activeProjects,
      legacyProjects: legacy.projects,
      legacyChangeOrders: legacy.changeOrders,
      legacyBillings: legacy.billings,
    };
  }

  buildMonthlyBillingSeries(data: NormalizedWorkbookData): MonthlyBillingPoint[] {
    const byMonth = new Map<string, { contract: number; changes: number }>();
    for (const row of data.monthlyBilling) {
      const bucket = byMonth.get(row.month) ?? { contract: 0, changes: 0 };
      bucket.contract += row.contractBilling;
      bucket.changes += row.changeBilling;
      byMonth.set(row.month, bucket);
    }
    if (byMonth.size === 0) {
      for (const inv of data.invoices) {
        const month = inv.billingPeriod.slice(0, 7) || inv.billingPeriod;
        const bucket = byMonth.get(month) ?? { contract: 0, changes: 0 };
        bucket.contract += inv.grossBilled;
        byMonth.set(month, bucket);
      }
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({ month, contract: v.contract, changes: v.changes }));
  }

  getLegacyFinancialSummary(project: Project, data: NormalizedWorkbookData) {
    const cos = data.changes.filter(c => c.projectId === project.id).map(c => ({
      id: c.id,
      projectId: c.projectId,
      coNumber: c.changeNo,
      title: c.title,
      status: c.status as ChangeOrder['status'],
      approvedAmount: c.approvedAmount,
      sellPrice: c.submittedAmount,
    })) as ChangeOrder[];
    const bills = data.invoices.filter(i => i.projectId === project.id).map(i => ({
      id: i.id,
      projectId: i.projectId,
      payAppNumber: i.invoiceNo,
      billingPeriod: i.billingPeriod,
      status: i.status as Billing['status'],
      totalBilledToDate: i.grossBilled,
      amountPaid: i.paid,
      workCompletedThisPeriod: i.grossBilled,
    })) as Billing[];
    return getProjectFinancialSummary(project, cos, bills);
  }
}
