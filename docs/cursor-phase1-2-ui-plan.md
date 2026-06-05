# Brighten Project Manager — Phase 1 & 2 UI/UX Improvement Plan
_For use in Cursor. Work phase by phase. Do not start the next phase until build and tests pass._

---

## Context & What's Already Done

The following was completed in a prior Cursor session — do NOT redo this work:

- Settings redesigned into 5 sections (Source Health, Setup Defaults, Review Center, Import Center, Advanced)
- Completion rules simplified (PM, wage order, start date, target end are no longer blockers)
- Open AR removed from all attention/alert surfaces
- Project files archive/audit flow added (ProjectFilesRepository, ActivityEventsService)
- Full DDD restructure (`features/`, `core/`, `shared/`, path aliases in tsconfig)
- Feature route files split per domain; seed assets evicted from app bundle
- Cloud SQL MySQL API layer started under `/api` (health, projects, action-center endpoints)

The remaining work is **UI/UX simplification only**. Do not restructure the codebase. Do not add new features. Do not change the API layer.

---

## Phase 1 — Fix What's Broken & Confusing

### Goal
Make what already exists actually usable. These are small, targeted changes. Each one is independent.

---

### 1.1 — Gate incomplete features in the nav

**Files to change:**
- `src/app/config/global-nav.config.ts`
- `src/app/config/feature-setup.config.ts`
- `src/app/features/projects/utils/project-needs.compute.ts` (line 41 — `showCpr` is hardcoded `false`)

**What to do:**

In `global-nav.config.ts`, find the nav items for **Certified Payroll** (`/certified-payroll`) and **Work Comp Audit** (if present as a nav item). Mark them visually as "Coming Soon" OR remove them from the rendered nav entirely until the feature is built.

Preferred approach: Keep the route so existing bookmarks don't 404, but **remove from sidebar nav** and **remove from the project tab list**. Do NOT delete the files.

In `project-needs.compute.ts`, `showCpr()` already returns `false` at line 41. Leave that as-is — that's correct. But confirm `certified-payroll` is also excluded from the `WorkflowView` tab list when `showAllTools` is false. It should not appear as a tab unless `certifiedPayrollRequired` is true on the project AND there are CPR records.

**Acceptance criteria:**
- Sidebar has no "Certified Payroll" item unless the project actually requires it
- Work Comp Audit does not appear as a nav item in daily use
- No 404s introduced

---

### 1.2 — Add a Retry button to the Firestore fallback banner

**Files to change:**
- `src/app/features/projects/pages/project-details.ts` (line ~74-78)
- `src/app/features/projects/pages/projects.ts` (line ~193-196)
- `src/app/core/services/api/project-api.service.ts` (line ~103-137)

**What to do:**

Currently the fallback banner is:
```html
@if (projectApi.detailError()) {
  <p class="text-sm text-amber-700">Using Firestore fallback — {{ projectApi.detailError() }}</p>
}
```

Replace it with a styled banner that has a **Retry** button:
```html
@if (projectApi.detailError()) {
  <div class="flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
    <span class="material-icons text-amber-500 text-base">warning</span>
    <span>Live data unavailable — showing cached data.</span>
    <button (click)="retryApiLoad()" class="ml-auto text-xs font-semibold underline hover:text-amber-900">Retry</button>
  </div>
}
```

Add a `retryApiLoad()` method to the component that calls the appropriate `projectApi.loadProjectDetail()` or `projectApi.loadProjects()` method again.

**Acceptance criteria:**
- Banner shows on API failure (same as before)
- Retry button calls the API reload method
- Banner disappears on successful retry

---

### 1.3 — Default "Show all tools" to true

**File to change:**
- `src/app/features/projects/pages/project-details.ts` (line 473)

**What to do:**

Change:
```typescript
showAllTools = signal(false);
```
To:
```typescript
showAllTools = signal(true);
```

Also update the localStorage read logic (line ~557) so that if no stored preference exists, the default is `true` rather than `false`. The stored preference should still be respected when set.

**Acceptance criteria:**
- New project visits show all tools by default
- User can still toggle it off and preference is remembered per project

---

### 1.4 — Fix non-null assertions in the most-used components

**Files to check (in priority order):**
- `src/app/core/services/global-needs.service.ts`
- `src/app/core/services/quickbooks-sync-sheets.service.ts`
- `src/app/features/projects/pages/project-details.ts`

**What to do:**

For every `someSignal()!` or `someValue!` used in a template or computed, replace with a safe alternative:
- Use `someSignal() ?? fallback` or `someSignal()?.property`
- In templates, wrap with `@if (someSignal())` before accessing `.property`
- Do NOT add `!` assertions to suppress TypeScript — fix the actual null handling

Prioritize any `!` that appears in a template binding or a `computed()` that feeds a template. Service internals that are guaranteed non-null by construction can stay.

**Acceptance criteria:**
- No runtime crash when signals are momentarily null during load
- TypeScript strict mode continues to pass

---

### 1.5 — Standardize loading, empty, and error states

**Files to check:**
- `src/app/features/projects/pages/projects.ts` — missing loading spinner
- `src/app/features/financials/pages/financials-hub-page.ts` — no loading or error states
- `src/app/features/workflows/pages/*.ts` — no loading or error states

**What to do:**

The app already has `<app-empty-state>` (`src/app/components/ui/empty-state.ts`). Use it consistently.

For each of the above pages, add:
1. **Loading state** — while data is being fetched, show a simple loading indicator. A spinner or "Loading..." text is fine. Use a `loading` signal or the existing data service `loading` signal if one exists.
2. **Error state** — if the data service reports an error and data is empty, show an error message (not just the Firestore fallback banner). Use `<app-empty-state>` with an error icon and message.
3. **Empty state** — already present in most places; verify it still works after loading completes.

Do not add a loading state to places that are already fast (e.g., purely computed/derived data).

**Acceptance criteria:**
- Projects list shows a loading indicator before data arrives
- Financials hub shows a loading indicator and an error state
- No page shows a blank white screen on slow load

---

## Phase 2 — Project Detail Navigation Overhaul

### Goal
The project detail page has 4 top-level sections (Overview, Work, Money, Files), each with 8–14 sub-tabs exposed as a flat tab row. This is overwhelming. Reorganize so primary navigation is clear and sub-tabs are grouped or filtered contextually.

---

### 2.1 — Slim down the Work tab list

**Files to change:**
- `src/app/features/projects/utils/project-needs.compute.ts`
- `src/app/components/project/project-workflows-panel.ts`

**Current Work tabs** (from `WorkflowView` in `project-detail.types.ts`):
`all-work`, `dashboard`, `tasks`, `changes`, `field`, `rfis`, `submittals`, `daily-logs`, `field-issues`, `certified-payroll`, `safety`, `inspections`

**What to do:**

Split into **primary** (always visible) and **more** (behind a "More" button or shown only with `showAllTools`):

| Primary (always shown) | Secondary (Show all tools or "More") |
|------------------------|--------------------------------------|
| All Work | Safety |
| Tasks | Inspections |
| Changes | Certified Payroll (only if required) |
| Field | |
| RFIs | |
| Submittals | |
| Daily Logs | |
| Field Issues | |

In `project-needs.compute.ts`, update `enabledModules()` to split tabs into `primaryWorkTabs` and `secondaryWorkTabs`. In the template (`project-workflows-panel.ts`), render primary tabs always and secondary tabs only when `showAllTools` is true.

**Acceptance criteria:**
- Work section shows 8 primary tabs without clutter
- Safety, Inspections, CPR only appear when `showAllTools` is on or required by project
- No tabs disappear that were previously working

---

### 2.2 — Slim down the Money tab list

**Files to change:**
- `src/app/features/projects/utils/project-needs.compute.ts`
- `src/app/components/project/project-financials-panel.ts`

**Current Money tabs** (from `FinancialView`):
`summary`, `budget`, `pos`, `billing`, `wip`, `ar`, `labor-bonus`, `sub-invoices`, `cost-transactions`, `import-source`

**What to do:**

Split similarly:

| Primary (always shown) | Secondary (Show all tools only) |
|------------------------|---------------------------------|
| Summary | Sub Invoices |
| Budget | Cost Transactions |
| POs | Import / Source Detail |
| Billing | |
| WIP | |
| AR | |
| Foreman Bonus | |

Move `sub-invoices`, `cost-transactions`, and `import-source` to secondary (visible only with `showAllTools`).

**Acceptance criteria:**
- Money section shows 7 primary tabs
- 3 advanced tabs visible only with Show all tools
- No data or routing broken

---

### 2.3 — Slim down the Files tab list

**Files to change:**
- `src/app/components/project/project-documents-panel.ts`
- `src/app/features/projects/utils/project-needs.compute.ts`

**Current File tabs:** `all`, `required`, `generated`, `uploads`, `contracts`, `change-orders`, `billing`, `cpr`, `subs`, `insurance`, `lien-waivers`, `submittals`, `closeout`, `drive-mapping`

**What to do:**

Keep **All Files**, **Required**, **Uploads**, and **Generated** as the always-visible tabs. Move the rest behind `showAllTools`:

| Primary (always shown) | Secondary (Show all tools) |
|------------------------|----------------------------|
| All Files | Contracts |
| Required | Change Orders |
| Uploads | Billing |
| Generated | CPR (if required) |
| | Subs |
| | Insurance |
| | Lien Waivers |
| | Submittals |
| | Closeout |
| | Drive Mapping |

**Acceptance criteria:**
- Files section shows 4 primary tabs
- Document categories still work; no file data hidden

---

### 2.4 — Add progressive disclosure to the project Overview panel

**File to change:**
- `src/app/components/project/project-overview-panel.ts`

**What to do:**

The overview panel likely shows all project fields at once. Add a **"Show more details"** expand/collapse toggle so that:
- **Default view:** Job number, name, customer, address, status, contract amount, foreman, drive folder link, billing status
- **Expanded view:** All remaining fields (county, profile, prevailing wage, CPR required, dates, etc.)

Use a simple `showMore = signal(false)` and toggle button.

**Acceptance criteria:**
- Overview loads in a compact state
- All fields still accessible with one click
- No fields removed

---

### 2.5 — Make tab rows horizontally scrollable on small screens

**Files to change:**
- `src/app/components/project/project-workflows-panel.ts` (tab row)
- `src/app/components/project/project-financials-panel.ts` (tab row)
- `src/app/components/project/project-documents-panel.ts` (tab row)

**What to do:**

Find every tab row `<div class="flex ...">` or `<nav class="flex ...">` that renders the sub-tab buttons. Add `overflow-x-auto` and `whitespace-nowrap` to the container so tabs scroll horizontally instead of wrapping or overflowing on small screens. Also add `-webkit-overflow-scrolling: touch` for mobile smoothness.

Example:
```html
<div class="flex overflow-x-auto whitespace-nowrap gap-1 border-b border-slate-200 pb-0 scrollbar-hide">
```

**Acceptance criteria:**
- Tab rows do not overflow or break layout on < 768px viewport
- Tabs are accessible by horizontal scroll on mobile

---

### 2.6 — Add basic pagination to the projects list

**File to change:**
- `src/app/features/projects/pages/projects.ts`

**What to do:**

The projects list renders all projects in one `@for` loop. Add simple client-side pagination:
- Default page size: 25
- Show "Previous" / "Next" buttons and "Showing X–Y of Z projects"
- If total projects ≤ 25, do not show pagination controls

Add a `pageIndex = signal(0)` and `pageSize = 25` to the component. Slice the `filteredProjects()` computed:
```typescript
paginatedProjects = computed(() => {
  const start = this.pageIndex() * this.pageSize;
  return this.filteredProjects().slice(start, start + this.pageSize);
});
```

Add simple pagination controls below the table.

**Acceptance criteria:**
- Projects list paginates at 25 items
- Pagination resets to page 1 when filter/search changes
- Under 25 projects: no pagination UI shown (currently 28 projects, so controls will appear)

---

## After Each Phase

Run:
```bash
npm test -- --no-watch
npm run build
```

Fix any TypeScript, lint, or template errors before committing. Do not leave broken imports or failing tests.

Commit message format:
- Phase 1: `UI: Phase 1 — fix incomplete features, banners, loading states`
- Phase 2: `UI: Phase 2 — project detail nav simplification and mobile fixes`

---

## What NOT to Do

- Do not restructure the `features/` folder layout — it was just reorganized
- Do not touch the `/api` backend or Cloud SQL integration
- Do not add Firebase Storage
- Do not add new top-level nav items
- Do not remove any working features — only hide or gate incomplete ones
- Do not change Settings — it was already redesigned in a prior session
- Do not rewrite DataService or any repository services

---

## Key File Reference

| What | File |
|------|------|
| Project detail component | `src/app/features/projects/pages/project-details.ts` |
| Primary nav (4 sections) | `src/app/components/project/project-primary-nav.ts` |
| Tab type definitions | `src/app/components/project/project-detail.types.ts` |
| Tab visibility logic | `src/app/features/projects/utils/project-needs.compute.ts` |
| Workflows panel | `src/app/components/project/project-workflows-panel.ts` |
| Financials panel | `src/app/components/project/project-financials-panel.ts` |
| Documents panel | `src/app/components/project/project-documents-panel.ts` |
| Overview panel | `src/app/components/project/project-overview-panel.ts` |
| Nav config | `src/app/config/global-nav.config.ts` |
| Feature flags | `src/app/config/feature-setup.config.ts` |
| Projects list page | `src/app/features/projects/pages/projects.ts` |
| Financials hub page | `src/app/features/financials/pages/financials-hub-page.ts` |
| API service (fallback banner) | `src/app/core/services/api/project-api.service.ts` |
| Empty state component | `src/app/components/ui/empty-state.ts` |
