import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { ImportException, ImportRunSummary } from '@app/models/import.types';
import { downloadCsv } from '@shared/utils/csv-export';
import { createLazyJsonLoader, loadMockDataJson } from '@core/utils/mock-data-loader';
import { SourceReviewRepository } from '@core/services/source-review.repository';
import { SyncRunsRepository } from '@core/services/sync-runs.repository';
import { AuthService } from '@core/services/auth.service';

interface ImportReviewSeed {
  meta: { generatedAt: string };
  exceptions: Array<{ type: string; jobNumber?: string; sourceFileName?: string; message: string; status?: string }>;
}

@Injectable({ providedIn: 'root' })
export class ImportReviewService {
  private readonly sourceReview = inject(SourceReviewRepository);
  private readonly syncRuns = inject(SyncRunsRepository);
  private readonly auth = inject(AuthService);

  private exceptionsSignal = signal<ImportException[]>(this.sourceReview.load());
  private runsSignal = signal<ImportRunSummary[]>(this.syncRuns.load());
  private hydrated = false;

  exceptions = this.exceptionsSignal.asReadonly();
  runs = this.runsSignal.asReadonly();

  unresolved = computed(() => this.exceptions().filter(e => e.status === 'NeedsReview' || e.status === 'Imported'));
  unresolvedCount = computed(() => this.unresolved().length);

  constructor() {
    effect(() => {
      if (this.auth.user()) void this.tryHydrateFromFirestore();
    });
  }

  private async tryHydrateFromFirestore(): Promise<void> {
    if (this.hydrated || !this.auth.user()) return;
    this.hydrated = true;
    const [exceptions, runs] = await Promise.all([
      this.sourceReview.hydrateFromFirestore(),
      this.syncRuns.hydrateFromFirestore(),
    ]);
    this.exceptionsSignal.set(exceptions);
    this.runsSignal.set(runs);
  }

  async seedInitialExceptions(): Promise<void> {
    const seed = await loadMockDataJson<ImportReviewSeed>('seeds/import-review-seed.json');
    const existing = this.exceptionsSignal();
    const keys = new Set(existing.map(e => `${e.type}|${e.jobNumber}|${e.message}`));
    const merged = [...existing];

    for (const row of seed.exceptions) {
      const key = `${row.type}|${row.jobNumber}|${row.message}`;
      if (keys.has(key)) continue;
      merged.push({
        id: uuidv4(),
        type: row.type as ImportException['type'],
        source: row.type.includes('Drive') ? 'DriveAudit' : row.type.includes('budget') ? 'BudgetWorkbook' : 'QuickBooksSeed',
        jobNumber: row.jobNumber,
        sourceFileName: row.sourceFileName,
        message: row.message,
        status: (row.status as ImportException['status']) ?? 'NeedsReview',
        createdAt: seed.meta.generatedAt,
      });
    }
    this.persistExceptions(merged);
  }

  addException(partial: Omit<ImportException, 'id' | 'createdAt' | 'status'> & { status?: ImportException['status'] }): void {
    const key = `${partial.type}|${partial.jobNumber}|${partial.vendorName}|${partial.message}`;
    if (this.exceptionsSignal().some(e => `${e.type}|${e.jobNumber}|${e.vendorName}|${e.message}` === key)) return;
    const next = [...this.exceptionsSignal(), {
      id: uuidv4(),
      status: partial.status ?? 'NeedsReview',
      createdAt: new Date().toISOString(),
      ...partial,
    }];
    this.persistExceptions(next);
  }

  resolveException(id: string, status: ImportException['status'] = 'Matched'): void {
    this.persistExceptions(this.exceptionsSignal().map(e =>
      e.id === id ? { ...e, status, resolvedAt: new Date().toISOString() } : e,
    ));
  }

  ignoreException(id: string): void {
    this.resolveException(id, 'Ignored');
  }

  logRun(run: Omit<ImportRunSummary, 'id' | 'importedAt'>): void {
    const next = [{
      id: uuidv4(),
      importedAt: new Date().toISOString(),
      ...run,
    }, ...this.runsSignal()].slice(0, 50);
    this.syncRuns.persist(next);
    this.runsSignal.set(next);
  }

  exportExceptionsCsv(): void {
    const headers = ['type', 'status', 'jobNumber', 'vendorName', 'sourceFileName', 'message', 'createdAt'];
    const rows = this.exceptions().map(e => [
      e.type,
      e.status,
      e.jobNumber ?? '',
      e.vendorName ?? '',
      e.sourceFileName ?? '',
      e.message,
      e.createdAt,
    ]);
    downloadCsv(`import-exceptions-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  }

  private persistExceptions(list: ImportException[]): void {
    this.sourceReview.persist(list);
    this.exceptionsSignal.set(list);
  }
}
