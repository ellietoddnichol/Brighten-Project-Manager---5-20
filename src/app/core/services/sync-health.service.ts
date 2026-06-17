import { Injectable, inject, computed } from '@angular/core';



import { DataService } from '@core/services/data.service';



import { MasterSheetSyncService } from '@core/services/master-sheet-sync.service';



import { TimeDataSheetSyncService } from '@core/services/time-data-sheet-sync.service';



import { BudgetSeedService } from '@features/financials/services/budget-seed.service';



import { SubcontractorSeedService } from '@features/subcontractors/services/subcontractor-seed.service';



import { LaborCodeMappingService } from '@features/labor/services/labor-code-mapping.service';
import { laborCodesConfig } from '@app/config/labor-codes.config';



import { ImportReviewService } from '@core/services/import-review.service';



import { TIME_DATA_SHEET } from '@app/config/time-data-sheet.config';



import { QB_PROJECT_MGMT_SYNC } from '@app/config/qb-project-mgmt-sync.config';
import { qbSyncConfig } from '@app/config/qb-sync.config';



import { QuickBooksSyncDataService } from '@core/services/quickbooks-sync-data.service';







export type SyncHealthStatus = 'connected' | 'warning' | 'error' | 'not_connected';







export interface SyncHealthRow {



  id: string;



  label: string;



  status: SyncHealthStatus;



  lastSync?: string;



  rowsRead?: number;



  rowsImported?: number;



  warnings?: string[];



  errors?: string[];



  sourceId?: string;



  detail?: string;



  nextAction?: string;



}







@Injectable({ providedIn: 'root' })



export class SyncHealthService {



  private data = inject(DataService);



  private masterSync = inject(MasterSheetSyncService);



  private timeSync = inject(TimeDataSheetSyncService);



  private budgetSeed = inject(BudgetSeedService);



  private subDiscovery = inject(SubcontractorSeedService);



  private laborCodes = inject(LaborCodeMappingService);



  private importReview = inject(ImportReviewService);



  private qbSyncData = inject(QuickBooksSyncDataService);







  /** Primary source feeds shown in Settings → Sync Health */



  rows = computed((): SyncHealthRow[] => {



    const masterStats = this.masterSync.lastRunStats();



    const timeStats = this.timeSync.lastRunStats();



    const qbRun = this.qbSyncData.lastRun();



    const folderLinks = this.data.projectFoldersSnapshot().length;



    const projects = this.data.projectsSnapshot().length;



    const subs = this.data.subcontractorsSnapshot().length;



    const mappings = this.laborCodes.snapshot().length;



    const budgetImported = this.budgetSeed.budgetImportMeta().projectCount;



    const exceptions = this.importReview.unresolvedCount();







    const masterTimeRowsRead = (masterStats?.rowsRead ?? 0) + (timeStats?.rowsRead ?? 0);



    const masterTimeRowsImported = (masterStats?.rowsImported ?? 0) + (timeStats?.rowsImported ?? 0);



    const masterTimeErrors = [



      ...(this.masterSync.lastSyncError() ? [this.masterSync.lastSyncError()!] : []),



      ...(this.timeSync.lastSyncError() ? [this.timeSync.lastSyncError()!] : []),



    ];



    const masterTimeWarnings = [



      ...(masterStats?.warnings ?? []),



      ...(timeStats?.warnings ?? []),



    ];



    const masterTimeLastSync = this.timeSync.lastSyncAt() ?? this.masterSync.lastSyncAt();







    const rows: SyncHealthRow[] = [



      {



        id: 'master-time',



        label: 'Master Time Sheet',



        status: masterTimeErrors.length



          ? 'error'



          : (masterTimeLastSync ? (masterTimeWarnings.length ? 'warning' : 'connected') : 'not_connected'),



        lastSync: masterTimeLastSync ?? undefined,



        rowsRead: masterTimeRowsRead || undefined,



        rowsImported: masterTimeRowsImported || undefined,



        warnings: masterTimeWarnings.length ? masterTimeWarnings : undefined,



        errors: masterTimeErrors.length ? masterTimeErrors : undefined,



        sourceId: TIME_DATA_SHEET.spreadsheetId,



        detail: this.timeSync.lastSyncMessage() ?? this.masterSync.lastSyncMessage() ?? undefined,



        nextAction: masterTimeLastSync ? 'Re-sync Master Time Sheet' : 'Sign in and sync Master Time Data',



      },



      {



        id: 'qb-workbook',



        label: 'QuickBooks Sync',



        status: qbSyncConfig.isManualMode()
          ? 'connected'
          : (qbRun?.status === 'Failed'
          ? 'error'
          : (qbRun?.completedAt ? (qbRun.warnings?.length ? 'warning' : 'connected') : 'not_connected')),



        lastSync: qbSyncConfig.isManualMode() ? undefined : (qbRun?.completedAt ?? undefined),



        rowsRead: qbSyncConfig.isManualMode() ? undefined : qbRun?.rowsRead,



        rowsImported: qbSyncConfig.isManualMode() ? undefined : qbRun?.rowsImported,



        warnings: qbSyncConfig.isManualMode() ? undefined : (qbRun?.warnings?.length ? qbRun.warnings : undefined),



        errors: qbSyncConfig.isManualMode() ? undefined : (qbRun?.errors?.length ? qbRun.errors : undefined),



        sourceId: QB_PROJECT_MGMT_SYNC.spreadsheetId,



        detail: qbSyncConfig.isManualMode()
          ? 'Manual entry mode — workbook auto-sync is off. Edit each project in the app.'
          : (qbRun
          ? `${qbRun.tabsRead.length} tab(s) · AR + invoices + vendor balances + detail costs`
          : undefined),



        nextAction: qbSyncConfig.isManualMode()
          ? 'Enable workbook sync in Settings → Source Health if needed later'
          : (qbRun?.completedAt ? 'Re-sync QuickBooks workbook' : 'Sign in — auto-sync runs on load'),



      },



      {



        id: 'drive-folders',



        label: 'Drive Folder Links',



        status: folderLinks > 0 ? 'connected' : 'not_connected',



        detail: `${folderLinks} folder mapping(s) in Firestore · files stay in Google Drive`,



        rowsImported: folderLinks || undefined,



        warnings: folderLinks === 0 ? ['No project folder links yet'] : undefined,



        nextAction: folderLinks === 0 ? 'Settings → Drive Folders → link mapped folders' : undefined,



      },



      {



        id: 'budget-import',



        label: 'Budget Workbooks',



        status: budgetImported > 0 ? 'connected' : 'not_connected',



        rowsImported: budgetImported || undefined,



        detail: budgetImported > 0
          ? `${budgetImported} budget workbook(s) imported to Firestore`
          : 'Not connected — budget workbook import is parked for Phase 2',



        nextAction: budgetImported > 0 ? 'Review imported budgets' : 'Parked — enter budgets manually via project Budget tab',



      },



      {



        id: 'sub-discovery',



        label: 'Subcontractor Discovery',



        status: subs > 0 ? 'connected' : (this.subDiscovery.sourceDataAvailable() ? 'warning' : 'not_connected'),



        rowsImported: subs,



        detail: `${subs} subcontractors in Firestore`,



        warnings: subs === 0 && this.subDiscovery.sourceDataAvailable()
          ? ['Source data available — discover on Subcontractors page']
          : (subs === 0
            ? (qbSyncConfig.isManualMode()
              ? ['Add subcontractors manually in Directory']
              : ['Re-sync QuickBooks workbook first'])
            : undefined),



        nextAction: subs === 0
          ? (qbSyncConfig.isManualMode()
            ? 'Directory → New Subcontractor'
            : 'Discover subcontractors from QuickBooks / Drive')
          : 'Review vendor candidates',



      },



      {



        id: 'labor-codes',



        label: 'Labor Code Discovery',



        status: laborCodesConfig.deferSetup
          ? 'connected'
          : (mappings > 0 ? 'connected' : (masterTimeLastSync ? 'warning' : 'not_connected')),



        rowsImported: mappings,



        detail: laborCodesConfig.deferSetup
          ? 'Deferred — set up when ready'
          : `${mappings} mapped labor codes`,



        warnings: laborCodesConfig.deferSetup
          ? undefined
          : (mappings === 0 && masterTimeLastSync ? ['Discover labor codes from Master Time Sheet'] : undefined),



        nextAction: laborCodesConfig.deferSetup
          ? undefined
          : (mappings === 0 ? 'Discover labor codes from Master Time Sheet' : 'Review unmapped codes'),



      },



      {



        id: 'firestore',



        label: 'Firestore Normalized Records',



        status: projects > 0 ? 'connected' : 'error',



        rowsImported: projects,



        detail: [



          `${projects} projects`,



          `${this.data.budgetLinesSnapshot().length} budget lines`,



          `${this.data.arRecordsSnapshot().length} AR records`,



          `${this.data.projectLaborActualsSnapshot().length} labor actuals`,



          `${this.data.projectFilesSnapshot().length} file metadata rows`,



        ].join(' · '),



        errors: projects === 0 ? ['No projects in Firestore — sync Master Sheet or set up projects'] : undefined,



        nextAction: projects === 0 ? 'Sync Master Sheet or add projects manually' : undefined,



      },



    ];







    if (exceptions > 0) {



      rows.push({



        id: 'import-exceptions',



        label: 'Source Review',



        status: 'warning',



        rowsImported: exceptions,



        warnings: [`${exceptions} unresolved — review unmatched rows before overwriting manual fields`],



        nextAction: 'Review unmatched rows',



      });



    }







    return rows;



  });







  blockingWarnings = computed(() =>



    this.rows().filter(r =>



      r.id !== 'budget-import'



      && (r.status === 'error'



      || (r.status === 'warning' && ((r.warnings?.length ?? 0) > 0 || (r.errors?.length ?? 0) > 0))),



    ),



  );



}



