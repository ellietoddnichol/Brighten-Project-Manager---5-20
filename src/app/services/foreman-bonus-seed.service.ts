import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { DataService } from './data.service';
import { auth } from '../firebase';
import seedBundle from '../data/foreman-bonus-seed.json';
import { Project } from '../models/types';
import {
  ForemanBonusPolicy,
  ForemanBonusRecord,
  ProjectForemanAssignment,
} from '../models/foreman-bonus.types';
import {
  computeForemanBonusAmounts,
  preserveHistoricalRecord,
  roundCurrency,
} from '../utils/foreman-bonus.compute';
import { findProjectMatches, normalizeProjectNumber, pickCanonicalProject } from '../utils/project-dedupe';

const SEED = seedBundle as ForemanBonusSeedBundle;
const IMPORTED_KEY = 'brighten.foremanBonusImportedAt';

interface ForemanBonusSeedBundle {
  meta: {
    generatedAt: string;
    reportLabel: string;
    reportPeriodStart: string;
    reportPeriodEnd: string;
  };
  policy: Omit<ForemanBonusPolicy, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;
  foremen: Array<{ name: string; employeeId?: string }>;
  summaries: Array<{
    foremanName: string;
    totalJobs: number;
    totalBonusEarnedToDate: number;
    previouslyPaid: number;
    payThisTerm: number;
    remainingPotential: number;
    bonusNumber?: number;
  }>;
  assignments: Array<{
    jobNumber: string;
    projectName: string;
    foremanName: string;
    role: ProjectForemanAssignment['role'];
    sharePercent: number;
    bonusRateOverride?: number;
    notes?: string;
  }>;
  records: Array<{
    jobNumber: string;
    projectName: string;
    foremanName: string;
    splitWith?: string;
    actualLaborCost: number;
    laborBudget: number;
    percentComplete: number;
    currentLaborBudget: number;
    laborSavings: number;
    bonusRate: number;
    foremanSharePercent: number;
    billingReleasePercent: number;
    previouslyPaid: number;
    payThisTerm: number;
    remainingPotential: number;
    notes?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ForemanBonusSeedService {
  private data = inject(DataService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);
  seedMeta = SEED.meta;

  async importIfNeeded(force = false): Promise<void> {
    const marker = localStorage.getItem(IMPORTED_KEY);
    if (!force && marker === SEED.meta.generatedAt) return;
    await this.syncForemanBonusSeed();
    localStorage.setItem(IMPORTED_KEY, SEED.meta.generatedAt);
  }

  async syncForemanBonusSeed(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in before importing foreman bonus seed.');

    this.syncing.set(true);
    this.lastMessage.set(null);

    try {
      const projects = await this.data.waitForProjectsLoaded();
      const employees = this.data.employeesSnapshot();
      const existingPolicies = this.data.foremanBonusPoliciesSnapshot();
      const existingAssignments = this.data.projectForemanAssignmentsSnapshot();
      const existingRecords = this.data.foremanBonusRecordsSnapshot();

      let policy = existingPolicies.find(p => p.name === SEED.policy.name);
      if (!policy) {
        policy = await firstValueFrom(this.data.createForemanBonusPolicy({
          ...SEED.policy,
          id: uuidv4(),
        }));
      }

      const projectByJob = new Map<string, Project>();
      for (const record of SEED.records) {
        const key = normalizeProjectNumber(record.jobNumber);
        if (projectByJob.has(key)) continue;
        const matches = findProjectMatches(projects, { projectNumber: record.jobNumber });
        if (matches.length) {
          projectByJob.set(key, pickCanonicalProject(matches));
        }
      }

      let assignmentsWritten = 0;
      let recordsWritten = 0;

      for (const assignment of SEED.assignments) {
        const project = projectByJob.get(normalizeProjectNumber(assignment.jobNumber));
        const employee = employees.find(e => e.name === assignment.foremanName);
        const exists = existingAssignments.some(a =>
          a.jobNumber === assignment.jobNumber
          && a.foremanName === assignment.foremanName
          && a.role === assignment.role,
        );
        if (exists) continue;

        await firstValueFrom(this.data.createProjectForemanAssignment({
          projectId: project?.id ?? `seed-job-${assignment.jobNumber}`,
          jobNumber: assignment.jobNumber,
          projectName: assignment.projectName,
          foremanEmployeeId: employee?.id,
          foremanName: assignment.foremanName,
          role: assignment.role,
          sharePercent: assignment.sharePercent,
          bonusEligible: true,
          bonusRateOverride: assignment.bonusRateOverride,
          notes: assignment.notes,
        }));
        assignmentsWritten++;
      }

      for (const seedRecord of SEED.records) {
        const project = projectByJob.get(normalizeProjectNumber(seedRecord.jobNumber));
        const employee = employees.find(e => e.name === seedRecord.foremanName);
        const exists = existingRecords.some(r =>
          r.source === 'ImportedHistorical'
          && r.jobNumber === seedRecord.jobNumber
          && r.foremanName === seedRecord.foremanName
          && r.reportPeriodEnd === SEED.meta.reportPeriodEnd,
        );
        if (exists) continue;

        const foremanShareBonus = roundCurrency(
          Math.max(seedRecord.laborSavings, 0) * seedRecord.bonusRate * seedRecord.foremanSharePercent,
        );

        const summary = SEED.summaries.find(s => s.foremanName === seedRecord.foremanName);

        const draft: ForemanBonusRecord = {
          id: uuidv4(),
          projectId: project?.id ?? `seed-job-${seedRecord.jobNumber}`,
          jobNumber: seedRecord.jobNumber,
          projectName: seedRecord.projectName,
          foremanEmployeeId: employee?.id,
          foremanName: seedRecord.foremanName,
          reportPeriodStart: SEED.meta.reportPeriodStart,
          reportPeriodEnd: SEED.meta.reportPeriodEnd,
          laborCostBasis: 'WagesPlusFringe',
          actualLaborCost: seedRecord.actualLaborCost,
          laborBudget: seedRecord.laborBudget,
          percentComplete: seedRecord.percentComplete,
          currentLaborBudget: seedRecord.currentLaborBudget,
          laborSavings: seedRecord.laborSavings,
          bonusRate: seedRecord.bonusRate,
          grossBonusEarned: roundCurrency(Math.max(seedRecord.laborSavings, 0) * seedRecord.bonusRate),
          foremanSharePercent: seedRecord.foremanSharePercent,
          foremanShareBonus,
          billingReleasePercent: seedRecord.billingReleasePercent,
          bonusAvailableToReceive: roundCurrency(foremanShareBonus * seedRecord.billingReleasePercent),
          previouslyPaid: seedRecord.previouslyPaid,
          payThisTerm: seedRecord.payThisTerm,
          remainingPotential: seedRecord.remainingPotential,
          status: 'Calculated',
          source: 'ImportedHistorical',
          notes: seedRecord.notes,
          bonusNumber: summary?.bonusNumber,
        };

        const projectAssignments = existingAssignments.filter(a => a.projectId === draft.projectId);
        const preserved = preserveHistoricalRecord(draft, policy, projectAssignments);
        await firstValueFrom(this.data.createForemanBonusRecord(preserved));
        recordsWritten++;
      }

      this.lastMessage.set(
        `Foreman bonus seed loaded · ${recordsWritten} records · ${assignmentsWritten} assignments`,
      );
    } finally {
      this.syncing.set(false);
    }
  }
}
