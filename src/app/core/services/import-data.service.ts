import { Injectable, signal, computed } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import {
  BudgetImportRun,
  ProjectBudgetSnapshot,
  ProjectCostTransactionRecord,
  SubcontractorCostTransaction,
} from '@app/models/import.types';

export interface SOVLine {
  id: string;
  projectId?: string;
  jobNumber: string;
  payAppNumber?: string;
  lineNumber?: number;
  costCode?: string;
  description?: string;
  scheduledValue?: number;
  previousCompleted?: number;
  thisPeriod?: number;
  storedMaterials?: number;
  percentComplete?: number;
  billedAmount?: number;
  remainingAmount?: number;
  retainage?: number;
  categoryGuess?: string;
  confidence?: string;
  reviewNote?: string;
  sourceFileName: string;
  sourceSheetName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectImportFlags {
  jobNumber: string;
  projectId?: string;
  budgetImported?: boolean;
  laborBudgetImported?: boolean;
  subcontractorDataImported?: boolean;
  actualCostsImported?: boolean;
  budgetSourceFile?: string;
  importedAt?: string;
}

interface ImportDataStore {
  budgetRuns: BudgetImportRun[];
  snapshots: ProjectBudgetSnapshot[];
  sovLines: SOVLine[];
  subCostTransactions: SubcontractorCostTransaction[];
  projectCostTransactions: ProjectCostTransactionRecord[];
  projectFlags: ProjectImportFlags[];
}

const STORAGE_KEY = 'brighten.importDataStore';

const EMPTY: ImportDataStore = {
  budgetRuns: [],
  snapshots: [],
  sovLines: [],
  subCostTransactions: [],
  projectCostTransactions: [],
  projectFlags: [],
};

@Injectable({ providedIn: 'root' })
export class ImportDataService {
  private store = signal<ImportDataStore>(this.load());

  budgetRuns = computed(() => this.store().budgetRuns);
  snapshots = computed(() => this.store().snapshots);
  sovLines = computed(() => this.store().sovLines);
  subCostTransactions = computed(() => this.store().subCostTransactions);
  projectCostTransactions = computed(() => this.store().projectCostTransactions);
  projectFlags = computed(() => this.store().projectFlags);

  private load(): ImportDataStore {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY };
      return { ...EMPTY, ...JSON.parse(raw) as ImportDataStore };
    } catch {
      return { ...EMPTY };
    }
  }

  private persist(next: ImportDataStore): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.store.set(next);
  }

  upsertBudgetRun(run: Omit<BudgetImportRun, 'id'> & { id?: string }): BudgetImportRun {
    const id = run.id ?? uuidv4();
    const record: BudgetImportRun = { ...run, id };
    const runs = [...this.store().budgetRuns.filter(r => r.id !== id && !(r.jobNumber === run.jobNumber && r.sourceFileName === run.sourceFileName)), record];
    this.persist({ ...this.store(), budgetRuns: runs.slice(-200) });
    return record;
  }

  upsertSnapshots(snapshots: Omit<ProjectBudgetSnapshot, 'id' | 'createdAt' | 'updatedAt'>[]): void {
    const now = new Date().toISOString();
    const key = (s: { jobNumber: string; sourceFileName: string; sourceSheetName: string; snapshotType: string }) =>
      `${s.jobNumber}|${s.sourceFileName}|${s.sourceSheetName}|${s.snapshotType}`;
    const map = new Map(this.store().snapshots.map(s => [key(s), s]));
    for (const snap of snapshots) {
      const existing = [...map.values()].find(s =>
        s.jobNumber === snap.jobNumber
        && s.sourceFileName === snap.sourceFileName
        && s.sourceSheetName === snap.sourceSheetName
        && s.snapshotType === snap.snapshotType,
      );
      map.set(key(snap), {
        id: existing?.id ?? uuidv4(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...snap,
      });
    }
    this.persist({ ...this.store(), snapshots: [...map.values()] });
  }

  upsertSovLines(lines: Omit<SOVLine, 'id' | 'createdAt' | 'updatedAt'>[]): void {
    const now = new Date().toISOString();
    const sovKey = (l: Pick<SOVLine, 'jobNumber' | 'sourceFileName' | 'payAppNumber' | 'lineNumber' | 'description'>) =>
      `${l.jobNumber}|${l.payAppNumber ?? ''}|${l.lineNumber ?? ''}|${l.sourceFileName}|${l.description ?? ''}`;
    const map = new Map(this.store().sovLines.map(l => [sovKey(l), l]));
    for (const line of lines) {
      const k = sovKey(line);
      const existing = map.get(k);
      map.set(k, {
        id: existing?.id ?? uuidv4(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...line,
      });
    }
    this.persist({ ...this.store(), sovLines: [...map.values()] });
  }

  upsertSubCostTransactions(txns: SubcontractorCostTransaction[]): number {
    const map = new Map(this.store().subCostTransactions.map(t => [t.importKey, t]));
    let added = 0;
    for (const t of txns) {
      if (!map.has(t.importKey)) added++;
      map.set(t.importKey, { ...map.get(t.importKey), ...t, updatedAt: new Date().toISOString() });
    }
    this.persist({ ...this.store(), subCostTransactions: [...map.values()] });
    return added;
  }

  upsertProjectCostTransactions(txns: ProjectCostTransactionRecord[]): number {
    const map = new Map(this.store().projectCostTransactions.map(t => [t.importKey, t]));
    let added = 0;
    for (const t of txns) {
      if (!map.has(t.importKey)) added++;
      map.set(t.importKey, { ...map.get(t.importKey), ...t, updatedAt: new Date().toISOString() });
    }
    this.persist({ ...this.store(), projectCostTransactions: [...map.values()] });
    return added;
  }

  setProjectFlags(flags: ProjectImportFlags): void {
    const list = [...this.store().projectFlags.filter(f => f.jobNumber !== flags.jobNumber), flags];
    this.persist({ ...this.store(), projectFlags: list });
  }

  flagsForJob(jobNumber: string): ProjectImportFlags | undefined {
    return this.store().projectFlags.find(f => f.jobNumber === jobNumber);
  }

  snapshotsForJob(jobNumber: string): ProjectBudgetSnapshot[] {
    return this.store().snapshots.filter(s => s.jobNumber === jobNumber);
  }

  sovForJob(jobNumber: string): SOVLine[] {
    return this.store().sovLines.filter(l => l.jobNumber === jobNumber);
  }

  subCostForProject(projectId: string): SubcontractorCostTransaction[] {
    return this.store().subCostTransactions.filter(t => t.projectId === projectId && t.status !== 'Ignored');
  }

  projectCostForProject(projectId: string): ProjectCostTransactionRecord[] {
    return this.store().projectCostTransactions.filter(t => t.projectId === projectId && t.status !== 'Ignored');
  }

  actualCostTotalsByCategory(projectId: string): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const t of this.projectCostForProject(projectId)) {
      if (t.status === 'NeedsReview' && t.costCategory === 'Labor') continue;
      totals[t.costCategory] = (totals[t.costCategory] ?? 0) + t.amount;
    }
    return totals;
  }

  subcontractorActualTotal(projectId: string): number {
    return this.subCostForProject(projectId).reduce((s, t) => s + t.amount, 0);
  }

  projectActualTotal(projectId: string): number {
    return this.projectCostForProject(projectId).reduce((s, t) => s + t.amount, 0);
  }

  linkTransactionsToProject(jobNumber: string, projectId: string): void {
    const sub = this.store().subCostTransactions.map(t =>
      t.jobNumber === jobNumber ? { ...t, projectId } : t,
    );
    const proj = this.store().projectCostTransactions.map(t =>
      t.jobNumber === jobNumber ? { ...t, projectId } : t,
    );
    const flags = this.store().projectFlags.map(f =>
      f.jobNumber === jobNumber ? { ...f, projectId } : f,
    );
    const snaps = this.store().snapshots.map(s =>
      s.jobNumber === jobNumber ? { ...s, projectId } : s,
    );
    const sov = this.store().sovLines.map(l =>
      l.jobNumber === jobNumber ? { ...l, projectId } : l,
    );
    this.persist({
      ...this.store(),
      subCostTransactions: sub,
      projectCostTransactions: proj,
      projectFlags: flags,
      snapshots: snaps,
      sovLines: sov,
    });
  }
}
