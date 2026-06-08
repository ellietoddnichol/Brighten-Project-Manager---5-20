# Brighten Project Manager — Per-Page Cursor Prompts

_Run these in Cursor one at a time, in order. Run `npm run build` after each prompt to catch
type errors before moving on. All UI rules are defined in `docs/ui-design-system.md`._

---

## Prompt 1 — Dashboard & Active 2026 Control

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Dashboard page and the Active 2026 control panel (src/app/features/dashboard/):

UI CONSISTENCY FIXES
- Page container must be `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- Replace any `bg-blue-600`, `bg-emerald-600`, or colored primary buttons with `bg-slate-900 text-white`
- Every interactive row and button must have `hover:` state and `transition-colors`
- Status chips must use `<app-status-chip tone="..." label="...">` — remove any hardcoded
  `bg-amber-100 text-amber-800` or similar inline chip colors
- Stat cards must use the `<app-stat-card>` component — remove any inline stat boxes
- Stat grid: `grid grid-cols-2 lg:grid-cols-4 gap-4`
- Verify the page starts with `<app-page-header>`

FUNCTIONAL / UX IMPROVEMENTS
1. Loading state: if the dashboard has no loading skeleton or spinner while data loads, add one —
   a `<div class="animate-pulse space-y-4">` skeleton grid matching the stat card layout is fine.
2. Empty state: if there are no active projects, show `<app-empty-state icon="work_off"
   title="No active projects" message="All projects are closed or archived." />` instead of
   an empty grid.
3. Error state: if a Firestore or API call fails, show the standard warning banner from the
   design system (`bg-amber-50 border border-amber-200 text-amber-800`) with a "Retry" button
   that re-calls the data method.
4. Active 2026 control — "Show all tools" toggle: default value must be `true` (not `false`).
   Check the component's initial signal/state and flip the default if needed.
5. Quick-nav tiles: if the dashboard has shortcut tiles (e.g. "Go to Projects", "Go to Financials"),
   make sure they use the Accent button style (`text-indigo-700 bg-indigo-50 hover:bg-indigo-100`)
   not a colored variant.
6. If there is a "today's tasks" or "pending items" section, add a count badge next to the section
   title showing how many items are pending (e.g. `<span class="text-xs font-bold text-indigo-700
   bg-indigo-50 px-2 py-0.5 rounded-full ml-2">3</span>`).
7. Ensure the page title matches the app's section — "Dashboard" or the company name, not a
   generic placeholder.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 2 — Projects List Page

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Projects list page (src/app/features/projects/):

UI CONSISTENCY FIXES
- Page container: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- List card: `bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100`
- Each row: `px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors`
- Job number (J208): `text-xs font-mono font-bold text-slate-900 w-12 shrink-0`
- Project name: `text-sm font-semibold text-slate-900 min-w-0 truncate flex-1`
- Supporting info (status, dates): `text-xs text-slate-500`
- Status chips: `<app-status-chip tone="..." label="...">`
- Filter/search bar buttons: secondary button style (`bg-white border border-slate-200`)
- "New Project" or primary action: `bg-slate-900 text-white` — one per page max

FUNCTIONAL / UX IMPROVEMENTS
1. Pagination: if the project list loads all records at once, add basic pagination or a
   "Load more" button. Suggested implementation: signal `visibleCount = signal(25)`, show
   `projects().slice(0, visibleCount())`, add a `<button>` at the bottom:
   `(click)="visibleCount.set(visibleCount() + 25)"` styled as a ghost button
   (`text-xs font-semibold text-slate-500 hover:text-slate-900`). Show "Showing X of Y projects"
   in `text-xs text-slate-500` above the list.
2. Search: if there is no search/filter input, add one — a text input with placeholder
   "Search projects…" that filters the list by job number or project name using a `computed()`
   signal. Use `border border-slate-200 rounded-lg px-3 py-2 text-sm` styling.
3. Status filter: add a row of filter chips for Active / Closed / All. Style as secondary
   buttons; the selected one gets `bg-slate-900 text-white`, others get the standard secondary
   style. Implement using a `filter = signal<'active'|'closed'|'all'>('active')` and filter
   the `computed()` list.
4. Sort: add a sort dropdown or button group for "Name", "Job #", "Last updated". Keep it
   simple — a `<select>` styled with `border border-slate-200 rounded-lg px-3 py-2 text-sm`
   is fine.
5. Loading state: show a skeleton list (3–5 rows of `animate-pulse bg-slate-100 rounded h-12`)
   while data is loading. Gate it with `@if (loading())`.
6. Empty state: use `<app-empty-state icon="folder_off" title="No projects found"
   message="Try adjusting your search or filters." />` when the filtered list is empty.
7. Error state: show the amber warning banner if the API or Firestore call fails, with a
   "Retry" button.
8. Row click → navigation: make sure clicking anywhere on a project row navigates to
   `/projects/:id`. Use `cursor-pointer` on the row div.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 3 — Project Detail Shell & Navigation

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Project Detail shell (src/app/features/projects/project-detail/ or similar):

UI CONSISTENCY FIXES
- Page container on the shell: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- Tab row: `flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200 pb-1`
- Active tab: `bg-slate-900 text-white px-4 py-2 rounded-t-lg text-sm font-semibold`
- Inactive tab: `text-slate-500 px-4 py-2 rounded-t-lg text-sm font-semibold hover:text-slate-900
  hover:bg-slate-50 transition-colors`
- Page header: `<app-page-header title="J208 — Project Name" subtitle="Active">` — subtitle
  should be the project status rendered as plain text (not a chip in the header)

FUNCTIONAL / UX IMPROVEMENTS
1. Fallback/error banner: if the project fails to load (API error or Firestore miss), show:
   ```
   <div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200
     rounded-lg text-sm text-amber-800">
     <span class="material-icons text-amber-500 text-base">warning</span>
     <span>Could not load project data. Check your connection.</span>
     <button (click)="reload()" class="ml-auto text-xs font-semibold underline
       hover:text-amber-900 transition-colors">Retry</button>
   </div>
   ```
   Wire `reload()` to re-fetch the project. If a retry method doesn't exist, create one that
   resets the error signal and calls the load method.
2. Show all tools toggle: find the signal or property that controls which tabs are shown
   (gating features like CPR, Work Comp, etc.) and ensure the DEFAULT is `true` (show all),
   not `false`. The user can hide tools, but by default everything is visible.
3. Breadcrumb: above the page header, add a breadcrumb:
   `<nav class="text-xs text-slate-500 mb-1"><a routerLink="/projects" class="hover:text-slate-900
   transition-colors">Projects</a> › <span class="text-slate-900">J208</span></nav>`
4. Project status badge: show an `<app-status-chip>` for the project status in the header area
   (next to or below the title, not inside `<app-page-header>` subtitle).
5. Loading skeleton: while the project is loading, show a skeleton header (two lines of
   `animate-pulse bg-slate-100 rounded`) and a skeleton tab row (4–6 skeleton pills).
6. 404 state: if the project ID does not exist in the data source, show:
   `<app-empty-state icon="search_off" title="Project not found"
   message="This project may have been archived or the link is incorrect." />`
   with a "Back to Projects" link button.
7. Tab persistence: store the last-active tab in `localStorage` keyed to `brighten.lastTab.<projectId>`
   and restore it on navigation back to the project. This prevents the user losing their place.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 4 — Project Overview Panel

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Project Overview panel (the first/default tab in project detail):

UI CONSISTENCY FIXES
- Panel container (inside the tab content): `p-5` (standard card padding, no extra wrapper)
- Field label: `text-[10px] font-bold uppercase tracking-widest text-slate-500`
- Field value: `text-sm text-slate-900` (or `text-sm font-mono text-slate-700` for dollar amounts)
- Section headers inside the panel: `text-sm font-bold text-slate-900 mb-3`
- Edit button: Accent style — `text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs
  font-semibold hover:bg-indigo-100 transition-colors`
- Save/Cancel in edit mode: Save = `bg-slate-900 text-white px-4 py-2 rounded-lg text-sm
  font-semibold hover:bg-slate-800 transition-colors`, Cancel = secondary button style

FUNCTIONAL / UX IMPROVEMENTS
1. Stat summary row: at the top of the Overview, show a 4-up stat grid using `<app-stat-card>`:
   Contract Value, Billed to Date, Remaining, % Complete. Pull values from the project's
   financial summary if available; show "—" if not yet loaded. Grid:
   `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">`.
2. Inline editing: every editable field (project name, address, owner, GC contact, etc.) should
   have an edit pencil icon (`<span class="material-icons !text-[14px] text-slate-400
   hover:text-slate-700 cursor-pointer ml-1">edit</span>`) that activates an inline text input.
   On save, call the update method. On blur or Escape, cancel. Do NOT use a full-page edit mode
   if individual field editing is feasible.
3. Contact section: if there are GC contact, owner contact, or PM fields, show them in a
   dedicated "Contacts" sub-section with name, phone (tel: link), and email (mailto: link).
   Phone/email should be styled as `text-indigo-700 hover:underline`.
4. Project dates: Start date and projected end date should be shown. If end date is in the past
   and the project is still active, show the end date in `text-rose-700` (overdue indicator).
5. Notes / description field: if there is a project notes or description field, show it in a
   `<textarea>` that auto-resizes (add `rows="3"` and `resize-y`). Show a character count below
   in `text-xs text-slate-400`.
6. Drive folder link: if `project.driveFolderId` exists, show a pill link:
   `<a [href]="driveService.folderUrl(project.driveFolderId)" target="_blank"
   class="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50
   px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
   <span class="material-icons !text-[14px]">folder</span>Open Drive Folder</a>`
7. Activity log: at the bottom of the Overview, show the 5 most recent activity events for
   this project from `ActivityEventsService`. Each event: timestamp in `text-xs text-slate-400`,
   description in `text-xs text-slate-600`. Add a "View all activity" ghost button that expands
   the list or navigates to an activity tab.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 5 — Project Financials Panel & Tabs

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Project Financials panel and all its sub-tabs (Budget, SOV, Change Orders, Invoices, etc.):

UI CONSISTENCY FIXES
- Sub-tab row: `flex gap-1 overflow-x-auto whitespace-nowrap` inside the panel, with the same
  active/inactive tab styling as the main tab row (but smaller: `text-xs` and `px-3 py-1.5`)
- All dollar amounts in tables: `text-xs font-mono text-slate-700` (never `text-sm`)
- Column headers in tables: `text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 py-2`
- Table rows: `px-3 py-2.5 hover:bg-slate-50 transition-colors text-xs text-slate-700`
- Total rows: `px-3 py-3 bg-slate-50 font-semibold text-xs text-slate-900`
- Positive variance: `text-emerald-700`, Negative variance: `text-rose-700`
- Table wrapper: `overflow-x-auto` to enable horizontal scroll on small screens

FUNCTIONAL / UX IMPROVEMENTS
1. Budget vs Actual summary: at the top of the Financials panel (before sub-tabs), show a 4-up
   stat grid — Original Contract, Approved Changes, Revised Contract, % Billed. Use `<app-stat-card>`.
2. Change Order list: each CO should show status chip (`<app-status-chip>`), CO number in
   `font-mono`, date, description, and amount. Clicking a CO should open a detail drawer
   (`max-w-lg`) showing full CO details and any attached documents.
3. Invoice list: same pattern — invoice number in `font-mono`, date, amount, status chip. Add
   a "Mark Paid" button (accent style) on unpaid invoices. Show a running total at the bottom
   of the list: "X invoices · $Y,YYY total".
4. SOV table: show each line item with: # (font-mono), description, scheduled value, % complete
   (editable number input), billed this period, billed to date, balance. The % complete input
   should be `<input type="number" min="0" max="100">` styled with `w-16 border border-slate-200
   rounded px-2 py-1 text-xs text-right`.
5. Empty state per sub-tab: if no records exist for a given sub-tab, use `<app-empty-state>`
   with an appropriate icon (e.g. `receipt_long` for invoices, `difference` for change orders).
6. Export button: add a ghost "Export CSV" button in the panel header for the currently active
   sub-tab. Style: `text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors`.
   On click, call a `exportToCsv(data, filename)` utility (create it in
   `src/app/shared/utils/export.ts` if it doesn't exist: convert an array of objects to CSV and
   trigger a download via a temporary `<a>` element).
7. Loading state: skeleton rows (3–5 `animate-pulse h-8 bg-slate-100 rounded mx-3 my-1`) while
   financial data loads.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 6 — Project Workflows Panel (CPR, Work Comp, Lien Waivers, etc.)

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Project Workflows panel and all workflow sub-tabs (CPR, Work Comp, Lien Waivers,
Insurance, etc.):

UI CONSISTENCY FIXES
- Save/Submit buttons: change ANY `bg-emerald-600` or `bg-green-600` buttons to
  `bg-slate-900 text-white hover:bg-slate-800` (primary style)
- Cancel buttons: `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50` (secondary)
- Delete/void buttons: `text-rose-700 bg-rose-50 hover:bg-rose-100` (danger style)
- Status chips: use `<app-status-chip tone="..." label="...">` everywhere
- Sub-tab row: same overflow-x-auto pattern as Financials

FUNCTIONAL / UX IMPROVEMENTS
1. CPR (Certified Payroll Reports) tab:
   - Each CPR entry should show: week ending date, subcontractor name, # workers, status chip
     (Submitted / Pending / Rejected), and an "Open" accent button.
   - Add a "New CPR" primary button in the sub-tab header area.
   - If CPR is a gated feature, wrap the entire tab content in a feature-flag check. If the flag
     is off, show an `<app-empty-state icon="lock" title="Certified Payroll not enabled"
     message="Enable this feature in Project Settings." />` instead of an error or blank screen.
   - Bulk actions: add a "Select all" checkbox and a "Mark Selected as Submitted" bulk action
     button that appears when any row is checked.

2. Work Comp tab:
   - Show a summary banner at the top: total payroll exposure, estimated WC premium, policy
     expiry date. Style as an info banner (`bg-indigo-50 border border-indigo-200`).
   - Each entry: date, amount, rate, calculated premium, status chip.
   - Same gating approach as CPR — if not enabled, show the lock empty state.

3. Lien Waivers tab:
   - Group by subcontractor. Within each group, show a timeline of waiver events (conditional,
     unconditional) with status chips.
   - "Request Waiver" button per sub row: accent style.
   - Overdue waivers (expected date passed, not received): row background `bg-rose-50`,
     status chip tone `red`.

4. Insurance tab:
   - Card per subcontractor with GL, WC, auto expiry dates.
   - Expired policies: show `text-rose-700` dates and an `<app-status-chip tone="red"
     label="Expired">`.
   - Expiring within 30 days: `text-amber-700` and `<app-status-chip tone="amber" label="Expiring">`.
   - "Upload Certificate" button: secondary style.

5. Across all workflow sub-tabs:
   - Empty state using `<app-empty-state>` with relevant icon.
   - Loading skeleton while data loads.
   - Error banner if data fetch fails, with Retry button.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 7 — Project Documents Panel

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Project Documents panel (src/app/features/documents/ or similar):

UI CONSISTENCY FIXES
- Archive button: `text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold
  hover:bg-rose-100 transition-colors` (danger style)
- "Show archived" toggle: if implemented as a button, use secondary style; if a checkbox,
  pair it with a `text-sm text-slate-600` label
- File type icons: use Material Icons (`description`, `picture_as_pdf`, `table_chart`,
  `image`, `folder`) — never external image icons
- File rows: `px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors`

FUNCTIONAL / UX IMPROVEMENTS
1. Folder tree: if the project has a Drive folder linked (`project.driveFolderId`), show a
   two-level folder tree (root folder → subfolders) in a sidebar or collapsible section. Use
   `DriveService.listChildren()` to fetch. Show a spinner while loading, error banner if it
   fails. Each folder row is clickable and loads the files within that folder.
2. File list: show name, last modified date (`text-xs text-slate-500`), and file type chip
   (`<app-status-chip tone="slate" label="PDF">` etc.). File names should be links that open
   `webViewLink` in a new tab.
3. Upload button: "Upload File" in primary style. On click, open a file picker (`<input
   type="file">`). On selection, call `DriveService.uploadFile()` with the selected file and
   show an inline progress indicator (a simple "Uploading…" text with a spinner is fine).
4. Create subfolder: "New Folder" secondary button. On click, show an inline text input with
   confirm/cancel. On confirm, call `DriveService.createFolder()`.
5. Unlinked state: if `project.driveFolderId` is empty, show:
   `<app-empty-state icon="folder_off" title="No Drive folder linked"
   message="Link a Google Drive folder in Project Overview to manage documents here." />`
   with a button that scrolls to or navigates to the Overview edit field.
6. Archived files toggle: maintain a signal `showArchived = signal(false)`. When false, filter
   out archived files from the displayed list. The toggle button label changes to
   "Show archived (N)" / "Hide archived".
7. Search: a filter input above the file list that filters by filename. Use a `computed()`
   signal for the filtered list.
8. Sort: sort files by Name or Last Modified. Default: Last Modified descending.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 8 — Financials Hub (Global Financials Page)

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the global Financials Hub page (src/app/features/financials/ or similar):

UI CONSISTENCY FIXES
- Page container: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- Segmented control (WIP / AR / Billing / etc.): use secondary button style for inactive
  segments, primary (`bg-slate-900 text-white`) for the active segment
- Stat grid: `grid grid-cols-2 lg:grid-cols-4 gap-4` using `<app-stat-card>`
- All dollar amounts: `text-xs font-mono text-slate-700`
- Row pattern in summary tables: `px-5 py-3 hover:bg-slate-50 transition-colors`
- Status chips: `<app-status-chip tone="..." label="...">`

FUNCTIONAL / UX IMPROVEMENTS
1. Top-line KPI row: show 4 stat cards — Total Contract Value (all active projects), Total
   Billed, Total Collected, Uncollected AR. Values from aggregating project financial records.
   Show a loading skeleton while data loads, "—" for unavailable data.
2. WIP Report tab:
   - Table columns: Job #, Project Name, Contract, Billed, Earned, Over/Under Billing.
   - Over-billed rows: `text-rose-700` for the over/under cell. Under-billed: `text-emerald-700`.
   - Column totals row: `bg-slate-50 font-semibold`.
   - Export CSV button (ghost style) in the panel header.
3. AR (Accounts Receivable) tab:
   - Group invoices by aging bucket: Current, 30–60 days, 60–90 days, 90+ days.
   - Each bucket is a collapsible section (default open) with a count and total.
   - 90+ days bucket: header in `text-rose-700`.
   - "Send Reminder" button per invoice row: accent style. (Can be a no-op stub for now —
     just log `console.log('send reminder', invoiceId)` — but wire the UI.)
4. Billing tab:
   - Show a list of upcoming billing dates / draft invoices.
   - Each row: project name, invoice #, due date, amount, status chip.
   - Overdue rows: date in `text-rose-700`.
5. Loading and empty states on each tab: `<app-empty-state>` if no records, skeleton rows
   while loading, amber error banner if fetch fails.
6. Date range filter: add a simple "This month / Last 3 months / This year / All time"
   button group above the stat cards. Store selection in a signal and pass it to all data
   queries. Default: "This year".

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 9 — WIP, AR & Billing Detail Pages

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the standalone WIP, AR, and Billing pages (if they exist as separate routes, e.g.
/financials/wip, /financials/ar, /financials/billing):

UI CONSISTENCY FIXES
- Page container: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6` — standardize all
  three pages to the same max-width
- All dollar amounts: `text-xs font-mono text-slate-700` throughout all three pages
- Row hover: `hover:bg-slate-50 transition-colors` (not /80 variant)
- Status chips: `<app-status-chip tone="..." label="...">`
- Primary buttons: `bg-slate-900 text-white` — replace any colored variants

FUNCTIONAL / UX IMPROVEMENTS (apply to each page as relevant):

WIP PAGE
1. Add a "Recalculate WIP" primary button that re-runs the WIP computation from current
   billing and contract data. Show a spinner inside the button while computing
   (`<span class="animate-spin material-icons !text-[14px]">refresh</span>`).
2. Color-code the Over/Under Billing column: positive (over-billed) = `text-rose-700 bg-rose-50
   px-1.5 rounded font-mono`, negative (under-billed) = `text-emerald-700 bg-emerald-50
   px-1.5 rounded font-mono`.
3. Click-through: clicking a project row navigates to that project's Financials panel.

AR PAGE
1. Add an "aged summary" bar at the top — a horizontal bar chart or four colored boxes
   showing $ amounts in each aging bucket (Current, 30–60, 60–90, 90+). Use Tailwind widths
   proportional to the totals. Color: current=emerald, 30-60=amber, 60-90=orange, 90+=rose.
2. "Mark as Paid" button on each AR row: accent style. On click, confirm with a simple
   `confirm()` dialog, then call the update method to mark the invoice paid and refresh the list.
3. Filter by project: a search/select input to filter AR rows by project name or job number.
4. Export CSV: ghost button in the page header.

BILLING PAGE
1. "Create Invoice" primary button → opens a drawer (`max-w-lg`) with fields: project
   (select), invoice #, date, amount, description. Save calls the create method. Cancel closes.
2. Draft invoices section: group invoices with status "Draft" at the top with an amber
   `<app-status-chip tone="amber" label="Draft">` badge.
3. Sent / awaiting payment: standard row with "Resend" ghost button.
4. Paid invoices: grouped at the bottom, collapsible section (default collapsed).

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 10 — Labor Pages (Payroll, Prevailing Wage, Crew, Time Tracking)

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix all Labor-related pages (src/app/features/labor/ or similar):

UI CONSISTENCY FIXES (highest deviation area — fix all of these)
- Page containers: change ALL `p-8` to `p-6 lg:p-8`. Change ALL incorrect max-widths
  (`max-w-[1400px]`, `max-w-[1500px]`, `max-w-screen-xl`, etc.) to `max-w-[1440px]`
- Replace ALL `bg-blue-600`, `bg-emerald-600`, `bg-green-600` buttons with `bg-slate-900`
- Replace ALL `font-black` usage outside stat card values with `font-bold` or `font-semibold`
- Status chips: use `<app-status-chip tone="..." label="...">` throughout
- Dollar amounts: `text-xs font-mono text-slate-700`
- All interactive rows must have `hover:bg-slate-50 transition-colors`
- All buttons must have `hover:` state and `transition-colors`

FUNCTIONAL / UX IMPROVEMENTS

PAYROLL TAB
1. Pay period selector: a date range picker or prev/next week arrows for navigating pay
   periods. Current period highlighted with `bg-slate-900 text-white rounded-lg px-3 py-1.5`.
2. Timesheet rows: employee name, regular hours, OT hours, DT hours, gross pay (font-mono),
   status chip (Approved/Pending/Flagged). Click row → detail drawer.
3. Bulk approve: "Approve All Pending" primary button. Shows count of pending timesheets
   in the button label — `Approve All (3)`.
4. Prevailing wage flag: if an employee or project has prevailing wage, show a `violet`
   status chip (`<app-status-chip tone="violet" label="Prev. Wage">`).

PREVAILING WAGE TAB
1. Compliance summary at the top: X employees compliant, Y missing certified payroll, Z
   reports due this week. Style as three stat cards (not raw text).
2. Per-project prevailing wage table: project name, craft classification, base rate,
   fringe rate, effective date. Show a warning chip if the stored rate is older than 6 months.
3. Rate update: "Update Rates" accent button per row that opens an inline edit form.

CREW / EMPLOYEE DIRECTORY
1. Search input to filter by name or ID. Computed signal for filtered list.
2. Each employee card/row: name, ID (font-mono), classification, status chip
   (Active/On Leave/Terminated).
3. Click → drawer showing employee details, current project assignments, YTD pay summary.

TIME TRACKING
1. Weekly grid view: rows = employees, columns = Mon–Sun, cells = hours input. Allow direct
   cell editing (`<input type="number" min="0" max="24" step="0.5">`).
2. Total column on the right: sum of all hours for the week per employee.
3. "Submit Week" button (primary) that locks the grid and changes status to Pending.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 11 — Tasks, RFIs, Submittals, Daily Logs, Field Issues

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix all field/workflow management pages: Tasks, RFIs, Submittals, Daily Logs, and Field Issues
(src/app/features/tasks/, rfis/, submittals/, daily-logs/, field-issues/ or within project-detail):

UI CONSISTENCY FIXES
- Page containers (each page): `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- List rows: `px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors`
- All numbered IDs (RFI-001, Sub-003, etc.): `text-xs font-mono font-bold text-slate-900`
- Status chips: `<app-status-chip tone="..." label="...">`
- Action buttons (Open, View, Respond): accent style
- Delete/void: danger style
- Primary "New ___" button: `bg-slate-900 text-white`

FUNCTIONAL / UX IMPROVEMENTS

TASKS
1. Kanban / list toggle: add a view toggle (List | Kanban) in the page header. Default: List.
   Store preference in localStorage `brighten.tasksView`. Kanban shows columns for
   To Do / In Progress / Blocked / Done.
2. Task row: title, assignee avatar/initials, due date, priority chip (High/Medium/Low using
   red/amber/slate tones), project link.
3. Overdue tasks: show the due date in `text-rose-700` and a `bg-rose-50` row background.
4. Filter bar: filter by project, assignee, status, due date range.
5. Click → open task detail drawer (`max-w-lg`) with title, description (textarea), assignee,
   due date, priority, linked project, and activity/comment thread at the bottom.

RFIs
1. RFI log table: RFI # (font-mono), subject, submitted by, date submitted, date due, date
   answered, status chip, "Open" button.
2. Days open: compute and show in a `text-xs text-slate-500` cell. If over 14 days open:
   `text-rose-700`.
3. "New RFI" button → drawer with: project (select), subject, question (textarea), ball in
   court (select: Owner/Architect/Engineer/GC), due date.
4. Ball in court filter: filter buttons for each party. Active filter button: `bg-slate-900
   text-white`.

SUBMITTALS
1. Submittal log: submittal # (font-mono), description, spec section, submitted by, date
   submitted, required date, returned date, status chip.
2. Overdue (required date passed, not returned): row background `bg-amber-50`.
3. Status flow: Draft → Submitted → Under Review → Approved / Rejected / Revise & Resubmit.
   Each status uses the correct `<app-status-chip>` tone.
4. "New Submittal" drawer: same fields as table columns.

DAILY LOGS
1. Calendar strip at the top: show the last 7 days as clickable date pills. Selected day:
   `bg-slate-900 text-white`. Navigate to that day's log on click.
2. Log entry: date header in `text-sm font-bold text-slate-900`, weather, crew count, work
   description (textarea), any visitors/inspectors.
3. "New Entry" primary button. Only one entry per date — if today already has an entry,
   show "Edit Today's Log" (accent style).
4. Photo count badge per log entry: if photos are attached, show a small badge
   (`bg-slate-100 text-slate-700 text-xs rounded px-2 py-0.5`).

FIELD ISSUES
1. Issue log: issue # (font-mono), title, reported by, date, severity chip (Critical/High/
   Medium/Low using red/rose/amber/slate tones), status, "Open" button.
2. Critical issues: pin to top of list with a `bg-rose-50` row background.
3. "New Issue" drawer: title, description, severity (select), assignee, photos (file input).
4. Resolution timeline: in the detail drawer, show a simple timeline of status changes
   (reported → acknowledged → in progress → resolved) using vertical dots and lines.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 12 — Subcontractors & Directory

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix the Subcontractors and Directory pages (src/app/features/subcontractors/ or similar):

UI CONSISTENCY FIXES
- Page container: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- List rows: `px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors`
- Status chips: `<app-status-chip tone="..." label="...">`
- Assign button: accent style (`text-indigo-700 bg-indigo-50 hover:bg-indigo-100`)
- Remove/unassign: danger style
- Primary "Add Subcontractor": `bg-slate-900 text-white`

FUNCTIONAL / UX IMPROVEMENTS
1. Sub card/row: company name (font-semibold), trade/classification (text-xs text-slate-500),
   contact name, phone (tel: link), email (mailto: link), status chip (Active/Inactive/
   On Hold), "Open" button.
2. Compliance column: show a composite compliance badge — green if GL + WC + Lien Waiver
   all current, amber if any expiring within 30 days, red if any expired. Tooltip on hover
   showing which items are expiring.
3. Project assignments: inside the sub detail drawer (`max-w-lg`), show a list of active
   project assignments with the project name, job #, contract value, and status chip.
4. Insurance tracker: within the drawer, show GL expiry, WC expiry, auto expiry with color
   coding (green/amber/red based on days remaining).
5. Filter: filter by trade/classification, compliance status (All/Compliant/Expiring/Expired).
6. Search: filter by company name or contact name.
7. "New Subcontractor" drawer: company name, trade, contact name, phone, email, address,
   GL policy #, GL expiry, WC policy #, WC expiry. All fields with proper `text-sm` inputs
   and `border border-slate-200 rounded-lg` styling.
8. Bulk assign: multi-select rows and assign selected subs to a project via a dropdown.
   "Assign to Project (3)" button appears when any rows are checked.
9. Export directory: ghost "Export CSV" button in the page header. Exports name, trade,
   contact, phone, email, compliance status.
10. Empty state: `<app-empty-state icon="group_off" title="No subcontractors found"
    message="Add your first subcontractor to get started." />`.

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 13 — Settings Pages

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

Fix all Settings pages (src/app/features/settings/ or similar):

UI CONSISTENCY FIXES
- Page container: `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- Settings section cards: `bg-white rounded-xl border border-slate-200 shadow-sm p-5`
- Section header: `text-sm font-bold text-slate-900 mb-3`
- Input fields: `w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900
  focus:outline-none focus:ring-2 focus:ring-indigo-300`
- Save buttons: `bg-slate-900 text-white` (never emerald)
- Danger zone (delete/archive actions): wrap in a card with `border border-rose-200` and use
  danger button style

FUNCTIONAL / UX IMPROVEMENTS

DATA SOURCES / INTEGRATIONS
1. Source health cards: one card per integration (Firestore, Cloud SQL, Google Drive, QuickBooks).
   Each shows: source name, status chip (Connected/Error/Not configured), last sync time
   (`text-xs text-slate-500`), and a "Test Connection" ghost button that pings the source
   and updates the status chip.
2. QuickBooks settings:
   - Input for QB Webhook Verifier Token (password input, toggle visibility).
   - Input for Spreadsheet ID for the QB export sheet.
   - "Save QB Settings" primary button.
   - Current webhook status chip.
3. Google Drive settings:
   - Input for root Drive folder ID (with a "Paste folder URL" hint below: `text-xs
     text-slate-400`).
   - Input for Drive Webhook Channel Token (password input).
   - "Save Drive Settings" primary button.
   - Active webhook channel count: `text-xs text-slate-500 mt-1`.
4. API backend:
   - Input for API Base URL with a "Test" button that calls `GET /api/health` and shows
     result inline.
   - Toggle for "Use API backend" (vs Firestore direct) — styled as a proper toggle switch.

ADVANCED / DEVELOPER SETTINGS
5. Feature flags: list all feature flags (CPR, Work Comp, Prevailing Wage, etc.) as toggle
   switches. Each toggle: label in `text-sm font-semibold text-slate-900`, description in
   `text-xs text-slate-500` below, toggle on the right.
6. Data export: "Export All Projects (CSV)" and "Export Financial Summary (CSV)" ghost
   buttons. Each triggers a full data export.
7. Danger zone card (`border border-rose-200`):
   - "Clear All Cache" — clears localStorage, reloads page.
   - "Reset to defaults" — resets all settings to default values.
   - Each action uses danger button style and shows a confirm dialog first.

USER / ACCOUNT
8. Profile section: show current user email, Google account avatar (from auth), and a
   "Sign Out" danger-style button.
9. Notification preferences: checkboxes for email notifications on: overdue invoices,
   expiring insurance, daily log reminders, new RFIs. (Store in Firestore user profile doc.)

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```

---

## Prompt 14 — Shared UI Components (Run Last)

```
You are working on the Brighten Project Manager Angular app (Angular 21, Tailwind CSS 4.1,
standalone components, signals). The design system rules are in docs/ui-design-system.md.

This is the final clean-up pass. Fix the shared/core components to be canonical references
that all pages already depend on (src/app/shared/components/ and src/app/core/components/):

APP-PAGE-HEADER
- Must accept: `title: string`, `subtitle?: string`, `primaryActionLabel?: string`,
  `(primaryAction): EventEmitter`
- Primary action button: `bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold
  hover:bg-slate-800 transition-colors`
- Title: `text-2xl font-bold text-slate-900 tracking-tight`
- Subtitle: `text-sm text-slate-500 mt-0.5`
- Layout: `flex flex-wrap items-start justify-between gap-4 mb-6`
- Secondary actions slot: `ng-content` — renders between subtitle and primary button

APP-STAT-CARD
- Accepts: `label: string`, `value: string | number`, `trend?: 'up'|'down'|'neutral'`,
  `trendValue?: string`, `icon?: string`
- Card: `bg-white rounded-xl border border-slate-200 shadow-sm p-5`
- Label: `text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1`
- Value: `text-xl font-black text-slate-900`
- Trend (optional): up=`text-emerald-700`, down=`text-rose-700`, neutral=`text-slate-500`;
  show a small arrow icon (`arrow_upward`/`arrow_downward`) and the trendValue
- If value is loading (null/undefined): show `<span class="animate-pulse bg-slate-100
  rounded h-6 w-16 inline-block">` skeleton

APP-STATUS-CHIP
- Accepts: `tone: 'green'|'blue'|'amber'|'red'|'slate'|'violet'|'orange'`, `label: string`
- Must NOT accept arbitrary colors — only these 7 tones
- Classes per tone:
  - green: `bg-emerald-50 text-emerald-700 border border-emerald-200`
  - blue: `bg-blue-50 text-blue-700 border border-blue-200`
  - amber: `bg-amber-50 text-amber-700 border border-amber-200`
  - red: `bg-rose-50 text-rose-700 border border-rose-200`
  - slate: `bg-slate-100 text-slate-600 border border-slate-200`
  - violet: `bg-violet-50 text-violet-700 border border-violet-200`
  - orange: `bg-orange-50 text-orange-700 border border-orange-200`
- Base classes: `inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold
  uppercase tracking-wide`

APP-EMPTY-STATE
- Accepts: `icon: string`, `title: string`, `message?: string`
- Layout: `flex flex-col items-center justify-center py-16 text-center`
- Icon: `<span class="material-icons !text-[22px] text-slate-300 mb-3">{{ icon }}</span>`
- Title: `text-sm font-semibold text-slate-500 mb-1`
- Message: `text-xs text-slate-400`

NAVIGATION / SIDEBAR
- Active nav item: `bg-indigo-50 text-indigo-700 font-semibold`
- Inactive: `text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors`
- Nav icon: `!text-[18px]` Material Icons
- Remove any `text-base` font size from nav items; use `text-sm`

LOADING SPINNER (if a shared spinner component exists)
- Use a simple `animate-spin` ring: `<div class="w-5 h-5 border-2 border-slate-200
  border-t-slate-700 rounded-full animate-spin"></div>`
- Center it with `flex items-center justify-center py-12`

After updating these components, do a global search for any remaining inline status chip
color classes (`bg-amber-100 text-amber-800`, `bg-green-100 text-green-800`, etc.) and
replace them with the appropriate `<app-status-chip tone="..." label="...">` usage.

Also search for and replace:
- `p-8` without `lg:` prefix → `p-6 lg:p-8`
- `max-w-\[14[0-9]{2}px\]` that isn't `[1440px]` → `max-w-[1440px]`
- `hover:bg-slate-50/80` → `hover:bg-slate-50`
- `rounded-lg` on elements with class `border border-slate-200 shadow-sm` (full cards) → `rounded-xl`

Run `npm run build` after making changes and fix any TypeScript errors before submitting.
```
