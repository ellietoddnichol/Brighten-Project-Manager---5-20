# Data Storage Map — Phase Zero Firebase Source of Truth

Brighten Project Manager uses **Firestore as the normalized working database**. Google Drive, Google Sheets, and the QuickBooks Sync Workbook remain **source feeds**. The app reads feeds, normalizes records into Firestore, and uses **Import Review** when imports would overwrite manual work.

Registry: `src/app/config/firestore-collections.config.ts`

---

## Source hierarchy

| Layer | Role |
|-------|------|
| **Google Drive** | Actual file bytes (contracts, COs, pay apps, COIs, photos, closeout) |
| **Firestore** | Normalized app records + file metadata (`driveFileId`, `driveFolderId`, category, linked IDs) |
| **Google Sheets** | Master Time Data, Master Data Sheet, PO sheet, budget workbooks, seed tables |
| **QuickBooks Sync Workbook** | Live accounting: invoices, AR aging, income, vendor balances, project cost detail |
| **localStorage** | UI preferences only; import/sync history dual-writes to Firestore with local fallback during migration |

---

## Document and file model (canonical)

| Collection | Role |
|------------|------|
| **`project-files`** | **Primary** file/document metadata (name, category, Drive link, workflow IDs). Archive in place — do not hard-delete from normal UI. |
| **Google Drive** | **Primary** storage for actual file bytes. |
| **`required-documents`** | Checklist of required document types per project (not the file itself). |
| **`documents`** | **Legacy** type + status rows only. Do not add new file uploads here. |
| **`subcontractor-documents`** | Sub compliance metadata; link to `project-files` when a real file exists. |
| **`activity-events`** | Append-only audit log (`project_file.created`, `archived`, etc.). |

Services: `ProjectFilesRepository` (preferred for file CRUD), `ActivityEventsService` (audit), `DataService` (listeners + migration path).

---

## Import conflict rules (global)

Imports **must not silently overwrite** when these are already set on a project:

- Status / lifecycle fields (always stripped from import patches)
- Project manager (`projectManager`)
- Foreman / superintendent (`superintendent`)
- Project profile (`projectProfile`)
- Certified payroll required (`certifiedPayrollRequired`)
- Prevailing wage flag (`prevailingWage`)
- Original contract amount (`originalContractAmount`)
- Manual budget (`wipBudgetOverride`, `estCostBudget`)
- Manual Drive link (`driveFolderId`, `driveFolderUrl`)

Implementation: `mergeImportProjectPatch()` in `src/app/utils/lifecycle-import.guard.ts`  
Conflicts → **Import Review** (`importReviewExceptions`, type `importFieldConflict`)

Foreman **bonus eligibility** lives on `project-foreman-assignments` — seed imports upsert assignments; manual assignment wins by Firestore doc id.

QB detail cost transactions **override** summary-only expense on a project when the detail tab exists.

---

## Drive rules

- Actual files **always** stay in Google Drive.
- Firestore `projectFiles` stores: `driveFileId`, `driveFolderId`, `fileName`, `fileCategory`, `sourceType`, `savedToLabel`, linked record IDs.
- Missing Drive on **active** job → one setup task (`shouldCreateDriveLinkTask`).
- Missing Drive on **archive/closed** job → **no** urgent task.
- **Never** auto-create duplicate folder trees unless user explicitly clicks **Create**.
- Manual Drive links are preserved.

---

## Labor scope (Phase Zero)

| Rule | Behavior |
|------|----------|
| Work Comp Audit | Hidden/on hold — Settings audit mode or Show all tools |
| Certified Payroll | Hidden unless `certifiedPayrollRequired`, CPR records exist, or Show all tools |
| Office/Admin/PM/PTO/NonBillable | Non-union, non-CPR, no union-rate panic |
| Foreman bonus | Excludes Office/Admin, PTO, NonBillable |
| Work comp export | Excludes Office/Admin for now |

---

## Firestore collection registry

Logical names (camelCase) map to physical Firestore paths (kebab-case).  
Collections marked **derived** or **localCache** are not yet migrated to Firestore in Phase Zero.

### projects

| | |
|---|---|
| **Physical collection** | `projects` |
| **Source of truth** | Firestore (normalized); feeds: Master Sheet, seed JSON, QB sync |
| **Writers** | SeedService, MasterSheetSyncService, QuickbooksSyncSheetsService, QboSyncService, project UI |
| **Readers** | All project views, Active 2026 Control, WIP, lifecycle |
| **Manual edits** | Yes — PM, profile, Drive link, CPR flags, contract overrides |
| **Import overwrite** | No for protected fields; lifecycle fields never imported |
| **Conflict behavior** | `mergeImportProjectPatch` → Import Review |
| **Re-import key** | `projectNumber` + Firestore `id` |

### projectFinancialSnapshots

| | |
|---|---|
| **Physical storage** | Embedded on `projects` + `billings` + `ar-records` |
| **Source of truth** | Firestore; QB workbook for live AR/billing when synced |
| **Writers** | QuickbooksSyncSheetsService, ARService, PayAppService, QboSyncService |
| **Readers** | Money tab, Billing, AR, WIP, dashboard |
| **Manual edits** | Yes for in-app billing/pay apps |
| **Import overwrite** | Financial patches only when `shouldApplyImportFinancialPatch` |
| **Conflict behavior** | Detail costs beat summary; protected fields → Import Review |
| **Re-import key** | Project id + billing period / invoice number |

### budgetLines

| | |
|---|---|
| **Physical collection** | `budget-lines` |
| **Source of truth** | Firestore after import; bundled job cost workbooks are feed |
| **Writers** | BudgetSeedService |
| **Readers** | Project Money, WIP, Active 2026 setup |
| **Manual edits** | Limited — prefer re-import |
| **Import overwrite** | Yes (upsert by project + cost code) unless manual budget differs → Import Review |
| **Conflict behavior** | `manualBudgetDiffers` exception type |
| **Re-import key** | `projectId` + cost code; marker `brighten.jobCostBudgetsImportedAt` |

### budgetSnapshots

| | |
|---|---|
| **Physical storage** | ImportDataService local cache (Phase Zero) |
| **Source of truth** | Budget workbook import source files |
| **Writers** | BudgetSeedService |
| **Readers** | Import source detail, seed completeness |
| **Manual edits** | No |
| **Import overwrite** | Yes on re-import |
| **Re-import key** | `jobNumber` + `sourceFileName` + snapshot type |

### billingRecords

| | |
|---|---|
| **Physical collection** | `billings` (+ `pay-app-lines`) |
| **Source of truth** | Firestore |
| **Writers** | PayAppService, seed, optional financial workbook |
| **Readers** | Billing page, project Money |
| **Manual edits** | Yes |
| **Import overwrite** | Workbook may supplement; app billing authoritative |
| **Re-import key** | `projectId` + billing period |

**QB invoice PDF packet** (Settings → Source Review → Import QB invoice PDF packet): loads `src/app/data/seeds/qb-invoice-packet-seed.json`. All invoices → `billings`; only open/unpaid → `ar-records`; paid → billing history only (AR closed). Job mismatch, retainage, and customer cleanup → Import Review. WIP uses billed-to-date from billings, not AR.

### arRecords

| | |
|---|---|
| **Physical collection** | `ar-records` |
| **Source of truth** | Firestore normalized from QB AR aging |
| **Writers** | QuickbooksSyncSheetsService, ARService |
| **Readers** | AR page, Active 2026 Open AR |
| **Manual edits** | Limited |
| **Import overwrite** | Yes on QB sync (open balance) |
| **Re-import key** | Project + customer/invoice key |

### quickBooksSyncRuns

| | |
|---|---|
| **Physical storage** | `localStorage` `brighten.qbProjectMgmtSync` → `lastRun` |
| **Source of truth** | QuickBooks Project Mgmt Sync Google Sheet |
| **Writers** | QuickbooksSyncSheetsService |
| **Readers** | Sync Health, cost transactions |
| **Manual edits** | No |
| **Import overwrite** | Full replace each sync run |
| **Re-import key** | Run `id` + `completedAt` |

### quickBooksInvoiceLines

| | |
|---|---|
| **Physical storage** | QB sync store `invoiceLines[]` |
| **Source of truth** | QB workbook Invoice Details tab |
| **Writers** | QuickbooksSyncSheetsService |
| **Readers** | Project financials, billed-to-date |
| **Manual edits** | No |
| **Import overwrite** | Yes each sync |
| **Re-import key** | Transaction import key from parser |

### quickBooksCostTransactions

| | |
|---|---|
| **Physical storage** | QB sync store `detailCostTransactions[]` |
| **Source of truth** | QB workbook Project Cost Detail tab |
| **Writers** | QuickbooksSyncSheetsService, ProjectCostsService |
| **Readers** | Cost Transactions, labor QBO actuals |
| **Manual edits** | No |
| **Import overwrite** | Yes; beats summary expense when present |
| **Re-import key** | `importKey` per transaction row |

### projectLaborActuals

| | |
|---|---|
| **Physical collection** | `project-labor-actuals`, `time-entries` |
| **Source of truth** | Master Time Data sheet → Firestore |
| **Writers** | TimeDataSheetSyncService, ProjectLaborActualService |
| **Readers** | Labor, Labor Actuals, WIP, Foreman Bonus |
| **Manual edits** | No for sheet-sourced rows |
| **Import overwrite** | Yes by source row key |
| **Re-import key** | `recordId` / composite sheet key |

### laborCodeMappings

| | |
|---|---|
| **Physical collection** | `labor-code-mappings` |
| **Source of truth** | Firestore (seed + Settings) |
| **Writers** | LaborCodeMappingService |
| **Readers** | Labor exceptions, WIP, bonus, CPR eligibility |
| **Manual edits** | Yes |
| **Import overwrite** | Seed upsert only for unmapped codes |
| **Re-import key** | `laborCode`; marker `brighten.laborCodeMappingsImportedAt` |

### laborExceptions

| | |
|---|---|
| **Storage** | Derived at runtime (not a Firestore collection) |
| **Source of truth** | Computed from labor actuals + mappings + projects |
| **Writers** | LaborCalculationsService |
| **Readers** | Labor → Exceptions tab |
| **Office/Admin** | Suppressed — no union/CPR/rate panic |

### subcontractors

| | |
|---|---|
| **Physical collection** | `subcontractors` |
| **Source of truth** | Firestore (QB vendor seed + manual) |
| **Writers** | SubcontractorSeedService, Subcontractors page |
| **Readers** | Subcontractors, compliance, Active 2026 Subs |
| **Manual edits** | Yes |
| **Import overwrite** | Upsert by vendor name key |
| **Re-import key** | Vendor normalized name; marker `brighten.subcontractorSeedImportedAt.{uid}` |

### projectSubcontractors

| | |
|---|---|
| **Physical collection** | `project-subcontractors` |
| **Source of truth** | Firestore |
| **Writers** | ProjectSubcontractorService, seed |
| **Readers** | Project Money/Subs, compliance tasks |
| **Manual edits** | Yes |
| **Import overwrite** | Upsert by project + sub id |
| **Re-import key** | Firestore document id |

### subcontractorDocuments

| | |
|---|---|
| **Physical collection** | `subcontractor-documents` |
| **Source of truth** | Firestore metadata; files in Drive |
| **Writers** | ProjectSubcontractorService |
| **Readers** | Compliance, COI/W-9 status |
| **Manual edits** | Yes |
| **Import overwrite** | No — new uploads create new docs |
| **Re-import key** | Document id |

### projectFiles

| | |
|---|---|
| **Physical collection** | `project-files` |
| **Source of truth** | **Drive** (bytes) + **Firestore** (metadata) |
| **Writers** | ProjectWorkflowSaveService, documents upload UI |
| **Readers** | Project Files, Documents page, missing-docs |
| **Manual edits** | Metadata yes; file in Drive |
| **Import overwrite** | New save = new row |
| **Re-import key** | UUID per `project-files` doc |

### projectFolderMappings

| | |
|---|---|
| **Physical collection** | `project-folders` (+ `projects.driveFolderId`) |
| **Source of truth** | Firestore links + user's Drive |
| **Writers** | DriveFolderSeedService, manual link |
| **Readers** | Workflow save, Drive Mapping |
| **Manual edits** | Yes — manual links preserved |
| **Import overwrite** | No auto folder creation |
| **Re-import key** | `projectId` + `folderKey` |

### tasks

| | |
|---|---|
| **Physical collection** | `project-tasks` (legacy: `tasks`) |
| **Source of truth** | Firestore |
| **Writers** | Project UI, seed |
| **Readers** | Tasks, project Work |
| **Manual edits** | Yes |
| **Import overwrite** | Seed upsert only |
| **Re-import key** | Firestore id |

### changeRequests / changeOrders

| | |
|---|---|
| **Physical collections** | `change-requests`, `change-orders` |
| **Source of truth** | Firestore; CO docs in Drive |
| **Writers** | Project UI, seed, workflow save |
| **Readers** | Changes, project Work |
| **Manual edits** | Yes |
| **Import overwrite** | No silent overwrite of signed/approved status |
| **Re-import key** | Firestore id |

### importReviewExceptions

| | |
|---|---|
| **Physical collection** | `import-exceptions` (+ `localStorage` `brighten.importExceptions` fallback) |
| **Source of truth** | Firestore target; dual-write during migration |
| **Writers** | `SourceReviewRepository` via ImportReviewService |
| **Readers** | Settings → Review Center, Sync Health |
| **Manual edits** | Resolve / ignore in UI |
| **Re-import key** | `type|jobNumber|message` dedupe key |

### syncHealthRuns

| | |
|---|---|
| **Physical collection** | `sync-runs` (+ `localStorage` `brighten.importRuns` fallback) |
| **Source of truth** | Firestore target; dual-write during migration |
| **Writers** | `SyncRunsRepository` via ImportReviewService.logRun |
| **Readers** | Settings source health |

### seedCompletenessRecords

| | |
|---|---|
| **Storage** | Derived per project (`seedCompletenessStatus` on project + gaps compute) |
| **Source of truth** | Computed from Firestore project state |
| **Readers** | Settings → Seed Completeness, Active 2026 Control |

### syncHealthRuns

| | |
|---|---|
| **Physical storage** | `localStorage` `brighten.importRuns` + per-service `lastRunStats` |
| **Source of truth** | Last sync operation metadata |
| **Readers** | Settings → Sync Health |

### featureSetupStatuses

| | |
|---|---|
| **Storage** | `FEATURE_SETUP_MATRIX` in `feature-setup.config.ts` |
| **Readers** | Settings → Feature Setup Matrix |

---

## Sheet & QB feed summary

| Feed | Spreadsheet / config | Firestore targets |
|------|---------------------|-------------------|
| Master Time Sheet | `TIME_DATA_SHEET` + Master Data timelogs | `project-labor-actuals`, `time-entries`, `employees`, `projects` (hours) |
| PO Sheet | `PO_SHEET` | `pos` |
| Budget workbooks | Bundled seed JSON | `budget-lines`, budget snapshots cache |
| QB Project Mgmt Sync | `QB_PROJECT_MGMT_SYNC` | `ar-records`, `projects` (financial fields), QB sync store |
| QBO reports seed | Bundled JSON | `projects` (WIP fields) |
| QBO cost detail seed | Bundled JSON | Project cost summaries |

---

## localStorage (UI only)

| Key | Purpose | Business truth? |
|-----|---------|----------------|
| `brighten.pinnedTools` | Sidebar pins | No |
| `brighten.globalShowAllTools` | Show hidden modules | No |
| `brighten.workCompAuditEnabled` | Work comp CSV mode | No |
| `brighten.laborCodeMappingsImportedAt` | Seed marker | Marker only |
| `brighten.subcontractorSeedImportedAt.{uid}` | Seed marker | Marker only |
| `brighten.jobCostBudgetsImportedAt` | Budget import marker | Marker only |
| `brighten.qbProjectMgmtSync` | QB normalized cache | Backed by sync runs; AR also in Firestore |
| `brighten.importExceptions` | Import Review queue | Phase Zero — migrate to Firestore later |
| `brighten.importRuns` | Sync/import run log | Audit trail only |

---

## Settings UI

| Section | Fragment | Purpose |
|---------|----------|---------|
| Sync Health | `#sync-health` | Phase Zero feed status (connected, last sync, rows, warnings) |
| Feature Setup | `#feature-setup` | Rollout matrix (Hidden / NeedsVerification / NextUp) |
| Import Review | `#import-review` | Resolve import conflicts |
| Drive Folders | `#drive-folders` | Bulk folder linking |
| Labor Codes | `#labor-codes` | Mapping CRUD |
| Job Cost Budgets | `#job-cost-budgets` | Budget import trigger |

---

## Phase Zero acceptance checklist

1. `docs/data-storage-map.md` documents all collections above  
2. Settings → Sync Health shows primary feeds with status, last sync, rows read/imported, warnings, errors, next action  
3. Firestore is documented as normalized working DB  
4. Drive stores files; Firestore stores metadata  
5. localStorage is UI/preferences (+ Phase Zero import cache markers)  
6. Office/Admin labor does not create union/CPR/rate exceptions  
7. Work Comp Audit hidden/on hold  
8. Certified Payroll hidden unless required  
9. Import field conflicts → Import Review via `mergeImportProjectPatch`  
10. Production build passes  
