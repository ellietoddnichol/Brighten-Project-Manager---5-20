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
import { normalizeJobNumber, active2026JobMeta } from '../config/active-2026-jobs.config';
import {
  inferImportedProjectCreateFields,
  mergeImportProjectPatch,
  shouldCreateProjectFromImport,
} from '../utils/lifecycle-import.guard';

function driveFolderIdFromUrl(url?: string): string | undefined {
  if (!url?.trim()) return undefined;
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match?.[1];
}

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
      return { projectsPatched: 0, projectsCreated: 0, foremanDefaultsApplied: 0, unmatched: 0 };
    }

    this.running.set(true);
    this.lastMessage.set(null);
    const result: WipSetupImportResult = {
      projectsPatched: 0,
      projectsCreated: 0,
      foremanDefaultsApplied: 0,
      unmatched: 0,
    };

    try {
      await this.data.waitForProjectsLoaded();
      let projects = this.data.projectsSnapshot();

      for (const row of this.seed().projects) {
        const project = await this.ensureProject(row, projects, result);
        if (!project) {
          result.unmatched++;
          continue;
        }
        projects = this.data.projectsSnapshot();

        const patch = this.patchFromRow(row, project);
        if (!Object.keys(patch).length) continue;

        await firstValueFrom(this.data.updateProject(project.id, patch));
        result.projectsPatched++;
        if (patch.superintendent && !project.superintendent?.trim()) {
          result.foremanDefaultsApplied++;
        }
      }

      this.lastMessage.set(
        `WIP setup import: ${result.projectsCreated} created, ${result.projectsPatched} updated`
        + (result.foremanDefaultsApplied ? `, ${result.foremanDefaultsApplied} foreman default(s)` : '')
        + (result.unmatched ? `, ${result.unmatched} unmatched` : ''),
      );
      return result;
    } finally {
      this.running.set(false);
    }
  }

  private async ensureProject(
    row: WipSetupProjectRow,
    projects: Project[],
    result: WipSetupImportResult,
  ): Promise<Project | undefined> {
    let match = this.matchProject(projects, row);
    if (!match && shouldCreateProjectFromImport(row.jobNumber)) {
      const meta = active2026JobMeta(row.jobNumber);
      try {
        const created = await firstValueFrom(this.data.createProject({
          projectNumber: row.jobNumber,
          projectName: row.projectName ?? meta?.project ?? `Job ${row.jobNumber}`,
          customer: row.customer?.trim() || 'TBD',
          ...inferImportedProjectCreateFields(row.jobNumber),
          status: 'Active',
        }));
        match = created as Project;
        result.projectsCreated++;
        return match;
      } catch {
        return undefined;
      }
    }
    return match;
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

    if (row.projectName?.trim()) patch.projectName = row.projectName.trim();
    if (row.address?.trim()) patch.address = row.address.trim();
    if (row.county?.trim()) patch.county = row.county.trim();
    if (row.customer?.trim()) patch.customer = row.customer.trim();

    if (!row.contractTbd && !row.contractPending && row.originalContractAmount != null && row.originalContractAmount > 0) {
      const { patch: contractPatch } = mergeImportProjectPatch(project, {
        originalContractAmount: row.originalContractAmount,
      });
      if (contractPatch.originalContractAmount != null) {
        patch.originalContractAmount = contractPatch.originalContractAmount;
      }
    }

    if (row.contractPending || row.contractTbd) {
      patch.contractPending = true;
      patch.contractPendingNote = row.contractPendingNote?.trim()
        ?? 'Pending — waiting on awarded contract / proposal amount.';
    }

    if (row.billingNotStarted) {
      patch.billingNotStarted = true;
    }

    if (row.profileLabel) {
      patch.projectProfile = mapSetupProfileLabel(row.profileLabel, prevailingWage);
      const billingType = row.billingType ?? billingTypeFromProfileLabel(row.profileLabel);
      if (billingType) patch.billingType = billingType;
    }

    patch.prevailingWage = prevailingWage;
    patch.certifiedPayrollRequired = deriveCertifiedPayrollRequired(prevailingWage);

    if (row.taxExempt != null) patch.taxExempt = row.taxExempt;

    const foreman = row.foreman?.trim() || resolveDefaultForeman({ ...project, ...patch });
    if (foreman && !project.superintendent?.trim()) {
      patch.superintendent = foreman;
    }

    const folderId = driveFolderIdFromUrl(row.driveFolderUrl);
    if (folderId && !project.driveFolderId) {
      patch.driveFolderId = folderId;
      patch.driveFolderUrl = row.driveFolderUrl;
    }

    if (row.targetCompletionDate?.trim()) {
      patch.targetCompletionDate = row.targetCompletionDate.trim().slice(0, 10);
    }

    if (isWaitingOnArSetupStatus(row.arStatus)) {
      patch.wipGroupOverride = 'CloseoutAR';
      patch.wipForecastNotes = row.arStatus;
    }

    if (row.setupComplete) {
      patch.seedCompletenessStatus = 'Complete';
    }

    if (row.setupNotes?.trim()) {
      patch.scopeSummary = row.setupNotes.trim();
    }

    return patch;
  }
}
