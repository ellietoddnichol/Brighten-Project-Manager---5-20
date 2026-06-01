import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Billing, ChangeOrder, PO, Project, ProjectBudgetLine } from '../models/types';
import { ProjectLaborActual } from '../models/labor-actual.types';
import {
  ForemanBonusPolicy,
  ForemanBonusRecord,
  ProjectForemanAssignment,
} from '../models/foreman-bonus.types';
import { DataService } from './data.service';
import { LaborCodeMappingService } from './labor-code-mapping.service';
import {
  actualLaborCostFromBasis,
  billingReleasePercent,
  bonusTaskDescriptors,
  buildCalculatedForemanBonusRecord,
  detectForemanBonusFlags,
  laborBudgetFromLines,
  percentCompleteDecimal,
  preserveHistoricalRecord,
} from '../utils/foreman-bonus.compute';
import { buildProjectFinancial, safeDivide } from '../utils/project-financial.compute';
import { ARRecord } from '../models/financial.types';
import { SubcontractorInvoice } from '../models/subcontractor.types';

@Injectable({ providedIn: 'root' })
export class ForemanBonusService {
  private data = inject(DataService);
  private laborCodeMapping = inject(LaborCodeMappingService);

  policies(): ForemanBonusPolicy[] {
    return this.data.foremanBonusPoliciesSnapshot();
  }

  activePolicy(): ForemanBonusPolicy {
    return this.policies().find(p => p.active)
      ?? {
        id: 'default',
        name: 'Brighten Foreman Labor Savings Bonus',
        defaultBonusRate: 0.10,
        laborCostBasis: 'WagesPlusFringe',
        releaseBasis: 'BilledPercent',
        defaultPayoutTiming: 'Quarterly',
        allowSplits: true,
        allowNegativePayThisTerm: false,
        active: true,
      };
  }

  assignments(): ProjectForemanAssignment[] {
    return this.data.projectForemanAssignmentsSnapshot();
  }

  records(): ForemanBonusRecord[] {
    return this.data.foremanBonusRecordsSnapshot();
  }

  forProject(projectId: string): ForemanBonusRecord[] {
    return this.records().filter(r => r.projectId === projectId);
  }

  assignmentsForProject(projectId: string): ProjectForemanAssignment[] {
    return this.assignments().filter(a => a.projectId === projectId && a.bonusEligible);
  }

  enrichRecord(
    record: ForemanBonusRecord,
    policy = this.activePolicy(),
    assignments = this.assignments(),
  ): ForemanBonusRecord {
    if (record.source === 'ImportedHistorical') {
      return preserveHistoricalRecord(record, policy, assignments);
    }
    return buildCalculatedForemanBonusRecord(record, policy);
  }

  flagsForRecord(record: ForemanBonusRecord): ReturnType<typeof detectForemanBonusFlags> {
    const policy = this.activePolicy();
    const assignments = this.assignmentsForProject(record.projectId);
    const enriched = this.enrichRecord(record, policy, assignments);
    return detectForemanBonusFlags(enriched, assignments, policy);
  }

  taskDescriptorsForRecord(record: ForemanBonusRecord) {
    return bonusTaskDescriptors(record, this.flagsForRecord(record));
  }

  buildDraftForAssignment(
    project: Project,
    assignment: ProjectForemanAssignment,
    ctx: {
      budgetLines: ProjectBudgetLine[];
      laborActuals: ProjectLaborActual[];
      changeOrders: ChangeOrder[];
      billings: Billing[];
      pos: PO[];
      arRecords: ARRecord[];
      subcontractorInvoices: SubcontractorInvoice[];
      reportPeriodStart?: string;
      reportPeriodEnd?: string;
      previouslyPaid?: number;
    },
    policy = this.activePolicy(),
  ): ForemanBonusRecord {
    const projectActuals = ctx.laborActuals.filter(a => a.projectId === project.id);
    const bonusCost = this.laborCodeMapping.bonusEligibleCostForProject(project.id, projectActuals);
    const wages = bonusCost.wages;
    const fringe = bonusCost.fringe;
    const actualLaborCost = actualLaborCostFromBasis(policy.laborCostBasis, wages, fringe);
    const laborBudget = laborBudgetFromLines(project.id, ctx.budgetLines) || project.estLaborCost || 0;
    const financial = buildProjectFinancial(
      project,
      ctx.changeOrders,
      ctx.billings,
      ctx.budgetLines,
      ctx.pos,
      [],
      ctx.arRecords,
      ctx.laborActuals,
      ctx.subcontractorInvoices,
    );
    const costPercentComplete = Math.min(100, safeDivide(financial.costToDate, financial.estimatedFinalCost) * 100);
    const pctComplete = percentCompleteDecimal(project, costPercentComplete) ?? 0;
    const releasePct = billingReleasePercent(
      financial.billedToDate,
      financial.currentContractAmount,
      assignment.releasePercentOverride,
    );

    return buildCalculatedForemanBonusRecord({
      id: uuidv4(),
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      foremanEmployeeId: assignment.foremanEmployeeId,
      foremanName: assignment.foremanName,
      reportPeriodStart: ctx.reportPeriodStart,
      reportPeriodEnd: ctx.reportPeriodEnd,
      laborCostBasis: policy.laborCostBasis,
      wagesAmount: wages,
      fringeAmount: fringe,
      actualLaborCost,
      laborBudget,
      percentComplete: pctComplete,
      bonusRate: assignment.bonusRateOverride ?? policy.defaultBonusRate,
      foremanSharePercent: assignment.sharePercent,
      billingReleasePercent: releasePct,
      previouslyPaid: ctx.previouslyPaid ?? 0,
      source: 'App',
      notes: assignment.notes,
    }, policy);
  }

  async saveRecord(record: ForemanBonusRecord): Promise<ForemanBonusRecord> {
    const policy = this.activePolicy();
    const enriched = this.enrichRecord(record, policy);
    if (record.id) {
      return firstValueFrom(this.data.updateForemanBonusRecord(record.id, enriched));
    }
    return firstValueFrom(this.data.createForemanBonusRecord({ ...enriched, id: uuidv4() }));
  }

  async recalculateProject(project: Project): Promise<ForemanBonusRecord[]> {
    const assignments = this.assignmentsForProject(project.id);
    const ctx = {
      budgetLines: this.data.budgetLinesSnapshot(),
      laborActuals: this.data.projectLaborActualsSnapshot(),
      changeOrders: this.data.changeOrdersSnapshot(),
      billings: this.data.billingsSnapshot(),
      pos: this.data.posSnapshot(),
      arRecords: this.data.arRecordsSnapshot(),
      subcontractorInvoices: this.data.subcontractorInvoicesSnapshot(),
      reportPeriodEnd: new Date().toISOString().slice(0, 10),
    };

    const saved: ForemanBonusRecord[] = [];
    for (const assignment of assignments) {
      const existing = this.forProject(project.id).find(r =>
        r.foremanName === assignment.foremanName && r.source !== 'ImportedHistorical',
      );
      const previouslyPaid = existing?.previouslyPaid ?? 0;
      const draft = this.buildDraftForAssignment(project, assignment, { ...ctx, previouslyPaid });
      if (existing) {
        saved.push(await firstValueFrom(this.data.updateForemanBonusRecord(existing.id, draft)));
      } else {
        saved.push(await firstValueFrom(this.data.createForemanBonusRecord(draft)));
      }
    }
    return saved;
  }
}
