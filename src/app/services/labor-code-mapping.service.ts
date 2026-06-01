import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { DataService } from './data.service';
import { LaborCodeMapping } from '../models/labor-code-mapping.types';
import {
  bonusEligibleLaborCost,
  buildWorkCompAuditRows,
  defaultMappingDraft,
  detectLaborCodeHealthFlags,
  normalizeLaborCodeKey,
  resolveLaborCodeMapping,
} from '../utils/labor-code-mapping.compute';
import { ProjectLaborActual } from '../models/labor-actual.types';
import { NormalizedLaborEntry } from '../models/labor.types';
import { Project } from '../models/types';
import { auth } from '../firebase';
import seedBundle from '../data/labor-code-mappings-seed.json';
import { downloadCsv } from '../utils/csv-export';
import {
  collectLaborCodeDiscoveryStats,
  inferDiscoveredMappingDefaults,
  LaborCodeDiscoveryRow,
} from '../utils/labor-code-discovery.compute';
import { ImportReviewService } from './import-review.service';

const SEED = seedBundle as { meta: { generatedAt: string }; mappings: Partial<LaborCodeMapping>[] };
const IMPORTED_KEY = 'brighten.laborCodeMappingsImportedAt';

@Injectable({ providedIn: 'root' })
export class LaborCodeMappingService {
  private data = inject(DataService);
  private importReview = inject(ImportReviewService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);

  snapshot(): LaborCodeMapping[] {
    return this.data.laborCodeMappingsSnapshot();
  }

  resolve(code?: string): LaborCodeMapping | undefined {
    return resolveLaborCodeMapping(code, this.snapshot());
  }

  /** Dev/demo only — not part of production workflow. */
  async importDevSeedIfNeeded(force = false): Promise<void> {
    const marker = localStorage.getItem(IMPORTED_KEY);
    if (!force && marker === SEED.meta.generatedAt) return;
    await this.importDevSeedMappings();
    localStorage.setItem(IMPORTED_KEY, SEED.meta.generatedAt);
  }

  /** @deprecated Use discoverFromMasterTimeSheet. Dev/demo seed import only. */
  async importIfNeeded(force = false): Promise<void> {
    return this.importDevSeedIfNeeded(force);
  }

  /** Dev/demo bundled mappings — production uses discoverFromMasterTimeSheet. */
  async importDevSeedMappings(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    this.syncing.set(true);
    try {
      const existing = this.snapshot();
      let written = 0;
      for (const mapping of SEED.mappings) {
        const exists = existing.some(m => normalizeLaborCodeKey(m.laborCode) === normalizeLaborCodeKey(mapping.laborCode));
        if (exists) continue;
        await firstValueFrom(this.data.createLaborCodeMapping({
          ...mapping,
          id: uuidv4(),
        }));
        written++;
      }
      this.lastMessage.set(`${written} dev labor code mapping${written === 1 ? '' : 's'} loaded`);
    } finally {
      this.syncing.set(false);
    }
  }

  /** @deprecated Use importDevSeedMappings. */
  async syncSeedMappings(): Promise<void> {
    return this.importDevSeedMappings();
  }

  /**
   * Discover labor codes from approved Master Time Sheet rows.
   * Creates missing mappings without overwriting manual edits.
   */
  async discoverFromMasterTimeSheet(rows: LaborCodeDiscoveryRow[]): Promise<{
    created: number;
    skippedExisting: number;
    needsReview: number;
  }> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to discover labor codes from Master Time Sheet.');

    this.syncing.set(true);
    let created = 0;
    let skippedExisting = 0;
    let needsReview = 0;

    try {
      const existing = this.snapshot();
      const stats = collectLaborCodeDiscoveryStats(rows);

      for (const row of stats) {
        const codeKey = normalizeLaborCodeKey(row.laborCode);
        const exists = existing.some(m => normalizeLaborCodeKey(m.laborCode) === codeKey);
        if (exists) {
          skippedExisting++;
          continue;
        }

        const draft = inferDiscoveredMappingDefaults(row.laborCode, row);
        if ((draft.notes ?? '').includes('NeedsReview') || (draft.notes ?? '').includes('NeedsMapping')) {
          needsReview++;
          if (!row.laborCode.trim()) {
            this.importReview.addException({
              type: 'unassignedLaborCode',
              source: 'TimeDataSheet',
              message: `Unassigned labor code on approved time — ${row.totalHours.toFixed(1)} hrs across ${row.jobCount} job(s)`,
            });
          } else {
            this.importReview.addException({
              type: 'unmappedLaborCode',
              source: 'TimeDataSheet',
              message: `Labor code "${row.laborCode}" discovered from Master Time Sheet — needs classification`,
            });
          }
        }

        if (!row.laborCode.trim()) continue;

        await firstValueFrom(this.data.createLaborCodeMapping({
          ...defaultMappingDraft(row.laborCode),
          ...draft,
          laborCode: row.laborCode,
          id: uuidv4(),
        }));
        existing.push({ ...draft, laborCode: row.laborCode, id: uuidv4() } as LaborCodeMapping);
        created++;
      }

      this.lastMessage.set(
        created
          ? `Discovered ${created} labor code mapping${created === 1 ? '' : 's'} from Master Time Sheet`
          + (needsReview ? ` · ${needsReview} need review` : '')
          : skippedExisting
            ? `All ${skippedExisting} discovered code(s) already mapped`
            : 'No labor codes found in approved Master Time rows',
      );
      return { created, skippedExisting, needsReview };
    } finally {
      this.syncing.set(false);
    }
  }

  async saveMapping(draft: Partial<LaborCodeMapping>, id?: string | null): Promise<LaborCodeMapping> {
    if (id) {
      return firstValueFrom(this.data.updateLaborCodeMapping(id, draft));
    }
    return firstValueFrom(this.data.createLaborCodeMapping({ ...draft, id: uuidv4() }));
  }

  async markInactive(id: string): Promise<void> {
    await firstValueFrom(this.data.updateLaborCodeMapping(id, { active: false }));
  }

  async bulkClassifyUnassigned(codes: string[], patch: Partial<LaborCodeMapping>): Promise<number> {
    let count = 0;
    for (const code of codes) {
      const existing = this.snapshot().find(m => normalizeLaborCodeKey(m.laborCode) === normalizeLaborCodeKey(code));
      if (existing) {
        await firstValueFrom(this.data.updateLaborCodeMapping(existing.id, { ...patch, active: true }));
      } else {
        await firstValueFrom(this.data.createLaborCodeMapping({
          ...defaultMappingDraft(code),
          ...patch,
          laborCode: code,
          id: uuidv4(),
        }));
      }
      count++;
    }
    return count;
  }

  discoverUnmappedCodes(
    entries: Array<{ laborCode?: string; laborCode1?: string; laborCode2?: string; laborCode3?: string }>,
    actuals: ProjectLaborActual[] = [],
  ): string[] {
    const codes = new Set<string>();
    const pushCode = (code?: string) => {
      const trimmed = (code ?? '').trim();
      if (!trimmed) return;
      if (!this.resolve(trimmed)) codes.add(trimmed);
    };
    for (const row of [...entries, ...actuals]) {
      pushCode(row.laborCode);
      pushCode((row as { laborCode1?: string }).laborCode1);
      pushCode((row as { laborCode2?: string }).laborCode2);
      pushCode((row as { laborCode3?: string }).laborCode3);
    }
    return [...codes].sort();
  }

  /** Build discovery rows from normalized labor entries and labor actuals. */
  discoveryRowsFromEntries(
    entries: NormalizedLaborEntry[],
    actuals: ProjectLaborActual[] = [],
  ): LaborCodeDiscoveryRow[] {
    const rows: LaborCodeDiscoveryRow[] = entries.map(entry => ({
      laborCode: entry.laborCode,
      laborCode1: entry.laborCode1,
      laborCode2: entry.laborCode2,
      laborCode3: entry.laborCode3,
      hours1: entry.hours1,
      hours2: entry.hours2,
      hours3: entry.hours3,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      doubleTimeHours: entry.doubleTimeHours,
      totalHours: entry.totalHours,
      jobNumber: entry.projectNumber,
      employeeName: entry.employeeName,
      workDate: entry.workDate,
      approvalStatus: entry.approvalStatus ?? 'Approved',
    }));
    for (const actual of actuals) {
      if (actual.approvalStatus !== 'Approved') continue;
      rows.push({
        laborCode: actual.laborCode,
        totalHours: actual.totalHours,
        regularHours: actual.regularHours,
        overtimeHours: actual.overtimeHours,
        doubleTimeHours: actual.doubleTimeHours,
        jobNumber: actual.jobNumber,
        employeeName: actual.employeeName,
        workDate: actual.workDate,
        approvalStatus: 'Approved',
      });
    }
    return rows;
  }

  bonusEligibleCostForProject(projectId: string, actuals: ProjectLaborActual[]) {
    return bonusEligibleLaborCost(projectId, actuals, this.snapshot());
  }

  workCompAuditRows(actuals: ProjectLaborActual[]) {
    return buildWorkCompAuditRows(actuals, this.snapshot());
  }

  healthFlags(input: {
    entries?: NormalizedLaborEntry[];
    actuals?: ProjectLaborActual[];
    projects?: Project[];
    bonusProjectIds?: string[];
  }) {
    return detectLaborCodeHealthFlags({ ...input, mappings: this.snapshot() });
  }

  exportMappingsCsv(): void {
    const rows = this.snapshot().map(m => [
      m.laborCode,
      m.displayName ?? '',
      m.category,
      m.workCompCategory ?? '',
      m.certifiedPayrollClassification ?? '',
      m.defaultCostCode ?? '',
      m.bonusEligible,
      m.certifiedPayrollEligible,
      m.wipEligible,
      m.excludeFromForemanBonus,
      m.excludeFromAudit,
      m.active,
      m.notes ?? '',
    ]);
    downloadCsv(
      'labor-code-mappings.csv',
      [
        'Labor Code', 'Display Name', 'Category', 'Work Comp Category',
        'Certified Payroll Classification', 'Default Cost Code', 'Bonus Eligible',
        'Certified Payroll Eligible', 'WIP Eligible', 'Exclude From Foreman Bonus',
        'Exclude From Audit', 'Active', 'Notes',
      ],
      rows,
    );
  }

  exportWorkCompAuditCsv(actuals: ProjectLaborActual[]): void {
    const rows = this.workCompAuditRows(actuals).map(r => [
      r.employeeName ?? '',
      r.jobNumber ?? '',
      r.projectName ?? '',
      r.laborCode,
      r.workCompCategory,
      r.regularHours,
      r.overtimeHours,
      r.doubleTimeHours,
      r.totalHours,
      r.wages,
      r.fringe,
      r.totalCost,
    ]);
    downloadCsv(
      'labor-hours-by-work-comp-category.csv',
      [
        'Employee', 'Job Number', 'Project', 'Labor Code', 'Work Comp Category',
        'Regular Hours', 'OT Hours', 'DT Hours', 'Total Hours', 'Wages', 'Fringe', 'Total Cost',
      ],
      rows,
    );
  }
}
