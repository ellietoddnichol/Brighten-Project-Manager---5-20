import { PO, Project, ProjectBudgetLine, TimeEntry } from '../models/types';
import { ProjectLaborActual } from '../models/labor-actual.types';
import { SubcontractorInvoice } from '../models/subcontractor.types';
import { BudgetLineType, PurchaseOrderStatus } from '../models/financial.types';
import { laborCostFromActuals } from './labor-actual.compute';
import {
  subcontractorActualCostForBudgetLine,
  subcontractorActualCostFromInvoices,
} from './subcontractor-invoice.compute';

import {
  BRIGHTEN_COST_BUDGET_RATIO,
  BRIGHTEN_PROFIT_TARGET,
  BUDGET_CATEGORY_SPLITS,
  jobBudgetTypeFor,
} from '../config/active-2026-jobs.config';
import { ProjectFinancial } from '../models/financial.types';

export { BRIGHTEN_PROFIT_TARGET, BRIGHTEN_COST_BUDGET_RATIO };

const DEFAULT_PROFIT_TARGET = BRIGHTEN_PROFIT_TARGET;

export const DEFAULT_BUDGET_CATEGORIES: Array<{ category: ProjectBudgetLine['category']; type: BudgetLineType; label: string }> = [
  { category: 'Labor', type: 'Labor', label: 'Self-Performed Labor' },
  { category: 'Materials', type: 'Material', label: 'Materials' },
  { category: 'Subcontractors', type: 'Subcontractor', label: 'Subcontractors' },
  { category: 'Equipment', type: 'Equipment', label: 'Equipment' },
  { category: 'General Conditions', type: 'GeneralConditions', label: 'General Conditions' },
  { category: 'Other', type: 'Other', label: 'Other' },
];

export function normalizePoStatus(status?: string): PurchaseOrderStatus {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'void') return 'Void';
  if (s === 'draft' || s === 'logged') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s.includes('partial')) return 'PartiallyInvoiced';
  return 'Issued';
}

export function poCountsAsCommitted(status: PurchaseOrderStatus): boolean {
  return status === 'Issued' || status === 'PartiallyInvoiced' || status === 'Closed';
}

export function poCommittedAmount(po: PO): number {
  const status = normalizePoStatus(po.status);
  if (!poCountsAsCommitted(status)) return 0;
  return po.committedAmount ?? po.originalAmount ?? 0;
}

export function poInvoicedAmount(po: PO): number {
  return po.invoicedAmount ?? 0;
}

export function poRemainingCommitment(po: PO): number {
  return Math.max(0, poCommittedAmount(po) - poInvoicedAmount(po));
}

export function derivePoStatus(po: PO): PurchaseOrderStatus {
  const normalized = normalizePoStatus(po.status);
  if (normalized === 'Void' || normalized === 'Draft' || normalized === 'Closed') return normalized;
  const committed = poCommittedAmount(po);
  const invoiced = poInvoicedAmount(po);
  if (invoiced > 0 && invoiced < committed) return 'PartiallyInvoiced';
  if (invoiced >= committed && committed > 0) return 'Closed';
  return normalized === 'PartiallyInvoiced' ? 'PartiallyInvoiced' : 'Issued';
}

export function lineBudgetAmount(line: ProjectBudgetLine): number {
  if (line.status === 'Void') return 0;
  return line.budgetAmount ?? line.revisedBudget ?? line.originalBudget ?? 0;
}

export function categoryToType(category: string): BudgetLineType {
  switch (category) {
    case 'Labor': return 'Labor';
    case 'Materials': return 'Material';
    case 'Subcontractors': return 'Subcontractor';
    case 'Equipment': return 'Equipment';
    case 'General Conditions': return 'GeneralConditions';
    default: return 'Other';
  }
}

export function typeToCategory(type: BudgetLineType): ProjectBudgetLine['category'] {
  switch (type) {
    case 'Labor': return 'Labor';
    case 'Material': return 'Materials';
    case 'Subcontractor': return 'Subcontractors';
    case 'Equipment': return 'Equipment';
    case 'GeneralConditions': return 'General Conditions';
    default: return 'Other';
  }
}

export interface ComputedBudgetLine extends ProjectBudgetLine {
  budgetAmount: number;
  committedAmount: number;
  projectedCost: number;
  costToComplete: number;
  variance: number;
}

export interface BudgetRollup {
  lines: ComputedBudgetLine[];
  budgetAmount: number;
  committedAmount: number;
  costToDate: number;
  estimatedFinalCost: number;
  costToComplete: number;
  budgetIsEstimated: boolean;
  budgetBasis: ProjectFinancial['budgetBasis'];
  selfPerformedBudget: number;
  subcontractorBudget: number;
  materialBudget: number;
  equipmentBudget: number;
  otherBudget: number;
  selfPerformedCostToDate: number;
  subcontractorCostToDate: number;
  materialCostToDate: number;
  equipmentCostToDate: number;
  otherCostToDate: number;
}

export function laborCostFromTimeEntries(_projectId: string, _entries: TimeEntry[]): number {
  return 0;
}

export function computeBudgetRollup(
  project: Project,
  lines: ProjectBudgetLine[],
  pos: PO[],
  timeEntries: TimeEntry[] = [],
  laborActuals: ProjectLaborActual[] = [],
  subcontractorInvoices: SubcontractorInvoice[] = [],
): BudgetRollup {
  const projectId = project.id;
  const activeLines = lines.filter(l => l.projectId === projectId && l.status !== 'Void');
  const projectPos = pos.filter(p => p.projectId === projectId && normalizePoStatus(p.status) !== 'Void');

  const laborFromActuals = laborCostFromActuals(projectId, laborActuals);
  const subFromInvoices = subcontractorActualCostFromInvoices(projectId, subcontractorInvoices);
  const laborLines = activeLines.filter(l => l.category === 'Labor');
  const laborActualTotal = laborLines.reduce((s, l) => s + (l.actualCost ?? 0), 0);

  const computedLines: ComputedBudgetLine[] = activeLines.map(line => {
    const budgetAmount = lineBudgetAmount(line);
    const linkedPos = projectPos.filter(p =>
      p.linkedBudgetLineId === line.id
      || (!p.linkedBudgetLineId && p.category === line.category),
    );

    const committedAmount = linkedPos.reduce((s, po) => s + poCommittedAmount(po), 0);
    const invoicedFromPos = linkedPos.reduce((s, po) => s + poInvoicedAmount(po), 0);

    let actualCost = line.actualCost ?? 0;
    if (line.source !== 'Manual') {
      if (line.category === 'Labor' && !actualCost && laborFromActuals > 0) {
        if (laborLines.length === 1) {
          actualCost = laborFromActuals;
        } else if (laborActualTotal === 0) {
          actualCost = laborFromActuals / laborLines.length;
        }
      }
      if (line.category === 'Subcontractors') {
        const subLineCost = subcontractorActualCostForBudgetLine(projectId, line.id, subcontractorInvoices);
        if (subLineCost > 0) actualCost = Math.max(actualCost, subLineCost);
        else if (!actualCost && subFromInvoices > 0 && activeLines.filter(l => l.category === 'Subcontractors').length === 1) {
          actualCost = subFromInvoices;
        }
      }
      if (invoicedFromPos > 0) {
        actualCost = Math.max(actualCost, invoicedFromPos);
      }
    }

    const remainingCommitment = linkedPos.reduce((s, po) => s + poRemainingCommitment(po), 0);
    const manualCtc = line.costToComplete ?? 0;
    const projectedCost = actualCost + remainingCommitment + manualCtc;
    const costToComplete = Math.max(0, projectedCost - actualCost);
    const variance = budgetAmount - projectedCost;

    return {
      ...line,
      budgetAmount,
      committedAmount,
      actualCost,
      projectedCost,
      projectedFinalCost: projectedCost,
      costToComplete,
      variance,
      type: line.type ?? categoryToType(line.category),
    };
  });

  let budgetAmount = computedLines.reduce((s, l) => s + l.budgetAmount, 0);
  let budgetIsEstimated = computedLines.some(l => l.isEstimated);
  let budgetBasis: ProjectFinancial['budgetBasis'] = budgetIsEstimated
    ? 'EstimatedFrom20PercentTarget'
    : budgetAmount > 0
      ? (computedLines.some(l => l.importSource === 'job-cost-budget') ? 'Imported' : 'Manual')
      : undefined;

  const currentContract = (project.originalContractAmount ?? 0);
  if (!budgetAmount && currentContract > 0) {
    budgetAmount = currentContract * BRIGHTEN_COST_BUDGET_RATIO;
    budgetIsEstimated = true;
    budgetBasis = 'EstimatedFrom20PercentTarget';
  } else if (!budgetAmount && project.estCostBudget) {
    budgetAmount = project.estCostBudget;
    budgetBasis = 'Manual';
  } else if (!budgetAmount && !currentContract) {
    budgetBasis = 'MissingContract';
  }

  let costToDate = computedLines.reduce((s, l) => s + l.actualCost, 0);
  if (!costToDate) {
    costToDate = project.actualCostToDate ?? project.qboProjectsCost ?? 0;
  }

  let estimatedFinalCost = computedLines.reduce((s, l) => s + l.projectedCost, 0);
  if (!estimatedFinalCost) {
    estimatedFinalCost = (project.estCostBudget ?? budgetAmount) || costToDate;
  }

  const costToComplete = Math.max(0, estimatedFinalCost - costToDate);
  const committedAmount = computedLines.reduce((s, l) => s + l.committedAmount, 0);

  const sumByCategory = (cat: ProjectBudgetLine['category'], field: 'budgetAmount' | 'actualCost') =>
    computedLines.filter(l => l.category === cat).reduce((s, l) => s + l[field], 0);

  let selfPerformedBudget = sumByCategory('Labor', 'budgetAmount');
  let subcontractorBudget = sumByCategory('Subcontractors', 'budgetAmount');
  let materialBudget = sumByCategory('Materials', 'budgetAmount');
  let equipmentBudget = sumByCategory('Equipment', 'budgetAmount');
  let otherBudget = sumByCategory('Other', 'budgetAmount') + sumByCategory('General Conditions', 'budgetAmount');

  if (budgetIsEstimated && budgetAmount > 0 && !selfPerformedBudget && !subcontractorBudget && !materialBudget) {
    const split = BUDGET_CATEGORY_SPLITS[jobBudgetTypeFor(project.projectNumber, project.billingType)];
    selfPerformedBudget = budgetAmount * split.labor;
    subcontractorBudget = budgetAmount * split.subs;
    materialBudget = budgetAmount * split.materials;
    const equipmentOther = budgetAmount * split.equipmentOther;
    equipmentBudget = equipmentOther * 0.5;
    otherBudget = equipmentOther * 0.5;
  }

  const selfPerformedCostToDate = project.qboLaborCost
    ?? (sumByCategory('Labor', 'actualCost') || laborFromActuals);
  const subcontractorCostToDate = project.qboSubCost
    ?? (sumByCategory('Subcontractors', 'actualCost') || subFromInvoices);
  const materialCostToDate = project.qboMaterialCost ?? sumByCategory('Materials', 'actualCost');
  const equipmentCostToDate = project.qboEquipmentCost ?? sumByCategory('Equipment', 'actualCost');
  const otherCostToDate = project.qboOtherCost ?? sumByCategory('Other', 'actualCost') + sumByCategory('General Conditions', 'actualCost');

  return {
    lines: computedLines,
    budgetAmount,
    committedAmount,
    costToDate,
    estimatedFinalCost,
    costToComplete,
    budgetIsEstimated,
    budgetBasis,
    selfPerformedBudget,
    subcontractorBudget,
    materialBudget,
    equipmentBudget,
    otherBudget,
    selfPerformedCostToDate,
    subcontractorCostToDate,
    materialCostToDate,
    equipmentCostToDate,
    otherCostToDate,
  };
}

export function nextPoNumber(projectId: string, pos: PO[]): string {
  let max = 0;
  for (const po of pos.filter(p => p.projectId === projectId)) {
    const match = po.poNumber?.match(/PO-(\d+)/i);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `PO-${String(max + 1).padStart(3, '0')}`;
}
