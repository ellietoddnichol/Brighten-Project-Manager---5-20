import { describe, expect, it } from 'vitest';
import {
  assignWipGroup,
  buildWipRecord,
  budgetBasisDisplayLabel,
  isQuietCompleteRecord,
  resolveEstimatedFinalCost,
} from '@features/financials/utils/wip.compute';
import { computeProjectLifecycle } from '@features/projects/utils/project-lifecycle.compute';
import { ProjectFinancial, WIPRecord } from '@app/models/financial.types';
import { Project } from '@app/models/types';
import { ProjectLifecycleSnapshot } from '@app/models/project-lifecycle.types';

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    projectNumber: '204',
    projectName: 'LightEdge',
    customer: 'Customer',
    status: 'Active',
    originalContractAmount: 100000,
    ...overrides,
  } as Project;
}

function baseFinancial(overrides: Partial<ProjectFinancial> = {}): ProjectFinancial {
  return {
    id: 'p1',
    projectId: 'p1',
    originalContractAmount: 100000,
    approvedChangeOrderAmount: 0,
    pendingChangeOrderAmount: 0,
    currentContractAmount: 100000,
    budgetAmount: 80000,
    estimatedFinalCost: 80000,
    costToDate: 40000,
    costToComplete: 40000,
    earnedRevenue: 50000,
    billedToDate: 60000,
    priorBilled: 0,
    currentBilling: 0,
    retainageHeld: 0,
    arBalance: 0,
    overUnderBilling: 10000,
    leftToBill: 40000,
    forecastGrossProfit: 20000,
    forecastMargin: 20,
    selfPerformedBudget: 20000,
    subcontractorBudget: 0,
    materialBudget: 0,
    equipmentBudget: 0,
    otherBudget: 0,
    selfPerformedCostToDate: 40000,
    subcontractorCostToDate: 0,
    materialCostToDate: 0,
    equipmentCostToDate: 0,
    otherCostToDate: 0,
    status: 'Active',
    source: 'App',
    needsReview: false,
    budgetIsEstimated: true,
    budgetBasis: 'EstimatedFrom20PercentTarget',
    ...overrides,
  };
}

function activeLifecycle(project = baseProject()): ProjectLifecycleSnapshot {
  return computeProjectLifecycle({ project });
}

describe('wip.compute', () => {
  it('labels estimated 80% budget basis', () => {
    expect(budgetBasisDisplayLabel(baseFinancial())).toBe('Estimated 80%');
  });

  it('uses actual cost as EFC when cost exceeds budget', () => {
    const efc = resolveEstimatedFinalCost(baseProject(), baseFinancial({
      costToDate: 95000,
      budgetAmount: 80000,
      estimatedFinalCost: 80000,
    }));
    expect(efc).toBe(95000);
  });

  it('assigns closed job with AR to Closeout AR', () => {
    const ctx = {
      project: baseProject({ status: 'Closed' }),
      financial: baseFinancial({ arBalance: 5000, leftToBill: 0 }),
      changeOrders: [],
      billings: [],
      arRecords: [],
      lifecycle: {
        includeInCloseoutAr: true,
        includeInActiveWip: false,
        projectLifecycleGroup: 'Closeout',
      } as ProjectLifecycleSnapshot,
    };
    expect(assignWipGroup(ctx, [])).toBe('CloseoutAR');
  });

  it('keeps active job in Active WIP even when needs review', () => {
    const record = buildWipRecord({
      project: baseProject(),
      financial: baseFinancial({ forecastMargin: 10 }),
      changeOrders: [],
      billings: [],
      arRecords: [],
      lifecycle: activeLifecycle(),
      sourceFlags: {
        qbHasArAgingTab: true,
        qbHasCostDetailTab: true,
        projectIdsWithLaborActuals: new Set(['p1']),
      },
    });
    expect(record.wipGroup).toBe('ActiveWIP');
    expect(record.needsReview).toBe(true);
    expect(record.warningChips?.some(c => c.label === 'Margin under 20%')).toBe(true);
  });

  it('does not use AR in earned revenue', () => {
    const record = buildWipRecord({
      project: baseProject(),
      financial: baseFinancial({ arBalance: 25000, billedToDate: 60000, costToDate: 40000 }),
      changeOrders: [],
      billings: [],
      arRecords: [],
      lifecycle: activeLifecycle(),
    });
    expect(record.earnedRevenue).toBeLessThan(record.billedToDate);
    expect(record.arBalance).toBe(25000);
  });

  it('marks quiet complete archived jobs', () => {
    const record = {
      wipGroup: 'ExcludedArchive',
      arBalance: 0,
      leftToBill: 0,
      percentComplete: 100,
      billedToDate: 100000,
      contractAmount: 100000,
    } as WIPRecord;
    expect(isQuietCompleteRecord(record)).toBe(true);
  });

  it('derives next action for estimated budget', () => {
    const record = buildWipRecord({
      project: baseProject(),
      financial: baseFinancial(),
      changeOrders: [],
      billings: [],
      arRecords: [],
      lifecycle: activeLifecycle(),
      sourceFlags: {
        qbHasArAgingTab: true,
        qbHasCostDetailTab: true,
        projectIdsWithLaborActuals: new Set(['p1']),
      },
    });
    expect(record.nextAction).toBeTruthy();
  });
});
