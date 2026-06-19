# Brighten Project Manager — Cursor Fix Plan

This file is a prioritized task list for fixing dead-end UI, disconnected features, and missing
functionality across the app. Work top to bottom. Run `npm test -- --no-watch` after each section
to confirm nothing broke. Run `npm run build` before committing.

---

## GROUND RULES

- All data writes go through `DataService` (injected via `inject(DataService)`)
- All pages use Angular signals: `signal()`, `computed()`, `toSignal()`
- Standalone components — always add new imports to the `imports: []` array
- Design system: `rounded-xl`, `shadow-sm`, `bg-white`, `border border-slate-200`, `text-sm`
- Status chips: use `<app-status-chip [tone]="..." [label]="..." />` not inline badge spans
- Page headers: use `<app-page-header title="..." subtitle="..." />`
- Stat cards: use `<app-stat-card [label]="..." [value]="..." />`
- Never use `alert()` for success — only for hard validation errors
- Subscribe pattern: `.subscribe({ next: () => ..., error: () => alert('Failed to save...') })`
- After any Firestore write, refresh the local signal/subject so the UI updates immediately

---

## SECTION 1 — Quick Wins (< 30 min total)

### 1.1 Fix hidden-module-banner hardcoded message
**File:** `src/app/components/layout/hidden-module-banner.ts`
**Problem:** Line 26 hardcodes `'rfis'` so every hidden module (Daily Logs, Field Issues, Safety,
Inspections, Foreman Bonuses) shows the wrong banner message.
**Fix:** Change:
```typescript
readonly message = globalModuleHiddenMessage('rfis');
```
to:
```typescript
message = computed(() => globalModuleHiddenMessage(this.moduleId));
```
Make sure `moduleId` is declared before `message` in the class. The `message` property must become
a computed signal since `@Input()` values aren't available at field-init time. Update the template
to call `message()` instead of `message`.

---

### 1.2 Wire Print button on Reports page
**File:** `src/app/features/financials/pages/reports.ts`
**Problem:** "Print Report" button has no `(click)` handler.
**Fix:** Add `(click)="printReport()"` to the button and add the method:
```typescript
printReport(): void {
  window.print();
}
```

### 1.3 Wire Export CSV on Reports page
**File:** `src/app/features/financials/pages/reports.ts`
**Problem:** "Export CSV" button has no `(click)` handler.
**Fix:** Import `downloadCsv` from `@shared/utils/csv` (or wherever it lives in this codebase —
check `wip-page.ts` for the exact import). Add `(click)="exportCsv()"` and implement:
```typescript
exportCsv(): void {
  // rows() is the computed WIP rows already on the page
  const headers = ['Project', 'Contract', 'Billed', 'Cost', 'Margin'];
  const data = this.rows().map(r => [r.projectName, r.contract, r.billed, r.cost, r.margin]);
  downloadCsv([headers, ...data], 'wip-report.csv');
}
```
Adjust field names to match what the WIP rows signal actually contains.

### 1.4 Remove Resend stub or implement it
**File:** `src/app/features/financials/pages/billing.ts`
**Problem:** `resendInvoice()` only shows an alert stub. It's misleading.
**Fix (option A — remove):** Delete the "Resend" button from the template entirely until the
feature is implemented via a Cloud Function / email service.
**Fix (option B — mark clearly):** Change the button label to "Resend (coming soon)" and disable
it: `[disabled]="true"` with `class="opacity-40 cursor-not-allowed"`.
Recommended: Option A — remove the button.

---

## SECTION 2 — Wire Dead Row Clicks (1–2 hours)

### 2.1 Billing "Next Actions" rows
**File:** `src/app/features/financials/pages/billing.ts`
**Problem:** `(rowClick)="null"` on billing action rows — they show action labels but go nowhere.
**What these rows represent:** Actions needed for specific projects (e.g., "Send Invoice for Job
1234"). Each `billingAction` should have a `projectId`.
**Fix:** Add a navigate method and wire it:
```typescript
openBillingAction(action: BillingAction): void {
  this.router.navigate(['/projects', action.projectId], {
    queryParams: { tab: 'billing' }
  });
}
```
Change `(rowClick)="null"` to `(rowClick)="openBillingAction(action)"`.
Inject `Router` from `@angular/router`.

### 2.2 Purchase Orders rows
**File:** `src/app/features/financials/pages/pos-page.ts`
**Problem:** All PO rows have `(rowClick)="null"`.
**Fix:** Navigate to the project that the PO belongs to:
```typescript
openPo(po: PurchaseOrder): void {
  this.router.navigate(['/projects', po.projectId], {
    queryParams: { tab: 'budget' }
  });
}
```
Change `(rowClick)="null"` to `(rowClick)="openPo(po)"`.
If POs have their own detail drawer in the future, open that instead — but for now navigate to
the project budget tab.

---

## SECTION 3 — Add Missing Create/Edit on Display-Only Pages (2–4 hours each)

### 3.1 Field Issues — Add "Log Issue" capability
**File:** `src/app/features/workflows/pages/field-issues-page.ts`
**Problem:** Page shows a filtered list of field issues but there is no way to create or edit one.
**DataService methods available:** `createFieldIssue(issue)`, `updateFieldIssue(id, updates)`
**Fix:** Add an inline "Log Issue" form (same pattern as `co-tab.ts` or `issues-tasks-tab.ts`):

1. Add a `showForm` boolean property and a `newIssue` object to the class
2. Add a "Log Issue" button to the page header actions slot
3. Add a form below the header (collapsible) with fields:
   - Project (select from active projects — inject DataService.getProjects())
   - Title (text input)
   - Type (select: Safety, Quality, RFI, Schedule, Other)
   - Priority (select: High, Normal, Low)
   - Description (textarea)
4. Save button calls:
```typescript
saveIssue(): void {
  this.data.createFieldIssue({
    ...this.newIssue,
    status: 'Open',
    createdAt: new Date().toISOString(),
  }).subscribe({
    next: () => { this.showForm = false; this.resetForm(); },
    error: () => alert('Failed to save field issue.')
  });
}
```
5. In the issues table, add an edit icon on each row that loads the issue into the form for editing
   and calls `updateFieldIssue(issue.id, updates)`.

### 3.2 Purchase Orders — Add "New PO" capability
**File:** `src/app/features/financials/pages/pos-page.ts`
**Problem:** No way to create a PO from this page.
**DataService methods available:** `createPO(po)`, `updatePO(id, updates)`
**Fix:** Same inline-form pattern:

1. Add "New PO" button in page header
2. Form fields: Project (select), Vendor, Description, Amount, Status, Date
3. Save calls `dataService.createPO({...form})`
4. Wire row clicks to open the form in edit mode (remove `(rowClick)="null"`)

---

## SECTION 4 — Enable Hidden Features (decide first)

These features are hidden by hardcoded `return false` in:
`src/app/shared/utils/global-enabled-modules.compute.ts`

### 4.1 Reports page (`/reports`)
The WIP report table already shows real data. The page just needs Print/Export fixed (Section 1).
**Decision needed:** Should this appear in the Financials nav?
**If yes:** Change `case 'reports': return false;` to `return true;`
**If no:** Leave hidden but fix the Print/Export buttons for when users land there from Billing.

### 4.2 Certified Payroll (`/certified-payroll`)
**Decision needed:** Is this feature built enough to show? If not, leave hidden.
If yes: change `case 'certified-payroll': return false;` to `return true;`

### 4.3 Data-driven hidden features (RFIs, Daily Logs, etc.)
These auto-show once data exists — no code change needed. They will appear in the nav
automatically once records are created through project detail tabs.

---

## SECTION 5 — Cross-Page Consistency Fixes

### 5.1 Confirm all tab navigation uses queryParams
Every project detail tab should set `?tab=<name>` in the URL so that links from other pages
(e.g., Dashboard "next action" links) land on the right tab.
**Check:** `src/app/features/projects/pages/project-details.ts` — confirm the tab router reads
`queryParams.tab` on init and activates the correct tab.

### 5.2 Confirm all "Next action" routes are correct
**File:** `src/app/features/projects/utils/` (wherever `nextActionRoute` is computed)
Audit that every `nextActionRoute` returned by project row computations actually resolves to a
real route with the right queryParams.

### 5.3 Empty states should never feel broken
Every table/list with `@empty` should say something helpful, not just "No records found."
Examples:
- Field Issues empty: "No open field issues. Log one using the button above."
- PO list empty: "No purchase orders yet. Add one using New PO."
- Tasks empty: "All clear — no open tasks for this project."

---

## SECTION 6 — After All Fixes

1. Run `npm test -- --no-watch` → all 251 tests must pass
2. Run `npm run build` → must succeed with no errors
3. Run `npm run build --prefix api` → API build must succeed
4. Commit with message: `Fix dead-end buttons, missing forms, and disconnected navigation`
5. Push to `main`

---

## DO NOT CHANGE

- `src/app/features/financials/utils/wip.compute.ts` line 262 — the `'Margin under 20%'` chip
  mapping must stay or the CI test `wip.compute.spec.ts:117` will fail
- `src/app/components/ui/status-chip.ts` — keep the `toneClass()` method with the bordered chip
  style; do not revert to `dotClass`/`textClass`
- `src/app/core/services/data.service.ts` — all write methods have try/catch with
  `handleFirestoreError`; do not remove these
- `scripts/backfill-owner-id.mjs` — do not delete this script
- `firestore.rules` — do not modify without testing; use `DRAFT_firestore.rules` as reference
