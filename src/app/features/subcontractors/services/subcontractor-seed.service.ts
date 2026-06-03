import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DataService } from '@core/services/data.service';
import { ImportReviewService } from '@core/services/import-review.service';
import { ImportDataService } from '@core/services/import-data.service';
import { ProjectLifecycleService } from '@features/projects/services/project-lifecycle.service';
import { ProjectSubcontractor, Subcontractor } from '@app/models/subcontractor.types';
import { SubcontractorCostTransaction } from '@app/models/import.types';
import { findProjectMatches, pickCanonicalProject } from '@features/projects/utils/project-dedupe';
import {
  displayCompanyName,
  findSubcontractorByName,
  normalizeCompanyName,
  resolveVendorFromFolderName,
  vendorNamesMatch,
} from '@shared/utils/vendor-normalizers';
import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';
import { auth } from '@app/firebase';
import { createLazyJsonLoader } from '@core/utils/mock-data-loader';

interface MasterSeedVendor {
  companyName: string;
  normalizedName: string;
  seededTotalCost: number;
}

interface DetailSeedTxn {
  vendorName: string;
  normalizedVendorName: string;
  jobNumber?: string;
  projectName?: string;
  transactionDate?: string;
  transactionType?: string;
  transactionNumber?: string;
  description?: string;
  distributionAccount?: string;
  amount: number;
  retainageFlag?: boolean;
  importKey: string;
}

interface DetailProjectSub {
  vendorName: string;
  normalizedVendorName: string;
  jobNumber: string;
  projectName?: string;
  importedCostToDate: number;
  invoicedToDate: number;
  transactionCount: number;
}

interface ProjectSubLink {
  vendorName: string;
  jobNumber: string;
  projectName?: string;
}

interface DriveProjectSubFolders {
  jobNumber: string;
  projectName?: string;
  lifecycleStatus?: string;
  hasSubsFolder?: boolean;
  subFolderNames: string[];
}

const masterLoader = createLazyJsonLoader<{ meta: Record<string, unknown>; vendors: MasterSeedVendor[] }>('seeds/subcontractor-master-seed.json');
const detailLoader = createLazyJsonLoader<{
  meta: Record<string, unknown>;
  transactions: DetailSeedTxn[];
  projectSubcontractors: DetailProjectSub[];
}>('seeds/subcontractor-detail-seed.json');
const confirmedLoader = createLazyJsonLoader<{ meta: Record<string, unknown>; links: ProjectSubLink[] }>('seeds/subcontractor-confirmed-links-seed.json');
const driveSubsLoader = createLazyJsonLoader<{
  meta: Record<string, unknown>;
  activeProjectSubFolders: DriveProjectSubFolders[];
  closedJobsWithSubFolders: { jobNumber: string; projectName?: string }[];
}>('seeds/drive-sub-folders-seed.json');

async function loadSubcontractorSeedBundles() {
  const [MASTER, DETAIL, CONFIRMED, DRIVE_SUBS] = await Promise.all([
    masterLoader.get(),
    detailLoader.get(),
    confirmedLoader.get(),
    driveSubsLoader.get(),
  ]);
  return { MASTER, DETAIL, CONFIRMED, DRIVE_SUBS };
}

const IMPORTED_KEY = 'brighten.subcontractorSeedImportedAt';
const SEED_VERSION = '2026-03-08-qb-drive-v2';

@Injectable({ providedIn: 'root' })
export class SubcontractorSeedService {
  private data = inject(DataService);
  private lifecycle = inject(ProjectLifecycleService);
  private importReview = inject(ImportReviewService);
  private importData = inject(ImportDataService);
  private qbSyncData = inject(QuickBooksSyncDataService);

  syncing = signal(false);
  lastMessage = signal<string | null>(null);
  costTransactions = signal<SubcontractorCostTransaction[]>([]);

  masterMeta: Record<string, unknown> | null = null;
  detailMeta: Record<string, unknown> | null = null;
  driveSubMeta: Record<string, unknown> | null = null;

  constructor() {
    void loadSubcontractorSeedBundles().then(({ MASTER, DETAIL, DRIVE_SUBS }) => {
      this.masterMeta = MASTER.meta;
      this.detailMeta = DETAIL.meta;
      this.driveSubMeta = DRIVE_SUBS.meta;
    });
  }

  /** Production workflow — no auto-import from bundled seed files. */
  async importIfNeeded(_force = false): Promise<void> {
    if (this.qbSyncData.lastRun()?.completedAt) {
      this.loadCostTransactionsFromQuickBooksSync();
    }
  }

  /** Whether live QuickBooks sync data is available for discovery. */
  sourceDataAvailable(): boolean {
    return !!(this.qbSyncData.vendorBalances().length
      || this.qbSyncData.detailCostTransactions().length
      || this.qbSyncData.lastRun()?.completedAt);
  }

  loadCostTransactionsFromQuickBooksSync(): void {
    const txns: SubcontractorCostTransaction[] = this.qbSyncData.detailCostTransactions()
      .filter(t => t.costCategory === 'Subcontractor' && t.status !== 'Ignored')
      .map(t => ({
        id: t.importKey,
        source: 'QuickBooksSync' as const,
        vendorName: displayCompanyName(t.vendorName ?? ''),
        jobNumber: t.jobNumber,
        projectName: t.projectName,
        projectId: t.projectId,
        transactionType: t.transactionType,
        transactionDate: t.transactionDate,
        transactionNumber: t.transactionNumber,
        description: t.description ?? t.memo,
        distributionAccount: t.account,
        amount: t.amount,
        retainageFlag: t.retainageFlag,
        status: (t.jobNumber ? 'Imported' : 'NeedsReview') as SubcontractorCostTransaction['status'],
        importKey: t.importKey,
      }));
    if (txns.length) {
      this.costTransactions.set(txns);
      this.importData.upsertSubCostTransactions(txns);
    }
  }

  async loadCostTransactionsFromSeed(): Promise<void> {
    const { DETAIL } = await loadSubcontractorSeedBundles();
    const txns = DETAIL.transactions.map(t => ({
      id: t.importKey,
      source: 'QuickBooksSeed' as const,
      vendorName: displayCompanyName(t.vendorName),
      jobNumber: t.jobNumber,
      projectName: t.projectName,
      transactionType: t.transactionType,
      transactionDate: t.transactionDate,
      transactionNumber: t.transactionNumber,
      description: t.description,
      distributionAccount: t.distributionAccount,
      amount: t.amount,
      retainageFlag: t.retainageFlag,
      status: (t.jobNumber ? 'Imported' : 'NeedsReview') as SubcontractorCostTransaction['status'],
      importKey: t.importKey,
    }));
    this.costTransactions.set(txns);
    this.importData.upsertSubCostTransactions(txns);
  }

  private async ensureMasterSubcontractor(
    subs: Subcontractor[],
    subByNorm: Map<string, Subcontractor>,
    companyName: string,
    options: { seededTotalCost?: number; source: Subcontractor['source']; notes: string },
    overwriteManual: boolean,
  ): Promise<{ sub: Subcontractor; created: boolean; updated: boolean }> {
    const canonical = displayCompanyName(companyName);
    const norm = normalizeCompanyName(canonical);
    let existing = subByNorm.get(norm) ?? findSubcontractorByName(subs, canonical);

    if (!existing) {
      const createdSub = await firstValueFrom(this.data.createSubcontractor({
        companyName: canonical,
        status: 'PendingSetup',
        w9Status: 'Missing',
        insuranceStatus: 'Missing',
        source: options.source,
        vendorClassification: 'NeedsReview',
        seededTotalCost: options.seededTotalCost,
        notes: options.notes,
      }));
      subByNorm.set(norm, createdSub);
      subs.push(createdSub);
      return { sub: createdSub, created: true, updated: false };
    }

    const isManual = existing.source === 'Manual';
    if (isManual && !overwriteManual) {
      return { sub: existing, created: false, updated: false };
    }

    const patch: Partial<Subcontractor> = {};
    if (options.seededTotalCost != null && (overwriteManual || !existing.seededTotalCost)) {
      patch.seededTotalCost = options.seededTotalCost;
    }
    if (!existing.source || existing.source === 'Manual') patch.source = options.source;
    if (canonical !== existing.companyName && vendorNamesMatch(canonical, existing.companyName)) {
      patch.companyName = canonical;
    }
    if (options.notes && !existing.notes?.includes(options.notes.slice(0, 24))) {
      patch.notes = existing.notes?.includes('Discovered from') || existing.notes?.includes('Seeded from')
        ? existing.notes
        : `${existing.notes ? `${existing.notes} · ` : ''}${options.notes}`.trim();
    }

    if (Object.keys(patch).length) {
      await firstValueFrom(this.data.updateSubcontractor(existing.id, patch));
      existing = { ...existing, ...patch };
      subByNorm.set(norm, existing);
      return { sub: existing, created: false, updated: true };
    }

    return { sub: existing, created: false, updated: false };
  }

  private projectSubStatus(projectId: string): ProjectSubcontractor['status'] {
    const group = this.lifecycle.snapshotMap().get(projectId)?.projectLifecycleGroup;
    if (group === 'Archive' || group === 'Closed2026') return 'Closed';
    if (group === 'Upcoming') return 'Planned';
    if (group === 'Closeout') return 'Active';
    return 'Active';
  }

  private async upsertProjectSubcontractor(
    existingProjectSubs: ProjectSubcontractor[],
    payload: Partial<ProjectSubcontractor> & {
      projectId: string;
      subcontractorId: string;
      subcontractorName: string;
    },
    overwriteManual: boolean,
  ): Promise<boolean> {
    const existingPs = existingProjectSubs.find(ps =>
      ps.projectId === payload.projectId
      && vendorNamesMatch(ps.subcontractorName, payload.subcontractorName),
    );

    if (existingPs) {
      if (existingPs.importSource && existingPs.importSource !== payload.importSource && !overwriteManual) {
        return false;
      }
      const merged: Partial<ProjectSubcontractor> = {
        ...payload,
        invoicedToDate: payload.invoicedToDate ?? existingPs.invoicedToDate,
        importedCostToDate: payload.importedCostToDate ?? existingPs.importedCostToDate,
        notes: existingPs.notes?.includes('Discovered from') || existingPs.notes?.includes('Seeded from')
          ? existingPs.notes
          : `${existingPs.notes ? `${existingPs.notes} · ` : ''}${payload.notes ?? ''}`.trim(),
      };
      await firstValueFrom(this.data.updateProjectSubcontractor(existingPs.id, merged));
      return true;
    }

    await firstValueFrom(this.data.createProjectSubcontractor({
      ...payload,
      trade: payload.trade ?? 'Subcontractor',
      complianceStatus: 'MissingItems',
      performanceStatus: 'Good',
      status: payload.status ?? 'Planned',
    }));
    existingProjectSubs.push(payload as ProjectSubcontractor);
    return true;
  }

  /** Discover subcontractors from live QuickBooks sync workbook and Drive metadata. */
  async discoverFromSources(overwriteManual = false): Promise<{
    created: number;
    updated: number;
    projectSubs: number;
    driveOnly: number;
  }> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to discover subcontractors from source data.');

    const vendorBalances = this.qbSyncData.vendorBalances();
    const detailTxns = this.qbSyncData.detailCostTransactions();
    const billPayments = this.qbSyncData.billPayments();

    if (!vendorBalances.length && !detailTxns.length && !billPayments.length) {
      this.importReview.addException({
        type: 'qbSyncWarning',
        source: 'QuickBooksSync',
        message: 'Re-sync QuickBooks Project Mgmt Sync Workbook before discovering subcontractors',
        status: 'NeedsReview',
      });
      throw new Error('No QuickBooks sync data — re-sync the workbook in Settings → Import Review first.');
    }

    this.syncing.set(true);
    let created = 0;
    let updated = 0;
    let projectSubs = 0;
    let driveOnly = 0;

    try {
      this.loadCostTransactionsFromQuickBooksSync();
      const projects = await this.data.waitForProjectsLoaded();
      const existingSubs = await firstValueFrom(this.data.getSubcontractors());
      const existingProjectSubs = await firstValueFrom(this.data.getProjectSubcontractors());
      const subs = [...existingSubs];
      const subByNorm = new Map(subs.map(s => [normalizeCompanyName(s.companyName), s]));

      const vendorTotals = new Map<string, number>();
      for (const txn of detailTxns) {
        if (!txn.vendorName || txn.costCategory !== 'Subcontractor') continue;
        const name = displayCompanyName(txn.vendorName);
        vendorTotals.set(name, (vendorTotals.get(name) ?? 0) + Math.abs(txn.amount));
      }

      const vendorNames = new Set<string>();
      for (const row of vendorBalances) vendorNames.add(displayCompanyName(row.vendorName));
      for (const row of billPayments) {
        if (row.vendorName) vendorNames.add(displayCompanyName(row.vendorName));
      }
      for (const txn of detailTxns) {
        if (txn.vendorName) vendorNames.add(displayCompanyName(txn.vendorName));
      }

      for (const vendorName of vendorNames) {
        const result = await this.ensureMasterSubcontractor(
          subs,
          subByNorm,
          vendorName,
          {
            seededTotalCost: vendorTotals.get(vendorName),
            source: 'QuickBooksSync',
            notes: 'Discovered from QuickBooks Vendor Balance / Bill Payments / Project Cost Detail',
          },
          overwriteManual,
        );
        if (result.created) created++;
        if (result.updated) updated++;
      }

      const costByLink = new Map<string, { cost: number; count: number }>();
      for (const txn of detailTxns) {
        if (!txn.jobNumber || !txn.vendorName || txn.costCategory !== 'Subcontractor') continue;
        const key = `${txn.jobNumber}|${normalizeCompanyName(displayCompanyName(txn.vendorName))}`;
        const bucket = costByLink.get(key) ?? { cost: 0, count: 0 };
        bucket.cost += Math.abs(txn.amount);
        bucket.count += 1;
        costByLink.set(key, bucket);
      }

      const linkKeys = new Set<string>();
      for (const txn of detailTxns) {
        if (!txn.jobNumber || !txn.vendorName || txn.costCategory !== 'Subcontractor') continue;
        const vendorName = displayCompanyName(txn.vendorName);
        const linkKey = `${txn.jobNumber}|${normalizeCompanyName(vendorName)}`;
        if (linkKeys.has(linkKey)) continue;
        linkKeys.add(linkKey);

        let sub = findSubcontractorByName(subs, vendorName);
        if (!sub) {
          const result = await this.ensureMasterSubcontractor(
            subs,
            subByNorm,
            vendorName,
            {
              source: 'QuickBooksSync',
              notes: 'Discovered from QuickBooks Project Cost Detail',
            },
            overwriteManual,
          );
          sub = result.sub;
          if (result.created) created++;
          if (result.updated) updated++;
        }
        if (!sub) continue;

        const matches = findProjectMatches(projects, {
          projectNumber: txn.jobNumber,
          projectName: txn.projectName,
        });
        if (!matches.length) {
          this.importReview.addException({
            type: 'unmatchedProject',
            source: 'QuickBooksSync',
            jobNumber: txn.jobNumber,
            vendorName: sub.companyName,
            message: `No project match for J${txn.jobNumber} (${sub.companyName}) from QB cost detail`,
          });
          continue;
        }

        const project = pickCanonicalProject(matches);
        const cost = costByLink.get(linkKey);
        const wrote = await this.upsertProjectSubcontractor(existingProjectSubs, {
          projectId: project.id,
          jobNumber: txn.jobNumber,
          projectName: txn.projectName ?? project.projectName,
          subcontractorId: sub.id,
          subcontractorName: sub.companyName,
          trade: 'Subcontractor',
          importedCostToDate: cost?.cost,
          importSource: 'QuickBooksSync',
          status: this.projectSubStatus(project.id),
          complianceStatus: 'MissingItems',
          notes: 'Discovered from QuickBooks Project Cost Detail / Bill Details',
        }, overwriteManual);
        if (wrote) projectSubs++;
        this.importData.linkTransactionsToProject(txn.jobNumber!, project.id);
      }

      const driveLinks = new Map<string, { projectId: string; jobNumber: string; vendorHint: string; projectName?: string }>();
      for (const file of this.data.projectFilesSnapshot()) {
        if (!file.projectId || file.folderKey !== 'SUBS') continue;
        const project = projects.find(p => p.id === file.projectId);
        if (!project?.projectNumber) continue;
        const parts = (file.drivePath ?? file.savedToLabel ?? '').split('/').filter(Boolean);
        const subsIdx = parts.findIndex(p => /subs/i.test(p));
        const vendorHint = subsIdx >= 0 && parts[subsIdx + 1] ? parts[subsIdx + 1] : undefined;
        if (!vendorHint) continue;
        driveLinks.set(`${project.projectNumber}|${vendorHint.toLowerCase()}`, {
          projectId: project.id,
          jobNumber: project.projectNumber,
          projectName: project.projectName,
          vendorHint,
        });
      }

      for (const link of driveLinks.values()) {
        const resolved = resolveVendorFromFolderName(link.vendorHint);
        const result = await this.ensureMasterSubcontractor(
          subs,
          subByNorm,
          resolved.companyName,
          {
            source: 'DriveDiscovery',
            notes: `Discovered from Drive Subs folder on J${link.jobNumber}`,
          },
          overwriteManual,
        );
        if (result.created) created++;
        if (!resolved.matched) {
          driveOnly++;
          this.importReview.addException({
            type: 'unmatchedVendor',
            source: 'DriveAudit',
            jobNumber: link.jobNumber,
            vendorName: link.vendorHint,
            message: `Drive Subs folder "${link.vendorHint}" on J${link.jobNumber} — review vendor classification`,
          });
        }
        const sub = result.sub;
        const wrote = await this.upsertProjectSubcontractor(existingProjectSubs, {
          projectId: link.projectId,
          jobNumber: link.jobNumber,
          projectName: link.projectName,
          subcontractorId: sub.id,
          subcontractorName: sub.companyName,
          trade: 'Subcontractor',
          importSource: 'DriveDiscovery',
          status: this.projectSubStatus(link.projectId),
          complianceStatus: 'MissingItems',
          notes: `Discovered from Drive Subs folder "${link.vendorHint}"`,
        }, overwriteManual);
        if (wrote) projectSubs++;
      }

      const linkedTxns = this.costTransactions().map(t => {
        const matches = findProjectMatches(projects, { projectNumber: t.jobNumber });
        const project = matches.length ? pickCanonicalProject(matches) : undefined;
        const sub = findSubcontractorByName(subs, t.vendorName);
        return {
          ...t,
          projectId: project?.id ?? t.projectId,
          subcontractorId: sub?.id,
        };
      });
      this.importData.upsertSubCostTransactions(linkedTxns);
      this.costTransactions.set(linkedTxns);

      this.lastMessage.set(
        `Discovered ${created} subcontractor${created === 1 ? '' : 's'}`
        + (updated ? ` · ${updated} updated` : '')
        + (projectSubs ? ` · ${projectSubs} project link${projectSubs === 1 ? '' : 's'}` : '')
        + (driveOnly ? ` · ${driveOnly} Drive vendor(s) need review` : ''),
      );
      return { created, updated, projectSubs, driveOnly };
    } finally {
      this.syncing.set(false);
    }
  }

  /** Dev/demo bundled seed import — not the production workflow. */
  async syncFromSeed(overwriteManual = false): Promise<{
    created: number;
    updated: number;
    projectSubs: number;
    driveOnly: number;
  }> {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in to import subcontractor data.');

    this.syncing.set(true);
    let created = 0;
    let updated = 0;
    let projectSubs = 0;
    let driveOnly = 0;

    try {
      await this.loadCostTransactionsFromSeed();
      const { MASTER, DETAIL, CONFIRMED, DRIVE_SUBS } = await loadSubcontractorSeedBundles();
      const projects = await this.data.waitForProjectsLoaded();
      const existingSubs = await firstValueFrom(this.data.getSubcontractors());
      const existingProjectSubs = await firstValueFrom(this.data.getProjectSubcontractors());
      const subs = [...existingSubs];
      const subByNorm = new Map(subs.map(s => [normalizeCompanyName(s.companyName), s]));

      for (const vendor of MASTER.vendors) {
        const result = await this.ensureMasterSubcontractor(
          subs,
          subByNorm,
          vendor.companyName,
          {
            seededTotalCost: vendor.seededTotalCost,
            source: 'QuickBooksSeed',
            notes: 'Seeded from QuickBooks subcontractor cost report March 8 2025–March 8 2026',
          },
          overwriteManual,
        );
        if (result.created) created++;
        if (result.updated) updated++;
      }

      const qbCostByLink = new Map<string, DetailProjectSub>();
      for (const row of DETAIL.projectSubcontractors) {
        qbCostByLink.set(`${row.jobNumber}|${normalizeCompanyName(row.vendorName)}`, row);
      }

      const linkKeys = new Set<string>();
      const allLinks: Array<ProjectSubLink & { importSource: 'QuickBooksSeed' | 'DriveSeed'; driveFolderName?: string }> = [
        ...DETAIL.projectSubcontractors.map(r => ({
          vendorName: r.vendorName,
          jobNumber: r.jobNumber,
          projectName: r.projectName,
          importSource: 'QuickBooksSeed' as const,
        })),
        ...CONFIRMED.links.map(l => ({ ...l, importSource: 'QuickBooksSeed' as const })),
      ];

      for (const job of DRIVE_SUBS.activeProjectSubFolders) {
        for (const folderName of job.subFolderNames) {
          allLinks.push({
            vendorName: folderName,
            jobNumber: job.jobNumber,
            projectName: job.projectName,
            importSource: 'DriveSeed',
            driveFolderName: folderName,
          });
        }
      }

      for (const link of allLinks) {
        const canonicalVendor = link.importSource === 'DriveSeed'
          ? resolveVendorFromFolderName(link.vendorName).companyName
          : displayCompanyName(link.vendorName);
        const linkKey = `${link.jobNumber}|${normalizeCompanyName(canonicalVendor)}|${link.importSource}`;
        if (linkKeys.has(linkKey)) continue;
        linkKeys.add(linkKey);

        const resolved = link.importSource === 'DriveSeed'
          ? resolveVendorFromFolderName(link.vendorName)
          : { companyName: canonicalVendor, matched: true };

        let sub = findSubcontractorByName(subs, resolved.companyName);
        if (!sub && resolved.matched) {
          const result = await this.ensureMasterSubcontractor(
            subs,
            subByNorm,
            resolved.companyName,
            {
              source: link.importSource === 'DriveSeed' ? 'DriveSeed' : 'QuickBooksSeed',
              notes: link.importSource === 'DriveSeed'
                ? `Seeded from Drive Subs folder on J${link.jobNumber}`
                : 'Seeded from QuickBooks subcontractor detail report',
            },
            overwriteManual,
          );
          sub = result.sub;
          if (result.created) created++;
          if (result.updated) updated++;
        } else if (!sub && !resolved.matched) {
          this.importReview.addException({
            type: 'unmatchedSubcontractor',
            source: 'DriveSeed',
            jobNumber: link.jobNumber,
            vendorName: link.vendorName,
            message: `Drive Subs folder "${link.vendorName}" on J${link.jobNumber} — no QuickBooks vendor match`,
          });
          const result = await this.ensureMasterSubcontractor(
            subs,
            subByNorm,
            link.vendorName,
            {
              source: 'DriveSeed',
              notes: `Drive Subs folder on J${link.jobNumber} — verify vendor name and link to master subcontractor`,
            },
            overwriteManual,
          );
          sub = result.sub;
          driveOnly++;
          if (result.created) created++;
        }

        if (!sub) continue;

        const matches = findProjectMatches(projects, {
          projectNumber: link.jobNumber,
          projectName: link.projectName,
        });
        if (!matches.length) {
          this.importReview.addException({
            type: 'unmatchedProject',
            source: link.importSource,
            jobNumber: link.jobNumber,
            vendorName: sub.companyName,
            message: `No project match for J${link.jobNumber} (${sub.companyName})`,
          });
          continue;
        }

        const project = pickCanonicalProject(matches);
        const qbCost = qbCostByLink.get(`${link.jobNumber}|${normalizeCompanyName(sub.companyName)}`);
        const notes = link.importSource === 'DriveSeed'
          ? `Seeded from Drive Subs folder "${link.driveFolderName ?? link.vendorName}"`
          : qbCost
            ? 'Seeded from QuickBooks subcontractor detail report'
            : 'Seeded from confirmed QuickBooks vendor + job link';

        const wrote = await this.upsertProjectSubcontractor(existingProjectSubs, {
          projectId: project.id,
          jobNumber: link.jobNumber,
          projectName: link.projectName ?? project.projectName,
          subcontractorId: sub.id,
          subcontractorName: sub.companyName,
          trade: 'Subcontractor',
          invoicedToDate: qbCost?.invoicedToDate,
          importedCostToDate: qbCost?.importedCostToDate,
          importSource: link.importSource,
          status: this.projectSubStatus(project.id),
          complianceStatus: 'MissingItems',
          notes,
        }, overwriteManual);
        if (wrote) projectSubs++;
        this.importData.linkTransactionsToProject(link.jobNumber, project.id);
        this.importData.setProjectFlags({
          jobNumber: link.jobNumber,
          projectId: project.id,
          subcontractorDataImported: true,
          importedAt: new Date().toISOString(),
        });
      }

      const linkedTxns = this.costTransactions().map(t => {
        const matches = findProjectMatches(projects, { projectNumber: t.jobNumber });
        const project = matches.length ? pickCanonicalProject(matches) : undefined;
        const sub = project ? findSubcontractorByName(subs, t.vendorName) : undefined;
        return {
          ...t,
          projectId: project?.id,
          subcontractorId: sub?.id,
        };
      });
      this.importData.upsertSubCostTransactions(linkedTxns);
      this.costTransactions.set(linkedTxns);
      this.lastMessage.set(
        `Subcontractors: ${created} created, ${updated} updated, ${projectSubs} project subs`
        + (driveOnly ? ` · ${driveOnly} Drive-only vendors need review` : ''),
      );
      return { created, updated, projectSubs, driveOnly };
    } finally {
      this.syncing.set(false);
    }
  }
}
