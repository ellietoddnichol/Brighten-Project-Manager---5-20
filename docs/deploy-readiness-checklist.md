# Deploy Readiness Checklist — Brighten Project Manager

Release-candidate freeze. Goal: Ellie can deploy, sign in, open the 25 active jobs, and trust the core pages.

**Mode:** Fix-only. No new features, tabs, modules, source systems, or automation.

Last verified: 2026-05-28 · `npm test` 205 passing · `npm run build` passing.

---

## Release decision

| | |
|---|---|
| **Ready to deploy (core flow)** | **Yes — with manual auth verification in production** |
| **Build gate** | Pass (`npm run build` exits 0) |
| **Test gate** | Pass (205 tests, 35 files) |
| **Firestore rules** | Complete for all core collections; deploy command documented below |
| **Secrets** | `gen-lang-client-*.json` and `.env.local` are gitignored (not committed) |

The app is clean enough for first use. The only item that cannot be verified from code is a live Google sign-in in the deployed environment (popup/redirect + authorized domains) — see Blocking-on-verify below.

---

## 1. Build & test gate

```bash
npm test -- --no-watch     # 205 passing
npm run build              # exits 0
```

Acceptable, documented build warnings (non-blocking):
- Initial bundle exceeds 900 kB budget (~1.24 MB). Cosmetic budget warning; lazy chunks split per route.
- `localforage` is CommonJS (optimization bailout warning only).
- Two Angular template diagnostics (`ar-tab.ts` optional chain, `tasks-tab.ts` nullish) — warnings only, not errors.

---

## 2. Firebase readiness

- `firebase.json` deploys `firestore.rules`.
- `.firebaserc` default project: `brighten-project-manager`.
- Rules model: every core collection requires `request.auth != null` and `ownerId == request.auth.uid` for read/write. IDs validated by `isValidId`.

**Deploy rules before production:**

```bash
firebase deploy --only firestore:rules
```

### Core collections covered by rules
projects · pos · change-orders · change-requests · rfis · submittals · daily-logs · field-issues · pay-app-lines · ar-records · budget-lines · tasks · documents (legacy) · project-folders · **project-files** (primary file metadata) · required-documents · project-issues · project-tasks · milestones · billings · employees · time-entries · project-labor-actuals · subcontractors · project-subcontractors · subcontractor-documents · subcontractor-invoices · labor-code-mappings · foreman-bonus-* · certified-payroll-* · **activity-events** · **import-exceptions** · **sync-runs**.

### Document handling (2026 reliability pass)
- **Drive** = actual file bytes.
- **`project-files`** = metadata, links, workflow IDs. Archive in UI — no normal hard delete.
- **`documents`** = legacy status only; do not add new uploads there.
- **`activity-events`** = append-only audit (create/update/archive file).

### Import/sync storage (migrating)
- `import-exceptions` and `sync-runs` in Firestore with **localStorage fallback** (`brighten.importExceptions`, `brighten.importRuns`).
- `brighten.qbProjectMgmtSync` remains local cache for QB workbook payload until migrated.

**Deploy rules after changes:** `firebase deploy --only firestore:rules`

### Indexes
No composite-index file is required for current single-field `ownerId` queries. If the Firestore console prompts for an index after deploy (a `where ownerId == uid` + `orderBy` combination), create it from the console link. Not expected for the core flow.

---

## 3. Environment variables

Documented in `.env.example` (committed, no secrets):

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Optional | AI features only; app runs without it |
| `APP_URL` | Optional | Hosting URL |
| `GOOGLE_SHEETS_MASTER_SPREADSHEET_ID` | Yes (sources) | Master data sheet |
| `QUICKBOOKS_PROJECT_MGMT_SYNC_SPREADSHEET_ID` | Yes (sources) | QB sync workbook |
| `GOOGLE_SHEETS_OPTIONAL_FINANCIAL_WORKBOOK_ID` | Optional | Live WIP/billing sheet |
| `GOOGLE_SHEETS_CERTIFIED_PAYROLL_SHEET_ID` | Optional | CPR drafts (parked feature) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Optional | Drive folder discovery |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Optional | Server-side Google access |

- Firebase web config lives in `src/app/firebase.ts` / `src/environments`.
- Secrets are **not** committed: `gen-lang-client-*.json` and `.env.local` are gitignored.
- App degrades gracefully when optional sources are missing (warnings, not crashes).

---

## 4. Sign-in smoke test (verify in deployed env)

- Local: `npm start` → open app → Sign in with Google.
- Production: confirm the deploy domain is in Firebase Auth **Authorized domains**, and the OAuth client allows the production origin.
- Expected: no popup loop, no blank screen, lands on Home with access to Home/Projects/Financials/Documents/Directory/Settings.

> Known: the automated browser in earlier sessions hit `auth/popup-blocked`. This is a browser-automation limitation, not an app bug. **Verify manually once in production.**

---

## 5. Core route smoke test

Confirm each loads without a page-breaking console error, no raw UUIDs, no seed language, no unfinished primary buttons, no empty card walls:

- [ ] `/`
- [ ] `/projects`
- [ ] `/financials`
- [ ] `/wip`
- [ ] `/ar`
- [ ] `/billing`
- [ ] `/documents`
- [ ] `/directory`
- [ ] `/subcontractors`
- [ ] `/settings`
- [ ] one active project detail page
- [ ] one closed/archive project detail page

---

## 6. Sidebar & navigation — PASS

Sidebar (`global-nav.config.ts`) shows only: Home · Projects · Tasks · Financials · Documents · Directory, with Settings pinned at the bottom. No "Show all tools", no pinned-tools section, no CPR/Work Comp/RFIs/Submittals/Daily Logs as primary nav. Badges are limited to AR (urgent), tasks/changes, missing-required-docs, and subcontractors.

---

## 7. Home page — PASS

`buildHomePriorities` only surfaces: missing contract, open/past-due AR, approved CO not billed, missing Drive link, budget-estimate confirmation, QB sync warning, unmatched sources. No CPR/submittal/RFI/safety noise. Links to Projects, Financials, AR, Billing, and Source Review work.

---

## 8. Projects page — PASS (verify in smoke test)

Default view is Active; closed/complete/archive excluded from Active; closed jobs with AR route to Closeout; Archive/All views, search, quick view, and export exist.

---

## 9. Project detail — PASS

Sections: Overview / Work / Money / Files. Work hides unused workflows via enabled-modules. Money shows the unified financial summary. Files filters All/Required/Generated/Uploads.
**New this pass:** "Missing critical info" items on Overview are now clickable and route to the exact tab to resolve each one.

---

## 10–12. Financial trust — PASS (unified compute)

- **WIP** (`wip.compute.ts` + `wip-hub.compute.ts`): Active WIP excludes closed/archive; Closeout AR holds closed jobs with AR; estimated 80% budgets labeled; AR is **not** earned revenue. `/wip`, Financials → WIP, and Project → Money → WIP share one compute.
- **AR** (`ar.compute.ts` + `ar-compute.service.ts`): totals derive from the same rows shown; if Open AR > 0 rows are visible; aging buckets and Closeout AR correct; missing AR Aging Summary shows a clear warning; AR separate from WIP. `/ar`, Financials → AR, Project → Money → AR share one compute.
- **Billing**: billed-to-date / left-to-bill shown; approved-CO-not-billed surfaced; complete/100%-billed jobs with no AR stay quiet. Invoice packet import writes all invoices to billing, only open to AR.

---

## 13. Documents — PASS (verify in smoke test)

All Files / Required / Generated / Uploads + Drive Links. Closed/archive jobs do not raise urgent Drive warnings. Actual files stay in Drive; metadata in Firestore.

---

## 14. Directory / Subcontractors — verify manual entry

`/directory` and `/subcontractors` load. Discovery language references QuickBooks/Drive. **Verify in smoke test:** manual add of a subcontractor/vendor and editing W-9/COI/classification/contact. See Limitations if any field is read-only.

---

## 15. Settings — PASS

Segments: Overview (admin actions), Sync Health, Setup Completeness, Source Review, Labor Codes, Drive Links, QuickBooks, Features, Advanced. Dev/demo tools ("Load demo data") are clearly **(dev only)** inside Advanced. Budget Workbook Import shows **"Next phase — on hold / coming soon"** and is disabled.

---

## 16. Hidden / parked for first deploy

Hidden from primary UI unless records exist or "Show all tools" is on:
- Budget Workbook Import (disabled, "coming soon")
- Certified Payroll (only when `certifiedPayrollRequired` / CPR records)
- Work Comp Audit
- RFIs / Submittals / Daily Logs / Field Issues (only when records exist)
- Safety / Inspections
- Advanced source automation, legacy QBO exports, demo/dev tools (Advanced only)
- Complex chart dashboards

---

## 17. Source wording — PASS (user-facing)

No production user-facing "seed" language: Setup page reads "Setup Completeness / Setup Status / Missing Fields". Internal service/field names (`SeedService`, `seedGaps`) are code-only and not rendered. Demo seed action is labeled "(dev only)" in Advanced.

---

## 18. Manual data-entry readiness

| Record | Manual create/edit | Notes |
|---|---|---|
| Project setup fields | Yes | Project edit modal |
| Customer/project info | Yes | Project edit |
| Subcontractor/vendor | Verify | Directory/Subcontractors UI |
| Drive folder links | Yes | Settings → Drive Links / project utility |
| Labor code classifications | Yes | Settings → Labor Codes |
| Billing/invoice records | Partial | Pay-app flow + QB invoice packet import; manual single-invoice entry limited |
| AR records | Partial | Derived from billing/QB; collection status/notes editable in AR tab |

**Limitations to accept for first deploy:** billing and AR are primarily source/derived; rich standalone manual AR entry is not a full workflow. Not a blocker — data flows from invoices/QB.

---

## 19. Source access readiness

| Source | Required | Behavior if missing |
|---|---|---|
| Master Time Sheet | Optional for first run | Warning in Source Review, no crash |
| QuickBooks Project Mgmt Sync workbook | Recommended | AR/cost limited; clear warnings |
| Google Drive job folders | Optional | "Not linked" status, no crash |
| PO sheet | Optional | Advanced sync only |
| Budget workbooks | Parked | "Coming soon" — does not block deploy |

---

## 20. Deploy commands & production smoke test

```bash
# 1. Gates
npm test -- --no-watch
npm run build

# 2. Firestore rules
firebase deploy --only firestore:rules

# 3. Hosting / app deploy (per your hosting setup)
#    e.g. firebase deploy  (if hosting is configured)
```

### Production smoke test steps
1. Open the deployed URL; Sign in with Google (confirm authorized domain).
2. Land on Home — confirm priorities and 4 summary cards render.
3. Open `/projects` — Active view shows the active jobs, no closed jobs in Active.
4. Open one active project → Overview/Work/Money/Files.
5. Open `/wip`, `/ar`, `/billing` — totals match rows; no misleading numbers.
6. Open `/documents` and `/directory`/`/subcontractors`.
7. Open `/settings` → Source Review; run "Re-sync QuickBooks workbook" if the workbook is connected.
8. Confirm no raw UUIDs, no "seed" language, no fake CPR/Work Comp warnings.

---

## Blocking issues
- **None in code.** One verify-only item: live Google sign-in on the production domain (authorized domains + OAuth origin).

## Non-blocking (accepted) issues
- Initial bundle over budget (cosmetic).
- `localforage` CommonJS bailout warning.
- Two Angular template lint warnings (`ar-tab.ts`, `tasks-tab.ts`).
- Source Review exceptions / sync runs are localStorage (Phase Zero), not Firestore yet.

## Hidden for later
- Budget Workbook Import, Certified Payroll, Work Comp Audit, RFIs/Submittals/Daily Logs/Field Issues (unless records), Safety, Inspections, advanced source automation, complex dashboards.

## Manual setup required after deploy
- Add production domain to Firebase Auth authorized domains.
- Deploy Firestore rules.
- **Cloud SQL on Cloud Run:** one-time Secret Manager setup (`brighten-pm-db-password`), then `cloudbuild.yaml` applies `DB_*` and `CORS_ORIGIN` on deploy — see [sql-api-integration.md § Production — Cloud Run](sql-api-integration.md#production--cloud-run).
- Verify `https://<service>/api/health` and `/api/projects` after deploy.
- Connect Master Time Sheet + QuickBooks workbook (optional but recommended).
- Link Drive folders for active jobs.
- Enter/confirm contract + budget on any job flagged "Missing contract / Confirm budget" on Home.
