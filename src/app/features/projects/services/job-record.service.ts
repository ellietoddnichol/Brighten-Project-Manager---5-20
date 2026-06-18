import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Project, ChangeOrder, PO, TimeEntry } from '@app/models/types';
import { Company, ProjectLaborEntry, ProjectMaterial } from '@app/models/job-record.types';
import { DataService } from '@core/services/data.service';
import { ActivityEventsService } from '@core/services/activity-events.service';
import { SubcontractorService } from '@features/subcontractors/services/subcontractor.service';
import { normalizeJobKey } from '@shared/utils/master-sheet-parser';
import {
  computeProjectProfitMetrics,
  ProjectProfitInput,
  ProjectProfitMetrics,
} from '@features/projects/utils/project-profit.compute';

export interface JobRecordTotals {
  totalHours: number;
  laborCost: number;
  materialCost: number;
  approvedChangeAmount: number;
  pendingChangeAmount: number;
  costToDate: number;
  syncedLaborHours: number;
  syncedMaterialCost: number;
  manualLaborHours: number;
  manualMaterialCost: number;
}

function matchesProjectJob(project: Project, jobIdLabel?: string, projectNumber?: string): boolean {
  const num = project.projectNumber?.trim();
  if (!num) return false;
  const keys = new Set([normalizeJobKey(num)]);
  if (jobIdLabel) keys.add(normalizeJobKey(jobIdLabel));
  if (projectNumber) keys.add(normalizeJobKey(projectNumber));
  const labelKey = jobIdLabel ? normalizeJobKey(jobIdLabel) : '';
  return keys.has(labelKey) || labelKey.startsWith(normalizeJobKey(num));
}

@Injectable({ providedIn: 'root' })
export class JobRecordService {
  private data = inject(DataService);
  private activity = inject(ActivityEventsService);
  private subSvc = inject(SubcontractorService);

  companies(): Company[] {
    return this.data.companiesSnapshot();
  }

  materialsForProject(projectId: string): ProjectMaterial[] {
    return this.data.projectMaterialsSnapshot().filter(m => m.projectId === projectId);
  }

  laborForProject(projectId: string): ProjectLaborEntry[] {
    return this.data.projectLaborEntriesSnapshot().filter(e => e.projectId === projectId);
  }

  timeEntriesForProject(project: Project): TimeEntry[] {
    return this.data.timeEntriesSnapshot().filter(e =>
      e.projectId === project.id
      || matchesProjectJob(project, e.jobIdLabel, e.jobIdLabel?.split(/\s*[-–—]/)[0]),
    );
  }

  posForProject(projectId: string): PO[] {
    return this.data.posSnapshot().filter(po => po.projectId === projectId);
  }

  totalsForProject(project: Project | string, changeOrders: ChangeOrder[]): JobRecordTotals {
    const projectId = typeof project === 'string' ? project : project.id;
    const projectRecord = typeof project === 'string'
      ? this.data.projectsSnapshot().find(p => p.id === projectId)
      : project;

    const labor = this.laborForProject(projectId);
    const materials = this.materialsForProject(projectId);
    const manualLaborHours = labor.reduce((s, e) => s + (e.totalHours ?? 0), 0);
    const manualLaborCost = labor.reduce((s, e) => s + (e.laborCost ?? 0), 0);
    const manualMaterialCost = materials.reduce((s, m) => s + (m.totalCost ?? 0), 0);

    const timeEntries = projectRecord ? this.timeEntriesForProject(projectRecord) : [];
    const syncedLaborHours = timeEntries.reduce((s, e) => s + (e.totalHours ?? 0), 0);

    const pos = this.posForProject(projectId);
    const syncedMaterialCost = pos.reduce((s, po) =>
      s + (po.invoicedAmount ?? po.committedAmount ?? po.originalAmount ?? 0), 0);

    const totalHours = Math.max(
      manualLaborHours,
      syncedLaborHours,
      projectRecord?.totalLaborHours ?? 0,
    );
    const laborCost = manualLaborCost;
    const materialCost = manualMaterialCost + syncedMaterialCost;
    const cos = changeOrders.filter(c => c.projectId === projectId);
    const coAmount = (c: ChangeOrder) =>
      c.approvedAmount ?? c.totalAmount ?? c.sellPrice ?? c.costImpact ?? 0;
    const approvedChangeAmount = cos
      .filter(c => (c.status ?? '').toLowerCase().includes('approved'))
      .reduce((s, c) => s + coAmount(c), 0);
    const pendingChangeAmount = cos
      .filter(c => !(c.status ?? '').toLowerCase().includes('approved'))
      .reduce((s, c) => s + coAmount(c), 0);
    return {
      totalHours,
      laborCost,
      materialCost,
      approvedChangeAmount,
      pendingChangeAmount,
      costToDate: laborCost + materialCost,
      syncedLaborHours,
      syncedMaterialCost,
      manualLaborHours,
      manualMaterialCost,
    };
  }

  profitForProject(project: Project, totals: JobRecordTotals): ProjectProfitMetrics {
    const revised =
      project.revisedContractAmount
      ?? ((project.originalContractAmount ?? 0) + totals.approvedChangeAmount);
    const billed = project.billedToDate ?? 0;
    const estimated = project.estimatedTotalCost ?? totals.costToDate ?? 0;
    const input: ProjectProfitInput = {
      revisedContractAmount: revised,
      billedToDate: billed,
      costToDate: totals.costToDate,
      estimatedTotalCost: estimated > 0 ? estimated : Math.max(totals.costToDate, 1),
    };
    return computeProjectProfitMetrics(input);
  }

  async saveProjectField(project: Project, patch: Partial<Project>): Promise<void> {
    await firstValueFrom(this.data.updateProject(project.id, patch));
    if (patch.customer?.trim()) {
      await this.upsertCompany(patch.customer.trim(), 'Customer');
    }
    void this.activity.recordEvent({
      projectId: project.id,
      entityType: 'project',
      entityId: project.id,
      action: 'project.updated',
      title: 'Project updated',
      description: Object.keys(patch).join(', '),
      source: 'manual',
    });
  }

  async upsertCompany(name: string, type: Company['type'] = 'Customer'): Promise<Company> {
    const trimmed = name.trim();
    const existing = this.companies().find(
      c => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (existing.type === type) return existing;
      return firstValueFrom(this.data.updateCompany(existing.id, { type }));
    }
    return firstValueFrom(this.data.createCompany({ name: trimmed, type }));
  }

  async createLaborEntry(entry: Partial<ProjectLaborEntry>): Promise<ProjectLaborEntry> {
    const reg = entry.regularHours ?? 0;
    const ot = entry.overtimeHours ?? 0;
    const dt = entry.doubleTimeHours ?? 0;
    const totalHours = entry.totalHours ?? reg + ot + dt;
    const laborCost = entry.laborCost ?? (entry.costRate != null ? totalHours * entry.costRate : undefined);
    const saved = await firstValueFrom(this.data.createProjectLaborEntry({
      ...entry,
      regularHours: reg,
      overtimeHours: ot,
      doubleTimeHours: dt,
      totalHours,
      laborCost,
    }));
    if (entry.projectId) {
      void this.activity.recordEvent({
        projectId: entry.projectId,
        entityType: 'project',
        entityId: saved.id,
        action: 'project.updated',
        title: 'Labor entry added',
        description: `${entry.employeeName ?? 'Crew'} — ${totalHours}h`,
        source: 'manual',
      });
    }
    return saved;
  }

  async createMaterial(entry: Partial<ProjectMaterial>): Promise<ProjectMaterial> {
    const totalCost = entry.totalCost
      ?? (entry.quantity != null && entry.unitCost != null ? entry.quantity * entry.unitCost : 0);
    const saved = await firstValueFrom(this.data.createProjectMaterial({ ...entry, totalCost }));
    if (entry.projectId) {
      void this.activity.recordEvent({
        projectId: entry.projectId,
        entityType: 'project',
        entityId: saved.id,
        action: 'project.updated',
        title: 'Material entry added',
        description: entry.description ?? entry.vendor,
        source: 'manual',
      });
    }
    return saved;
  }

  showSubsTab(project: Project): boolean {
    if (project.hasSubcontractors) return true;
    return this.data.projectSubcontractorsSnapshot().some(ps => ps.projectId === project.id);
  }

  async linkSubToProject(
    project: Project,
    companyName: string,
    trade?: string,
  ): Promise<void> {
    const sub = await firstValueFrom(
      this.data.createSubcontractor({
        companyName: companyName.trim(),
        source: 'Manual',
        vendorClassification: 'Subcontractor',
      }),
    );
    await firstValueFrom(this.data.createProjectSubcontractor({
      projectId: project.id,
      jobNumber: project.projectNumber,
      projectName: project.projectName,
      subcontractorId: sub.id,
      subcontractorName: sub.companyName,
      trade,
    }));
    await this.upsertCompany(sub.companyName, 'Subcontractor');
    if (!project.hasSubcontractors) {
      await this.saveProjectField(project, { hasSubcontractors: true });
    }
  }
}
