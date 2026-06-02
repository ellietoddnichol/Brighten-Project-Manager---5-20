import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { Project } from '../models/types';
import {
  WipSetupImportResult,
  WipSetupProjectRow,
  WipSetupSeed,
} from '../models/wip-setup.types';
import setupSeed from '../data/seeds/wip-setup-june-2026-seed.json';
import { findProjectMatches } from '../utils/project-dedupe';
import {
  billingTypeFromProfileLabel,
  deriveCertifiedPayrollRequired,
  isWaitingOnArSetupStatus,
  mapSetupProfileLabel,
  resolveDefaultForeman,
} from '../utils/project-setup.util';
import { normalizeJobNumber } from '../config/active-2026-jobs.config';

@Injectable({ providedIn: 'root' })
export class WipSetupImportService {
  private data = inject(DataService);

  running = signal(false);
  lastMessage = signal<string | null>(null);

  seed(): WipSetupSeed {
    return setupSeed as WipSetupSeed;
  }

  async importFromSeed(): Promise<WipSetupImportResult> {
    if (this.running()) {
      return { projectsPatched: 0, foremanDefaultsApplied: 0, unmatched: 0 };
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: WipSetupImportResult = {
      projectsPatched: 0,
      foremanDefaultsApplied: 0,
      unmatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      const projects = this.data.projectsSnapshot();

      for (const row of this.seed().projects) {
        const project = this.matchProject(projects, row);
        if (!project) {
          result.unmatched++;
          continue;
        }

        const patch = this.patchFromRow(row, project);
        if (!Object.keys(patch).length) continue;

        await firstValueFrom(this.data.updateProject(project.id, patch));
        result.projectsPatched++;
        if (patch.superintendent && !project.superintendent?.trim()) {
          result.foremanDefaultsApplied++;
        }
      }

      this.lastMessage.set(
        `WIP setup import: ${result.projectsPatched} job(s) updated`
        + (result.foremanDefaultsApplied ? `, ${result.foremanDefaultsApplied} foreman default(s)` : '')
        + (result.unmatched ? `, ${result.unmatched} unmatched` : ''),
      );
      return result;
    } finally {
      this.running.set(false);
    }
  }

  private matchProject(projects: Project[], row: WipSetupProjectRow): Project | undefined {
    const job = normalizeJobNumber(row.jobNumber);
    const matches = findProjectMatches(projects, {
      projectNumber: job,
      projectName: row.projectName,
    });
    return matches[0];
  }

  private patchFromRow(row: WipSetupProjectRow, project: Project): Partial<Project> {
    const prevailingWage = row.prevailingWage ?? false;
    const patch: Partial<Project> = {};

    if (row.address?.trim()) patch.address = row.address.trim();
    if (row.county?.trim()) patch.county = row.county.trim();
    if (row.customer?.trim()) patch.customer = row.customer.trim();

    if (row.originalContractAmount != null && row.originalContractAmount > 0) {
      patch.originalContractAmount = row.originalContractAmount;
    }

    if (row.profileLabel) {
      patch.projectProfile = mapSetupProfileLabel(row.profileLabel, prevailingWage);
      const billingType = row.billingType ?? billingTypeFromProfileLabel(row.profileLabel);
      if (billingType) patch.billingType = billingType;
    }

    patch.prevailingWage = prevailingWage;
    patch.certifiedPayrollRequired = deriveCertifiedPayrollRequired(prevailingWage);

    const foreman = row.foreman?.trim() || resolveDefaultForeman({ ...project, ...patch });
    if (foreman && !project.superintendent?.trim()) {
      patch.superintendent = foreman;
    }

    if (isWaitingOnArSetupStatus(row.arStatus)) {
      patch.wipGroupOverride = 'CloseoutAR';
      patch.wipForecastNotes = row.arStatus;
    }

    return patch;
  }
}
