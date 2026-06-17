# Cloud SQL API Integration

Read-only first phase: the existing Angular app calls a Node/Express API; the API reads `brighten_pm` MySQL **views**. Do not put database credentials in the browser.

## Rules (do not skip)

- **Do not rebuild the front end** — keep pages, components, routes, styling, and workflows.
- **Add an API layer only** — Angular talks to HTTP; the API talks to Cloud SQL.
- **Inspect before coding** — find which service feeds the screen you are wiring (Projects list uses `DataService` + `ProjectApiService` on `/projects` only).
- **Test the API alone first** — `curl` / `Invoke-RestMethod` before starting Angular or editing page templates.
- **Cloud SQL is source of truth** for project records; Firestore is read fallback during migration only.
- **Failed SQL writes do not fall back to Firestore** — show an error and keep edits unsaved.
- **Use views first** — `v_project_dashboard`, `v_project_tasks`, etc.; avoid large ad-hoc joins in app code.
- **Do not invent missing data** — empty module tables and `needed` document rows are expected; show as missing/review.

**Do not commit** until real DB responses pass:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/projects
```

---

## Inspect first (before any Angular change)

| Screen | Route | Primary data today | API wiring status |
|--------|-------|-------------------|-------------------|
| Projects list | `/projects` | `DataService.getProjects()` (Firestore) | `ProjectApiService` when API healthy |
| Home, detail, tasks, docs, financials | other routes | `DataService` / feature services | **Not wired yet** |

Relevant files (Projects list only):

- `src/app/features/projects/pages/projects.ts` — chooses API vs Firestore list
- `src/app/core/services/api/project-api.service.ts` — `GET /api/projects`
- `src/app/core/services/api/project-api.mapper.ts` — view rows → `Project` model
- `src/app/core/services/data.service.ts` — Firestore fallback (unchanged)
- `api/src/routes/projects.routes.ts` — reads `brighten_pm.v_project_dashboard`

---

## Step 1 — API only (no Angular)

### 1. Create `api/.env.local` (local machine only)

Copy `api/.env.example` → `api/.env.local`. **Never commit** `api/.env.local` (covered by root `.gitignore` rule `.env*`).

Required variables:

| Variable | Example | Notes |
|----------|---------|--------|
| `DB_HOST` | `127.0.0.1` | Or Cloud SQL Auth Proxy host |
| `DB_PORT` | `3306` | MySQL |
| `DB_NAME` | `brighten_pm` | Use fully qualified names in SQL: `brighten_pm.projects` |
| `DB_USER` | *(your user)* | Server-side only |
| `DB_PASSWORD` | *(your password)* | Server-side only |
| `API_PORT` | `8080` | API listen port |
| `CORS_ORIGIN` | `http://localhost:3000` | Must match **actual** Angular dev URL |

Optional (Cloud Run / connector later):

- `INSTANCE_CONNECTION_NAME`
- `DB_SOCKET_PATH`

### 2. Install and run the API by itself

```powershell
cd api
npm install
npm run dev
```

Expected console: `Brighten PM API listening on http://localhost:8080`

### 3. Test with PowerShell (must pass before Angular)

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod http://localhost:8080/api/projects
```

**Health** — expect JSON like:

```json
{ "ok": true, "database": "brighten_pm", "timestamp": "..." }
```

**Projects** — expect `ok: true`, `count: 28` (or current loaded count), `items` array with `job_number`, `project_name`, etc.

If health fails: fix DB connectivity/proxy/credentials before touching Angular.

Browser alternative: open `http://localhost:8080/api/health` and `http://localhost:8080/api/projects`.

---

## Step 2 — Angular (only after Step 1 passes)

### 4. Confirm dev port and CORS

This repo serves Angular on **port 3000** (`npm run dev` → `http://localhost:3000`). Set `CORS_ORIGIN=http://localhost:3000` in `api/.env.local`. If you use a different port, update both `ng serve` and `CORS_ORIGIN`.

### 5. Start Angular

From repo root:

```powershell
npm run dev
```

Open `http://localhost:3000/projects`.

### 6. Browser API flags (no DB secrets in Angular)

```js
localStorage.setItem('brighten.apiBaseUrl', 'http://localhost:8080');
localStorage.setItem('brighten.useApiBackend', 'true');  // default when unset in code
```

| Behavior | When |
|----------|------|
| Loads from `/api/projects` | `brighten.useApiBackend` is true **and** API returns rows |
| Amber “Using Firestore fallback” | API enabled but request failed |
| Firestore only | `localStorage.setItem('brighten.useApiBackend', 'false')` |

Verify: Network tab shows `GET http://localhost:8080/api/projects` with 200 and ~28 items; no amber fallback banner.

---

## Production — Cloud Run

The Dockerfile bundles Angular static files and the Node API in one container. `cloudbuild.yaml` deploys to **`projectmanager06`** and attaches Cloud SQL instance **`project-manager-498120:us-central1:databaseprojectmgmt63`** via `DB_SOCKET_PATH`.

### 1. One-time Secret Manager setup

Create the DB password secret (run once; never commit the password):

```powershell
gcloud secrets create brighten-pm-db-password --replication-policy=automatic --project=project-manager-498120
# Paste password at prompt (do not echo in chat):
gcloud secrets versions add brighten-pm-db-password --data-file=- --project=project-manager-498120
```

Grant the **Cloud Build** and **Cloud Run** service accounts **Secret Manager Secret Accessor** on `brighten-pm-db-password`.

`cloudbuild.yaml` deploys with `--set-secrets=DB_PASSWORD=brighten-pm-db-password:latest` (override `_DB_PASSWORD_SECRET` in the trigger if you use a different secret id).

### 2. Cloud Run environment (applied on each deploy)

`cloudbuild.yaml` sets these on every deploy to **projectmanager06**:

| Variable | Source | Notes |
|----------|--------|--------|
| `DB_SOCKET_PATH` | `cloudbuild.yaml` | `/cloudsql/project-manager-498120:us-central1:databaseprojectmgmt63` |
| `DB_NAME` | substitution `_DB_NAME` | `brighten_pm` |
| `DB_USER` | substitution `_DB_USER` | e.g. `databaseprojectmgmt6` |
| `DB_PASSWORD` | Secret Manager | `_DB_PASSWORD_SECRET` → `brighten-pm-db-password` |
| `APP_STATIC_DIR` | `cloudbuild.yaml` | `/app/public` |
| `CORS_ORIGIN` | substitution `_CORS_ORIGIN` | Your live `https://….run.app` URL |
| `API_PORT` | Dockerfile | `8080` |

Override `_CORS_ORIGIN` (and `_DB_USER` if needed) in the Cloud Build trigger substitutions to match your service URL.

**IAM:** the Cloud Run service account needs **Cloud SQL Client** on the instance.

### 3. Firebase Auth (same deploy URL)

Firebase Console → Authentication → Settings → **Authorized domains** → add your `….run.app` host so Google sign-in works on production.

### 4. Verify after deploy

```powershell
Invoke-RestMethod https://<your-service-url>/api/health
Invoke-RestMethod https://<your-service-url>/api/projects
```

Open `https://<your-service-url>/projects` — list should load from SQL (no amber “Firestore fallback” banner). `api.config.ts` uses `window.location.origin` in production so `/api/...` hits the same Cloud Run host.

### 5. Known production gaps (acceptable for hybrid deploy)

- **API has no Firebase token check yet** — `/api/*` is public if the URL is known. Add auth middleware before treating SQL as fully private.
- **Most screens still use Firestore** — only projects list/detail shell, PATCH, financial summary, budget, and pay apps are SQL-backed today.
- **Region:** Cloud Run is `europe-west1`, Cloud SQL is `us-central1` — works; align regions later if latency matters.

---

## Commit gate

Commit **only after** live tests succeed:

```text
Add read-only Cloud SQL API and wire Projects list to /api/projects
```

Do **not** commit if `/api/health` or `/api/projects` were not verified against the real database.

---

## API endpoints (read-only)

| Method | Path | MySQL source |
|--------|------|--------------|
| GET | `/api/health` | connection ping |
| GET | `/api/projects` | `brighten_pm.v_project_dashboard` |
| GET | `/api/projects/:id` | `v_project_dashboard` + merged `projects` columns (address, dates, profile, retainage, award date, phase) + `project_scope` (1:1, nulls when absent) |
| PATCH | `/api/projects/:id` | `brighten_pm.projects` + `project_scope` upsert (whitelist only; one transaction; returns refreshed detail) |
| GET | `/api/projects/:id/readiness` | `v_project_readiness` |
| GET | `/api/projects/:id/tasks` | `v_project_tasks` |
| GET | `/api/projects/:id/documents` | `v_project_documents` |
| GET | `/api/projects/:id/financials` | `v_project_financial_detail` (Phase 2B read-only financial summary + Phase 2C read-only cost breakdown actuals; no writes/detail migration) |
| GET | `/api/projects/:id/budget` | `v_project_budget_summary` + `budget_lines` |
| GET | `/api/projects/:id/pay-apps` | `pay_apps` + `sov_lines` count (Phase 3B read-only billing headers) |
| GET | `/api/projects/:id/pay-apps/:payAppId` | `pay_apps` + `sov_lines` (Phase 3B read-only billing detail; `payAppId` is the list-provided UUID) |
| GET | `/api/action-center` | `v_action_center` |
| GET | `/api/backend-readiness` | `v_backend_readiness_summary` |
| GET | `/api/subcontractors` | `subcontractors` |
| GET | `/api/subcontractors/invoices` | `subcontractor_invoices` |
| GET | `/api/projects/:id/subcontractors` | `v_project_subcontractors` |

`:id` accepts project UUID or job number (`208`, `J208`).

---

## Angular services (no UI redesign)

- `src/app/config/api.config.ts` — base URL + `useApiBackend` flags (localStorage)
- `ApiClientService` — HTTP wrapper
- `ProjectApiService` — loads `/api/projects`, maps to `Project`
- `project-api.mapper.ts` — snake_case view columns → existing models

**Wired today:**

- Projects list (`/projects`) — `GET /api/projects`
- Project detail shell/header (`/projects/:id`) — `GET /api/projects/:id`
- Project edit modal — `PATCH /api/projects/:id` when `brighten.useApiBackend` is true; legacy Firestore save when false. Failed SQL writes show an error and never fall back to Firestore.
- Financials summary cards (Phase 2B/2C) — `GET /api/projects/:id/financials` when API is enabled; child tabs (Budget/Billing/WIP/AR/PO/import/source) remain on existing Firestore/import paths.
- Dashboard Daily Action Center — `GET /api/action-center` when API is enabled; falls back to computed Firestore priorities when API is off or empty.
- Dashboard/backend readiness preload — `GET /api/backend-readiness` (loaded for future settings/sync surfaces; Firestore sync health unchanged).
- Project Tasks tab + Issues/Tasks tab — `GET /api/projects/:id/tasks` read-only when API is enabled; Firestore remains write path until task write routes exist.
- Project Documents panel — `GET /api/projects/:id/documents` read-only when API is enabled; upload/archive remain Firestore/Drive.
- Active 2026 control page (`/active-2026`) — hybrid: `GET /api/projects` + `GET /api/action-center` overlay job shell, AR, billing, and next actions; margin/labor/subs still Firestore-computed.
- Subcontractors directory + invoices — `GET /api/subcontractors`, `GET /api/subcontractors/invoices` read-only when API enabled; writes remain Firestore.
- Project Subcontractors tab — `GET /api/projects/:id/subcontractors` read-only when API enabled.

**API auth (production):** `/api/*` (except `/api/health`) requires `Authorization: Bearer <Firebase ID token>`. Angular `ApiClientService` attaches the token from `AuthService.getIdToken()`. Set `API_AUTH_REQUIRED=false` locally in `api/.env.local`.

**Subcontractors backfill:** `node scripts/backfill-subcontractors-sql.mjs <owner-id> --dry-run` after running `db/manual/2026-06-08_subcontractors_schema.sql` and `legacy_align.sql`. Held-out billing jobs: `db/manual/2026-06-08_held_out_billing_jobs_decisions.md`.

**PATCH whitelist (Phase 1A):** `projectName`, `status`, `address`, `city`, `state`, `zip`, `county`, `customer` (exact company match), `superintendent` (exact user match), `originalContractAmount`, `billingStatus`, `startDate`, `targetEndDate`, `prevailingWage`/`certifiedPayrollRequired` (both columns set together), `taxExempt`, `bondRequired`, `driveFolderId`, optional `projectNumber`.

**PATCH whitelist (Phase 1B — Overview completion):**
`projects` columns — `projectProfile`, `retainagePercent` (0–100), `awardDate` (ISO date or null), `currentPhase`.
`project_scope` (1:1, upserted in the same transaction) — `scopeSummary`, `includedWork`, `exclusions`, `scheduleAccessNotes`, `closeoutRequirements`.
Migration record: `db/manual/2026-06-04_phase_1b_overview_completion.sql` (additive nullable columns + `project_scope` table, FK to `projects.id ON DELETE CASCADE`, rollback in comments).

**Financials Phase 2B scope:** read-only summary fields only: contract, revised contract, billed/remaining, AR if available from dashboard, actual/estimated cost, cost buckets, profit/margin, snapshot date, and warnings from SQL confidence/missing-step/null estimated cost. Missing values stay null/Pending; no fake financial values.

**Financials Phase 2C scope:** read-only Cost Breakdown Summary on the existing financial summary response. Uses SQL actual cost buckets from `v_project_financial_detail` (`labor_actual`, `materials_actual`, `subcontractors_actual`, `other_precon_actual`) and keeps `budget`/`remaining` as `null` until reliable SQL budgets are available. The Budget tab, budget line editing, `/api/projects/:id/budget`, pay apps, POs, WIP, AR detail, forecasting, and financial writes remain unchanged/deferred.

**Manual pay app backfill record:** initial pay app headers/SOV lines were manually staged and backfilled for J158, J186, J209, J215, J218, J219, J221, J222, and J223. Record file: `db/manual/2026-06-04_manual_pay_app_backfill_record.sql`. This is documentation only; no app code applies schema changes, routes, UI, or financial writes from this batch.

**Manual Pay App / Billing Backfill Batch 02:** on 2026-06-05, pay app headers/SOV lines were manually staged and imported for J197, J204, J206, J210, and J216 into `pay_apps` and `sov_lines` using `staging_pay_app_headers` and `staging_sov_lines`. Record file: `db/manual/2026-06-05_manual_pay_app_backfill_batch_02.sql`. Held out: J193 (final/current due confirmation), J208 (existing partial header-only row needs source/SOV review), J212 (contract mismatch confirmation), and J189 (blank/zero template, do not import without user confirmation). Next cleanup items: review held-out jobs, preserve protected project contract values, keep J206 medium-confidence/scanned-source review notes, and continue treating Pay Apps/Billing as read-only in the app.

**Held-Out Billing Review:** J193 has no production pay app rows yet, but source `J193 - PA006 APRIL 2026 (1).xlsx` has pay app 06 with 14 SOV lines, $77,491.00 scheduled/completed, $1,157.00 current due, $57.85 retainage, `NeedsReview`, and invoice-packet paid-in-full context; hold until the user confirms importing as final/current paid billing. J208 has existing production header `PA002` with $5,586.47 current due, $17,355.50 completed/stored, $867.78 retainage, $343,732.28 balance, and 0 SOV lines; do not create a duplicate header and hold until the source document / 27-line SOV is confirmed. J212 has no production pay app rows yet, but source `J212 - LPS Lewis Clark Restroom - 001 April.xlsx` has pay app `J212-001` with 7 SOV lines, $79,250.00 pay app contract, protected/project contract reference $91,775.00, $2,375.00 current due, and $125.00 retainage; hold until contract mismatch handling is confirmed, and do not import May `J212-PA002-May` as fake AIA/SOV without source support. J189 has no production pay app rows and no usable billing source rows; uploaded workbook appears blank/zero, so skip until the user confirms a real pay app/invoice exists.

**Billing Phase 3B scope:** read-only Pay Apps/Billing API routes expose imported `pay_apps` and `sov_lines` rows for J158, J186, J209, J215, J218, J219, J221, J222, and J223. No UI is wired yet. No write routes, staging-table reads, schema changes, or additional imports are included.

**Billing Phase 3C scope:** project Financials → Billing shows a read-only SQL Pay Apps/Billing section using `GET /api/projects/:id/pay-apps` and `GET /api/projects/:id/pay-apps/:payAppId`. Existing billing write flows remain disabled in this project detail billing view; no create/edit/delete UI, write routes, schema changes, staging-table reads, or imports are included.

**Still deferred:** project manager assignment (`project_users`), client/billing contacts (no schema), wage orders, certified payroll workflow, Financials child tab migration, financial writes.

**Not wired yet:** Active 2026 control row compute (still Firestore-derived), project detail workflow tabs beyond tasks/documents, other entity write routes, Firebase removal.

---

## Tables and views

Prefer views: `v_project_dashboard`, `v_project_tasks`, `v_project_documents`, `v_project_financial_detail`, `v_project_budget_summary`, `v_action_center`, `v_backend_readiness_summary`.

Core tables with data today: `projects`, `companies`, `users`, `project_folders`, `documents`, `tasks`, financial snapshots, `ar_snapshots`, `pay_apps`, `sov_lines`, `change_orders`, `budget_lines`, `wage_orders`.

Empty tables are **backend-ready** (RFIs, subs, POs, CPR weeks, etc.) — not broken.

---

## Next steps (one screen at a time)

1. Stabilize `/projects`, project detail shell, dashboard action center, tasks, and documents against live API (this gate).
2. Active 2026 control rows from SQL dashboard + readiness views.
3. Project detail workflow tab reads (RFIs, submittals, etc.) — one endpoint at a time.
4. Write endpoints only after reads are verified in production.
