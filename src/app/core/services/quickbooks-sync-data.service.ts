import { Injectable, signal, computed } from '@angular/core';
import { v4 as uuidv4 } from 'uuid';
import { QB_PROJECT_MGMT_SYNC } from '@app/config/qb-project-mgmt-sync.config';
import {
  QuickBooksArAging,
  QuickBooksBillPayment,
  QuickBooksCustomerProject,
  QuickBooksIncomeByCustomer,
  QuickBooksInvoiceLine,
  QuickBooksProjectCostTransaction,
  QuickBooksSyncRun,
  QuickBooksSyncStore,
  QuickBooksVendorBalance,
} from '@app/models/quickbooks-sync.types';

const EMPTY: QuickBooksSyncStore = {
  customers: [],
  incomeByCustomer: [],
  invoiceLines: [],
  arAging: [],
  vendorBalances: [],
  billPayments: [],
  detailCostTransactions: [],
  hasDetailCostTab: false,
};

@Injectable({ providedIn: 'root' })
export class QuickBooksSyncDataService {
  private store = signal<QuickBooksSyncStore>(this.load());

  lastRun = computed(() => this.store().lastRun);
  customers = computed(() => this.store().customers);
  incomeByCustomer = computed(() => this.store().incomeByCustomer);
  invoiceLines = computed(() => this.store().invoiceLines);
  arAging = computed(() => this.store().arAging);
  vendorBalances = computed(() => this.store().vendorBalances);
  billPayments = computed(() => this.store().billPayments);
  detailCostTransactions = computed(() => this.store().detailCostTransactions);
  detailCostTabName = computed(() => this.store().detailCostTabName);
  hasDetailCostTab = computed(() => this.store().hasDetailCostTab);
  detailCostWarning = computed(() => this.store().detailCostWarning);

  private load(): QuickBooksSyncStore {
    try {
      const raw = localStorage.getItem(QB_PROJECT_MGMT_SYNC.storageKey);
      if (!raw) return { ...EMPTY };
      return { ...EMPTY, ...JSON.parse(raw) as QuickBooksSyncStore };
    } catch {
      return { ...EMPTY };
    }
  }

  private persist(next: QuickBooksSyncStore): void {
    localStorage.setItem(QB_PROJECT_MGMT_SYNC.storageKey, JSON.stringify(next));
    this.store.set(next);
  }

  replaceStore(partial: Partial<QuickBooksSyncStore>): void {
    this.persist({ ...this.store(), ...partial });
  }

  logRun(run: Omit<QuickBooksSyncRun, 'id'> & { id?: string }): QuickBooksSyncRun {
    const record: QuickBooksSyncRun = { ...run, id: run.id ?? uuidv4() };
    this.persist({ ...this.store(), lastRun: record });
    return record;
  }

  incomeForJob(jobNumber: string): QuickBooksIncomeByCustomer | undefined {
    return this.store().incomeByCustomer.find(r => r.jobNumber === jobNumber && r.status !== 'Ignored');
  }

  arForJob(jobNumber: string): QuickBooksArAging | undefined {
    return this.store().arAging.find(r => r.jobNumber === jobNumber && r.status !== 'Ignored');
  }

  invoicesForJob(jobNumber: string): QuickBooksInvoiceLine[] {
    return this.store().invoiceLines.filter(r => r.jobNumber === jobNumber && r.status !== 'Ignored');
  }

  customerForJob(jobNumber: string): QuickBooksCustomerProject | undefined {
    return this.store().customers.find(r => r.jobNumber === jobNumber && r.status !== 'Ignored');
  }

  upsertDetailCostTransactions(txns: QuickBooksProjectCostTransaction[]): void {
    const map = new Map(this.store().detailCostTransactions.map(t => [t.importKey, t]));
    for (const t of txns) {
      const existing = map.get(t.importKey);
      map.set(t.importKey, {
        ...existing,
        ...t,
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt ?? t.createdAt ?? new Date().toISOString(),
      });
    }
    this.persist({ ...this.store(), detailCostTransactions: [...map.values()] });
  }

  costTransactionsForProject(projectId: string): QuickBooksProjectCostTransaction[] {
    return this.store().detailCostTransactions.filter(
      t => t.projectId === projectId && t.status !== 'Ignored',
    );
  }

  wipCostTotalsByCategory(projectId: string): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const t of this.costTransactionsForProject(projectId)) {
      if (!t.includeInWipActuals) continue;
      totals[t.costCategory] = (totals[t.costCategory] ?? 0) + t.amount;
    }
    return totals;
  }

  hasDetailCostsForProject(projectId: string): boolean {
    return this.costTransactionsForProject(projectId).some(t => t.includeInWipActuals);
  }

  detailCostCountForJob(jobNumber: string): number {
    return this.store().detailCostTransactions.filter(t => t.jobNumber === jobNumber).length;
  }

  vendorBalanceForName(vendorName: string): QuickBooksVendorBalance | undefined {
    return this.store().vendorBalances.find(r =>
      r.vendorName.toLowerCase() === vendorName.toLowerCase() && r.status !== 'Ignored',
    );
  }

  linkProjectId(jobNumber: string, projectId: string): void {
    const link = <T extends { jobNumber?: string; projectId?: string }>(rows: T[]) =>
      rows.map(r => r.jobNumber === jobNumber ? { ...r, projectId } : r);

    this.persist({
      ...this.store(),
      customers: link(this.store().customers),
      incomeByCustomer: link(this.store().incomeByCustomer),
      invoiceLines: link(this.store().invoiceLines),
      arAging: link(this.store().arAging),
      detailCostTransactions: link(this.store().detailCostTransactions),
    });
  }

  /** Per-job flags for seed completeness. */
  flagsForJob(jobNumber: string): {
    qbCustomerLinked?: boolean;
    qbBillingPresent?: boolean;
    qbArPresent?: boolean;
    qbIncomeSummaryPresent?: boolean;
    qbDetailCostPresent?: boolean;
    qbSyncedAt?: string;
  } {
    const syncedAt = this.store().lastRun?.completedAt;
    return {
      qbCustomerLinked: !!this.customerForJob(jobNumber),
      qbBillingPresent: this.invoicesForJob(jobNumber).length > 0,
      qbArPresent: !!this.arForJob(jobNumber),
      qbIncomeSummaryPresent: !!this.incomeForJob(jobNumber),
      qbDetailCostPresent: this.detailCostCountForJob(jobNumber) > 0,
      qbSyncedAt: syncedAt,
    };
  }
}
