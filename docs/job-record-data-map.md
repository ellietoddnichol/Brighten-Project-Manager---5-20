# Job Record Data Map

Manual-first phase: **Firestore is the live source of truth** for user-edited job records. **Cloud SQL / MySQL** is the reporting, import, and accounting layer. **Google Drive** stores actual files.

## Storage pattern

| Layer | Role |
|-------|------|
| Firestore | Live editable job records, realtime UI |
| Cloud SQL / MySQL | Read views, pay apps/SOV, imports, reporting |
| Google Drive | File bytes and job folders |

Nested collections are acceptable; this repo uses **top-level collections** with `projectId` fields (matches existing `data.service.ts` listeners).

---

## 1. Core Job Record

**Primary (manual):** Firestore `projects`

**Read/reporting:** Cloud SQL `brighten_pm.projects`, view `brighten_pm.v_project_dashboard`, API `/api/projects`, `/api/projects/:id`

**Key fields:** job number, name, profile, customer, address, status, contract amounts, billed to date, retainage, dates, attribute toggles (prevailing wage, retainage required, progress billing, tax exempt, bond, has subs, T&M billing, archived).

**Behavior:** All manual edits save to Firestore on blur/submit. Master sheet sync refreshes timelog hours only in manual mode; identity fields edited in the app are not overwritten.

---

## 2. Customer / Directory

**Primary:** Firestore `companies` (auto-created when a customer is entered on a job)

**Fallback:** `projects.customer` string on the job record

**Future/reporting:** Cloud SQL `companies`

**Behavior:** Creating or editing a job customer upserts a `companies` row. Directory does not require QuickBooks.

---

## 3. Subcontractors / Subs / Directory

**Primary:** Firestore `subcontractors`, `project-subcontractors`, `subcontractor-documents`, `subcontractor-invoices`

**Read/reporting:** API `/api/subcontractors`, `/api/projects/:id/subcontractors`, Cloud SQL vendor tables

**Behavior:** Subs tab shows when `hasSubcontractors` is checked or project-subcontractor links exist. Adding a sub from a job creates directory + project link. No compliance warnings in this phase.

---

## 4. Labor

**Primary:** Firestore `project-labor-entries` (manual rows)

**Also used:** `time-entries`, `project-labor-actuals` for imported/sheet labor

**Fields:** date, employee, classification, labor code, reg/OT/DT hours, total hours, cost rate, notes

**UI:** Labor tab + total hours on job header and Projects list

---

## 5. Materials

**Primary:** Firestore `project-materials`

**Fields:** date, vendor, description, category, quantity, unit cost, total cost, invoice link, notes

**UI:** Materials tab + total material cost on job header

---

## 6. Changes

**Primary:** Firestore `change-requests`, `change-orders`

**Fields:** number, description, status, amount, dates, notes, document links

**UI:** Changes tab; approved totals feed revised contract / profit calculations

---

## 7. Documents

**Files:** Google Drive job folders (`projects.driveFolderId` / `driveFolderUrl`)

**Metadata:** Firestore `project-files` (and legacy `documents` where still referenced)

**Read/reporting:** SQL document views if wired

**Behavior:** Manual link entry only; no missing-document warnings in this phase.

---

## 8. Todos

**Primary:** Firestore `project-tasks` (manual `source: 'manual'`)

**Fields:** title, description, assignee, due date, status, notes

---

## 9. Activities

**Primary:** Firestore `activity-events`

**Fields:** projectId, timestamp, type, user, description, related record

**Behavior:** Logged on project edits, labor/material/change/doc/todo/sub actions.

---

## 10. Billing

**Primary (manual):** Firestore `projects` — `billedToDate`, `originalContractAmount`, `revisedContractAmount`, `retainagePercent`, `billingNotes`

**SQL (import/history):** `pay_apps`, `sov_lines`, API `/api/projects/:id/pay-apps`

**Behavior:** User can edit billed-to-date without pay app upload. QuickBooks is not required.

---

## 11. Admin / Source Health

**Storage:** Firestore `sync-runs`, `import-exceptions`; localStorage for some feature flags

**UI:** Settings / Admin only — Source Health, Review Center, Import Center, QuickBooks, Timekeeper. Hidden from Home, Projects, and job profile in manual-first mode.

---

## 12. Future Firestore → MySQL mirror

A background mirror job may copy Firestore job records into Cloud SQL for:

- Portfolio dashboards and exports
- Pay app / SOV alignment
- QuickBooks and Timekeeper imports
- Historical reporting

Mirroring must **not block** manual editing. Firestore remains authoritative for live UI; SQL is eventually consistent for reporting.

---

## Job profiles (exactly four)

1. `FullProjectSubcontractor` — Full Project - Subcontractor  
2. `FullContractGC` — Full Contract - GC  
3. `TM` — T&M  
4. `SmallJob` — Small Job  

Legacy profile values in Firestore are mapped at display time via `project-profile.compat.ts`.

---

## Job detail tabs

Overview · Labor · Materials · Changes · Documents · Todos · Activities · **Subs** (conditional)

Profit metrics: `src/app/features/projects/utils/project-profit.compute.ts`

Orchestration: `src/app/features/projects/services/job-record.service.ts`
