import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { QB_DETAIL_COST_WARNING, QB_PROJECT_MGMT_SYNC } from '@app/config/qb-project-mgmt-sync.config';
import { auth } from '@app/firebase';
import { ARRecord } from '@app/models/financial.types';
import { DataService } from '@core/services/data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { SheetsService } from '@core/services/sheets.service';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import {
  findSheetTitle,
  parseArAgingRows,
  parseBillPaymentRows,
  parseCustomersRows,
  parseIncomeByCustomerRows,
  parseInvoiceDetailRows,
  parseQuickBooksProjectCostDetailRows,
  parseVendorBalanceRows,
} from '@shared/utils/qb-sync-parsers';
import {
  findSubcontractorByName,
} from '@shared/utils/vendor-normalizers';
import { mergeImportProjectPatch, shouldApplyImportFinancialPatch } from '@shared/utils/lifecycle-import.guard';
import { UNMATCHED_AR_PROJECT_PREFIX } from '@features/financials/utils/ar.compute';

export interface QuickBooksSyncResult {
  rowsRead: number;
  rowsImported: number;
  warnings: string[];
  tabsRead: string[];
  tabsMissing: string[];
  syncedAt: string;
}

@Injectable({ providedIn: 'root' })
export class QuickBooksSyncSheetsService {
  private sheets = inject(SheetsService);
  private data = inject(DataService);
  private syncData = inject(QuickBooksSyncDataService);
  private importReview = inject(ImportReviewService);
  private lifecycle = inject(ProjectLifecycleService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);
  lastSyncError = signal<string | null>(null);

  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private autoSyncStarted = false;

  startAutoSync(): void {
    if (this.autoSyncStarted) return;
    this.autoSyncStarted = true;
    void this.syncFromWorkbook(false);
    this.autoSyncTimer = setInterval(
      () => void this.syncFromWorkbook(false),
      QB_PROJECT_MGMT_SYNC.syncIntervalMs,
    );
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.autoSyncStarted = false;
  }

  async syncFromWorkbook(manual = true): Promise<QuickBooksSyncResult> {
    if (!auth.currentUser) {
      throw new Error('Sign in with Google to sync QuickBooks data.');
    }
    if (this.syncing()) {
      throw new Error('QuickBooks sync already in progress.');
    }

    this.syncing.set(true);
    this.lastSyncError.set(null);
    const startedAt = new Date().toISOString();
    const warnings: string[] = [];
    const errors: string[] = [];
    const tabsRead: string[] = [];
    const tabsMissing: string[] = [];
    let rowsRead = 0;
    let rowsImported = 0;

    try {
      const sheetMeta = await this.sheets.getSpreadsheetSheets(QB_PROJECT_MGMT_SYNC.spreadsheetId);
      const titles = sheetMeta.map(s => s.title);

      const hasDetailCostTab = !!findSheetTitle(titles, QB_PROJECT_MGMT_SYNC.tabs.detailCost);
      const detailCostTabName = findSheetTitle(titles, QB_PROJECT_MGMT_SYNC.tabs.detailCost);
      if (!hasDetailCostTab) {
        warnings.push(QB_DETAIL_COST_WARNING);
      }

      let detailCostTransactions: ReturnType<typeof parseQuickBooksProjectCostDetailRows> = [];
      if (detailCostTabName) {
        try {
          const rows = await this.sheets.getValues(
            QB_PROJECT_MGMT_SYNC.spreadsheetId,
            `'${detailCostTabName.replace(/'/g, "''")}'!A:ZZ`,
          );
          rowsRead += Math.max(0, rows.length - 1);
          tabsRead.push(detailCostTabName);
          detailCostTransactions = parseQuickBooksProjectCostDetailRows(rows, detailCostTabName);
          rowsImported += detailCostTransactions.length;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Detail cost: ${msg}`);
          warnings.push(`Failed to read detail cost tab: ${msg}`);
        }
      }

      const tabReaders: Array<{
        key: keyof typeof QB_PROJECT_MGMT_SYNC.tabs;
        aliases: readonly string[];
        read: (rows: string[][]) => unknown[];
      }> = [
        { key: 'customers', aliases: QB_PROJECT_MGMT_SYNC.tabs.customers, read: parseCustomersRows },
        { key: 'incomeByCustomer', aliases: QB_PROJECT_MGMT_SYNC.tabs.incomeByCustomer, read: parseIncomeByCustomerRows },
        { key: 'invoiceDetails', aliases: QB_PROJECT_MGMT_SYNC.tabs.invoiceDetails, read: parseInvoiceDetailRows },
        { key: 'arAging', aliases: QB_PROJECT_MGMT_SYNC.tabs.arAging, read: parseArAgingRows },
        { key: 'vendorBalance', aliases: QB_PROJECT_MGMT_SYNC.tabs.vendorBalance, read: parseVendorBalanceRows },
        { key: 'billPayments', aliases: QB_PROJECT_MGMT_SYNC.tabs.billPayments, read: parseBillPaymentRows },
      ];

      let customers: ReturnType<typeof parseCustomersRows> = [];
      let incomeByCustomer: ReturnType<typeof parseIncomeByCustomerRows> = [];
      let invoiceLines: ReturnType<typeof parseInvoiceDetailRows> = [];
      let arAging: ReturnType<typeof parseArAgingRows> = [];
      let vendorBalances: ReturnType<typeof parseVendorBalanceRows> = [];
      let billPayments: ReturnType<typeof parseBillPaymentRows> = [];

      for (const { key, aliases, read } of tabReaders) {
        const title = findSheetTitle(titles, aliases);
        if (!title) {
          tabsMissing.push(aliases[0]);
          warnings.push(`QuickBooks sync tab missing: ${aliases[0]}`);
          continue;
        }
        try {
          const rows = await this.sheets.getValues(
            QB_PROJECT_MGMT_SYNC.spreadsheetId,
            `'${title.replace(/'/g, "''")}'!A:ZZ`,
          );
          rowsRead += Math.max(0, rows.length - 1);
          tabsRead.push(title);
          const parsed = read(rows);
          rowsImported += parsed.length;

          switch (key) {
            case 'customers': customers = parsed as typeof customers; break;
            case 'incomeByCustomer': incomeByCustomer = parsed as typeof incomeByCustomer; break;
            case 'invoiceDetails': invoiceLines = parsed as typeof invoiceLines; break;
            case 'arAging': arAging = parsed as typeof arAging; break;
            case 'vendorBalance': vendorBalances = parsed as typeof vendorBalances; break;
            case 'billPayments': billPayments = parsed as typeof billPayments; break;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${aliases[0]}: ${msg}`);
          warnings.push(`Failed to read ${aliases[0]}: ${msg}`);
        }
      }

      const projects = await this.data.waitForProjectsLoaded();
      const subs = this.data.subcontractorsSnapshot();
      const lifecycleMap = this.lifecycle.snapshotMap();
      let arUpdated = 0;
      let projectsPatched = 0;

      const matchProject = (jobNumber?: string) => {
        if (!jobNumber) return undefined;
        const matches = findProjectMatches(projects, { projectNumber: jobNumber });
        return matches.length ? pickCanonicalProject(matches) : undefined;
      };

      for (const row of [...customers, ...incomeByCustomer, ...invoiceLines, ...arAging]) {
        if (!row.jobNumber) {
          const label = 'customerLabel' in row ? row.customerLabel
            : 'customerName' in row ? row.customerName
            : 'fullName' in row ? row.fullName
            : 'memo' in row ? row.memo
            : 'row';
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'QuickBooksSync',
            message: `QuickBooks row missing job number (${label})`,
            status: 'NeedsReview',
          });
          continue;
        }
        const project = matchProject(row.jobNumber);
        if (!project) {
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'QuickBooksSync',
            jobNumber: row.jobNumber,
            message: `QuickBooks row for J${row.jobNumber} — no matching project`,
          });
          continue;
        }
        row.projectId = project.id;
        row.status = 'Matched';
        this.syncData.linkProjectId(row.jobNumber, project.id);
      }

      for (const vb of vendorBalances) {
        const sub = findSubcontractorByName(subs, vb.vendorName);
        if (sub) {
          vb.subcontractorId = sub.id;
          vb.status = 'Matched';
        } else {
          this.importReview.addException({
            type: 'unmatchedSubcontractor',
            source: 'QuickBooksSync',
            vendorName: vb.vendorName,
            message: `Vendor balance for "${vb.vendorName}" — no matching subcontractor`,
          });
        }
      }

      for (const bp of billPayments) {
        if (bp.vendorName) {
          const sub = findSubcontractorByName(subs, bp.vendorName);
          if (sub) bp.subcontractorId = sub.id;
        }
        if (!bp.linkedTxnId) {
          this.importReview.addException({
            type: 'transactionMissingProject',
            source: 'QuickBooksSync',
            vendorName: bp.vendorName,
            message: `Bill payment ${bp.qboPaymentId ?? bp.id} not linked to a bill transaction`,
          });
        }
      }

      const existingAr = this.data.arRecordsSnapshot();
      const arSyncedAt = startedAt;
      for (const ar of arAging) {
        const agingBucket = ar.days91Plus > 0 ? '90+' as const
          : ar.days61To90 > 0 ? '61-90' as const
          : ar.days31To60 > 0 ? '31-60' as const
          : ar.days1To30 > 0 ? '1-30' as const
          : 'Current' as const;

        const baseRecord: Partial<ARRecord> = {
          jobNumber: ar.jobNumber,
          customerName: ar.customerLabel,
          customer: ar.customerLabel,
          originalAmount: ar.total,
          openBalance: ar.total,
          paidAmount: 0,
          currentAmount: ar.current,
          days1To30: ar.days1To30,
          days31To60: ar.days31To60,
          days61To90: ar.days61To90,
          days90Plus: ar.days91Plus,
          totalOpen: ar.total,
          agingBucket,
          status: ar.total > 0 ? 'Open' : 'Paid',
          source: 'QuickBooksArAging',
          sourceRowId: ar.importKey,
          lastSyncedAt: arSyncedAt,
          notes: `Synced from AR Aging Summary (Current ${ar.current}, 1-30 ${ar.days1To30}, 31-60 ${ar.days31To60}, 61-90 ${ar.days61To90}, 91+ ${ar.days91Plus})`,
        };

        if (!ar.projectId || !ar.jobNumber) {
          const unmatchedId = `${UNMATCHED_AR_PROJECT_PREFIX}${ar.importKey}`;
          const existing = existingAr.find(r =>
            r.sourceRowId === ar.importKey || (r.projectId === unmatchedId && r.source === 'QuickBooksArAging'),
          );
          const record: Partial<ARRecord> = {
            ...baseRecord,
            projectId: unmatchedId,
            projectName: ar.customerLabel,
            invoiceNumber: ar.jobNumber ? `J${ar.jobNumber}` : 'Unmatched AR',
          };
          if (existing) {
            await firstValueFrom(this.data.updateArRecord(existing.id, record));
          } else {
            await firstValueFrom(this.data.createArRecord(record));
          }
          arUpdated++;
          continue;
        }

        const project = projects.find(p => p.id === ar.projectId)!;
        const snap = lifecycleMap.get(project.id);

        const existing = existingAr.find(r =>
          r.projectId === ar.projectId
          && (r.source === 'QuickBooksArAging' || r.source === 'QuickBooks')
          && (!r.sourceRowId || r.sourceRowId === ar.importKey),
        );
        const record: Partial<ARRecord> = {
          ...baseRecord,
          projectId: ar.projectId,
          projectName: project.projectName,
        };

        if (existing) {
          await firstValueFrom(this.data.updateArRecord(existing.id, record));
        } else {
          await firstValueFrom(this.data.createArRecord(record));
        }
        arUpdated++;

        if (shouldApplyImportFinancialPatch(project, snap)) {
          const billedFromInvoices = invoiceLines
            .filter(i => i.jobNumber === ar.jobNumber)
            .reduce((s, i) => s + i.amount, 0);
          const income = incomeByCustomer.find(i => i.jobNumber === ar.jobNumber);

          const financialPatch = {
            qboSyncedAt: startedAt,
            currentAR: ar.total,
            billedToDate: billedFromInvoices || project.billedToDate,
            actualCostToDate: income?.expenses && !this.hasDetailedCost(project.id)
              ? Math.max(project.actualCostToDate ?? 0, income.expenses)
              : project.actualCostToDate,
          };
          const { patch, conflicts } = mergeImportProjectPatch(project, financialPatch);
          for (const c of conflicts) {
            this.importReview.addException({
              type: 'importFieldConflict',
              source: 'QuickBooksSync',
              jobNumber: ar.jobNumber,
              message: `QB sync skipped manual field ${String(c.field)} on J${ar.jobNumber}`,
            });
          }
          await firstValueFrom(this.data.updateProject(project.id, patch));
          projectsPatched++;
        } else {
          this.importReview.addException({
            type: 'budgetImportWarning',
            source: 'QuickBooksSync',
            jobNumber: ar.jobNumber,
            message: `QuickBooks data for closed/archive J${ar.jobNumber} saved — job stays out of Active scope`,
          });
        }
      }

      for (const inv of invoiceLines.filter(i => !i.projectId)) {
        this.importReview.addException({
          type: 'transactionMissingProject',
          source: 'QuickBooksSync',
          message: `Invoice line not linked to project: ${inv.memo ?? inv.amount}`,
        });
      }

      for (const ar of arAging.filter(a => !a.projectId)) {
        this.importReview.addException({
          type: 'unmatchedProject',
          source: 'QuickBooksSync',
          message: `AR aging row not linked to project: ${ar.customerLabel}`,
        });
      }

      const laborActuals = this.data.projectLaborActualsSnapshot();
      const duplicateKeys = new Set<string>();
      let detailCostMatched = 0;

      for (const txn of detailCostTransactions) {
        if (duplicateKeys.has(txn.importKey)) {
          txn.status = 'NeedsReview';
          this.importReview.addException({
            type: 'possibleDuplicateQbCost',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            vendorName: txn.vendorName,
            message: `Possible duplicate QB cost row (tab ${txn.sourceTabName} row ${txn.sourceRow})`,
          });
        }
        duplicateKeys.add(txn.importKey);

        if (!txn.jobNumber) {
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'QuickBooksSync',
            vendorName: txn.vendorName,
            message: `QB cost row missing job number (row ${txn.sourceRow})`,
          });
          continue;
        }

        const project = matchProject(txn.jobNumber);
        if (!project) {
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            message: `QB cost for J${txn.jobNumber} — no matching project`,
          });
          continue;
        }
        txn.projectId = project.id;
        txn.projectName = project.projectName;

        if (txn.vendorName) {
          const sub = findSubcontractorByName(subs, txn.vendorName);
          if (sub) txn.subcontractorId = sub.id;
          else if (txn.costCategory === 'Subcontractor') {
            this.importReview.addException({
              type: 'unmatchedSubcontractor',
              source: 'QuickBooksSync',
              jobNumber: txn.jobNumber,
              vendorName: txn.vendorName,
              message: `Subcontractor cost vendor "${txn.vendorName}" not matched`,
            });
          }
        }

        if (txn.costCategory === 'Labor' && laborActuals.some(a => a.projectId === project.id)) {
          txn.includeInWipActuals = false;
          txn.status = 'NeedsReview';
          this.importReview.addException({
            type: 'laborDoubleCountRisk',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            message: `QB labor cost row ${txn.sourceRow} excluded — ProjectLaborActuals present`,
          });
        }

        if (txn.costCategory === 'Other' && txn.status === 'NeedsReview') {
          this.importReview.addException({
            type: 'qbCostCategoryUnknown',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            message: `QB cost category unclear (row ${txn.sourceRow}: ${txn.account ?? txn.memo ?? 'unknown'})`,
          });
        }

        if (txn.retainageFlag) {
          this.importReview.addException({
            type: 'retainageReview',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            vendorName: txn.vendorName,
            message: `Retainage/retention line needs review (row ${txn.sourceRow})`,
          });
        }

        if (!txn.transactionDate) {
          this.importReview.addException({
            type: 'transactionMissingCategory',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            message: `QB cost row ${txn.sourceRow} missing transaction date`,
          });
        }

        if (txn.status === 'Imported' || txn.status === 'Matched') {
          txn.status = 'Matched';
          detailCostMatched++;
        }
      }

      this.syncData.upsertDetailCostTransactions(detailCostTransactions);

      const syncedAt = new Date().toISOString();
      this.syncData.replaceStore({
        customers,
        incomeByCustomer,
        invoiceLines,
        arAging,
        vendorBalances,
        billPayments,
        detailCostTransactions,
        hasDetailCostTab,
        detailCostTabName,
        detailCostWarning: hasDetailCostTab ? undefined : QB_DETAIL_COST_WARNING,
      });

      const status = errors.length ? 'Failed' : warnings.length ? 'CompletedWithWarnings' : 'Completed';
      this.syncData.logRun({
        spreadsheetId: QB_PROJECT_MGMT_SYNC.spreadsheetId,
        startedAt,
        completedAt: syncedAt,
        status,
        tabsRead,
        tabsMissing,
        rowsRead,
        rowsImported,
        warnings,
        errors,
      });

      this.importReview.logRun({
        label: 'QuickBooks Project Mgmt Sync',
        created: arUpdated,
        updated: projectsPatched,
        skipped: tabsMissing.length,
        exceptions: warnings.length,
        message: `${tabsRead.length} tabs · ${rowsImported} rows · ${arUpdated} AR · ${detailCostMatched} cost txns`,
      });

      const parts = [
        `${tabsRead.length} tab${tabsRead.length === 1 ? '' : 's'} read`,
        `${rowsImported} rows imported`,
        `${arUpdated} AR record${arUpdated === 1 ? '' : 's'}`,
      ];
      if (detailCostMatched) parts.push(`${detailCostMatched} detail cost txn${detailCostMatched === 1 ? '' : 's'}`);
      if (tabsMissing.length) parts.push(`${tabsMissing.length} tab(s) missing`);
      if (warnings.length) parts.push(`${warnings.length} warning(s)`);

      this.lastMessage.set(parts.join(' · '));
      return { rowsRead, rowsImported, warnings, tabsRead, tabsMissing, syncedAt };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastSyncError.set(msg);
      this.syncData.logRun({
        spreadsheetId: QB_PROJECT_MGMT_SYNC.spreadsheetId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'Failed',
        tabsRead,
        tabsMissing,
        rowsRead,
        rowsImported,
        warnings,
        errors: [...errors, msg],
      });
      throw err;
    } finally {
      this.syncing.set(false);
    }
  }

  private hasDetailedCost(projectId: string): boolean {
    return this.syncData.hasDetailCostsForProject(projectId)
      || this.data.projectLaborActualsSnapshot().some(a => a.projectId === projectId);
  }
}
