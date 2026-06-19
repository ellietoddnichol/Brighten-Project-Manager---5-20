# Certified Payroll Integration — Cursor Implementation Prompt

## WHAT THIS IS

Brighten Builders LLC needs a working Certified Payroll (CPR) module inside their Angular 21 project
manager app. The module infrastructure already exists but is hidden and incomplete. This prompt tells
you exactly what to build, where the files are, and what the output must look like.

The reference output is a two-page government prevailing-wage payroll form:
- **Page 1** — "Contractor Payroll Records" table with one employee per 2-row block (ST row / OT row),
  day-by-day hours Sun–Sat, total hours, hourly rate, gross, FICA, taxes, deductions, net pay
- **Page 2** — "Fringe Benefits" table with one row per employee showing H&W, Pension, Vacation,
  Holiday, Apprentice Training, Other C, Other D, Total, explanation, and union name

---

## GROUND RULES

- Angular 21 standalone components. Always add imports to the `imports: []` array.
- Signals everywhere: `signal()`, `computed()`, `toSignal()`.
- Design system: `rounded-xl`, `shadow-sm`, `bg-white`, `border border-slate-200`, `text-sm`
- Status chips: `<app-status-chip [tone]="..." [label]="..." />`
- Page headers: `<app-page-header title="..." subtitle="..." />`
- Path aliases: `@app/*`, `@core/*`, `@shared/*`, `@features/*`
- After every Firestore write, the DataService subject/signal must refresh so UI updates immediately.
- Run `npm test -- --no-watch` after completing all work. All 251 tests must still pass.
- Run `npm run build` to confirm no TypeScript errors before finishing.

---

## PHASE 1 — ENABLE THE MODULE (do this first)

### 1A. Enable the nav entry

**File:** `src/app/shared/utils/global-enabled-modules.compute.ts`

Find the block that says:
```typescript
case 'certified-payroll':
  return false;
```

Replace it with:
```typescript
case 'certified-payroll':
  return input.showAllTools || !!input.certifiedPayrollRequired || !!input.prevailingWage || input.hasCPRRecords;
```

Also update `shouldShowCertifiedPayroll` in
`src/app/features/labor/utils/certified-payroll-week.ts` — it currently always returns `false`.
Change it to:
```typescript
export function shouldShowCertifiedPayroll(input: {
  showAllTools?: boolean;
  certifiedPayrollRequired?: boolean;
  prevailingWage?: boolean;
  hasCPRRecords?: boolean;
}): boolean {
  return !!(input.showAllTools || input.certifiedPayrollRequired || input.prevailingWage || input.hasCPRRecords);
}
```

### 1B. Add missing project CPR fields to the Project type

**File:** `src/app/models/types.ts`

Find the Project interface. These fields probably already exist but check and add any missing ones:
```typescript
wageOrderNumber?: string;          // AWO / wage order number
county?: string;
publicBody?: string;               // e.g. "Liberty Public School District 53"
publicBodyAddress?: string;        // e.g. "8 Victory Lane"
publicBodyCity?: string;
publicBodyState?: string;
publicBodyZip?: string;
publicBodyPhone?: string;
contractingAgency?: string;
primeContractor?: string;
contractNumber?: string;           // Project or Contract No. on the CPR form
certifiedPayrollRequired?: boolean;
payrollComplianceType?: string;
certifiedPayrollStatus?: string;
certifiedPayrollStartDate?: string;
certifiedPayrollEndDate?: string;
prevailingWage?: boolean;
```

### 1C. Expand the compliance quick-edit form

**File:** `src/app/features/projects/pages/certified-payroll-tab.ts`

The quick-edit form already has some fields. Add the missing ones so the form includes:
- Compliance Type (already exists)
- Wage Order / AWO # (already exists as `wageOrderNumber`)
- Contract / Project No. (`contractNumber`)
- Public Body name (`publicBody`)
- Public Body address line (`publicBodyAddress`)
- Public Body city, state, zip (`publicBodyCity`, `publicBodyState`, `publicBodyZip`)
- Public Body phone (`publicBodyPhone`)
- Contracting Agency (already exists)
- Prime Contractor (already exists)
- County (`county`)
- Certified payroll required checkbox (already exists)

Save calls `dataService.updateProject(project.id, { ...draft })`.

---

## PHASE 2 — SEED OFFICIAL FRINGE RATES INTO FIRESTORE

### 2A. Create the fringe rate seeder utility

**Create new file:** `src/app/features/labor/utils/fringe-rates-seed.ts`

This file exports a constant with the official KC1 Commercial fringe rates that match Brighten's
union agreement (2026-2027). These are the same rates hardcoded in the Apps Script.

```typescript
export interface FringeRateSeedRow {
  classification: string;
  skillLevel: string;
  percentOfJourneyman: number;
  wage: number;
  healthWelfare: number;
  pension: number;
  apprenticeTraining: number;
  iaf: number;
  citf: number;
  annuity: number;
  totalEmployer: number;
  dues: number;
  marketRecovery: number;
  vacationDeduction: number;
  totalPayrollDeduction: number;
  totalPackage: number;
  estampBenefit: number;
  effectiveFrom: string;
  effectiveThrough: string;
  sourceVersion: string;
}

export const KC1_COMMERCIAL_FRINGE_RATES_2026_2027: FringeRateSeedRow[] = [
  { classification: 'Journeyman Carpenter', skillLevel: 'Jrny', percentOfJourneyman: 1.00, wage: 46.83, healthWelfare: 11.25, pension: 9.50, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 2.30, totalEmployer: 24.21, dues: 1.87, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 3.07, totalPackage: 71.04, estampBenefit: 27.28, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 90%', skillLevel: '8th', percentOfJourneyman: 0.90, wage: 42.15, healthWelfare: 10.13, pension: 8.55, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 2.07, totalEmployer: 21.91, dues: 1.69, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.89, totalPackage: 64.06, estampBenefit: 24.80, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 85%', skillLevel: '7th', percentOfJourneyman: 0.85, wage: 39.81, healthWelfare: 9.56, pension: 8.08, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.96, totalEmployer: 20.76, dues: 1.59, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.79, totalPackage: 60.57, estampBenefit: 23.55, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 80%', skillLevel: '6th', percentOfJourneyman: 0.80, wage: 37.46, healthWelfare: 9.00, pension: 7.60, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.84, totalEmployer: 19.60, dues: 1.50, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.70, totalPackage: 57.06, estampBenefit: 22.30, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 75%', skillLevel: '5th', percentOfJourneyman: 0.75, wage: 35.12, healthWelfare: 8.44, pension: 7.13, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.73, totalEmployer: 18.46, dues: 1.40, marketRecovery: 0.20, vacationDeduction: 1.00, totalPayrollDeduction: 2.60, totalPackage: 53.58, estampBenefit: 21.06, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 65%', skillLevel: '4th', percentOfJourneyman: 0.65, wage: 30.44, healthWelfare: 7.31, pension: 6.18, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.50, totalEmployer: 16.15, dues: 1.22, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.22, totalPackage: 46.59, estampBenefit: 17.37, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 60%', skillLevel: '3rd', percentOfJourneyman: 0.60, wage: 28.10, healthWelfare: 6.75, pension: 5.70, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.38, totalEmployer: 14.99, dues: 1.12, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.12, totalPackage: 43.09, estampBenefit: 16.11, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 55%', skillLevel: '2nd', percentOfJourneyman: 0.55, wage: 25.76, healthWelfare: 6.19, pension: 5.23, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.27, totalEmployer: 13.85, dues: 1.03, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 1.03, totalPackage: 39.61, estampBenefit: 14.88, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
  { classification: 'Apprentice – 50%', skillLevel: '1st', percentOfJourneyman: 0.50, wage: 23.42, healthWelfare: 5.63, pension: 4.75, apprenticeTraining: 0.75, iaf: 0.26, citf: 0.15, annuity: 1.15, totalEmployer: 12.69, dues: 0.94, marketRecovery: 0.00, vacationDeduction: 0.00, totalPayrollDeduction: 0.94, totalPackage: 36.11, estampBenefit: 13.63, effectiveFrom: '2026-05-01', effectiveThrough: '2027-04-30', sourceVersion: 'KC1-COMMERCIAL-2026-2027-OFFICIAL-v1' },
];

export const CARPENTER_CLASSIFICATIONS = new Set([
  'Journeyman Carpenter',
  'Apprentice – 90%', 'Apprentice – 85%', 'Apprentice – 80%', 'Apprentice – 75%',
  'Apprentice – 65%', 'Apprentice – 60%', 'Apprentice – 55%', 'Apprentice – 50%',
]);

export function isCarpenterClassification(classification: string): boolean {
  return CARPENTER_CLASSIFICATIONS.has(classification);
}

export function fringeRateForClassification(
  classification: string,
): FringeRateSeedRow | undefined {
  return KC1_COMMERCIAL_FRINGE_RATES_2026_2027.find(r => r.classification === classification);
}
```

### 2B. Wire fringe rates into the generator

**File:** `src/app/features/labor/services/certified-payroll-generator.service.ts`

Import `fringeRateForClassification` from the seed file. In `buildEntry()` (or wherever fringe
amounts are calculated), use `fringeRateForClassification(classification)` to get the rate row and
compute:
- `fringeRate` = `totalEmployer` from the rate row (employer-paid portion only)
- `fringeAmount` = `fringeRate * totalHours`
- `grossPackage` = `regularWage + overtimeWage + doubleTimeWage + fringeAmount`

For non-carpenter classifications (Laborer, Summer Intern), set `fringeRate = 0`.

---

## PHASE 3 — PRINT-READY CPR FORM COMPONENT (most important)

### 3A. Create the CPR form print component

**Create new file:** `src/app/features/labor/components/cpr-form-print.ts`

This component renders both pages of the official "Contractor Payroll Records" form, exactly
matching the PDF examples. It receives data as `@Input()` and is designed to be printed.

#### Exact form layout — Page 1 "Contractor Payroll Records"

**Header section (rows 1-2):**
```
NAME OF SUBCONTRACTOR: Brighten Builders, LLC
Address: 512 S 70th St  Kansas City  KS  66111  Phone: 913-306-3055

Name of Public Body: [publicBody]    Address of Public Body: [publicBodyAddress] [city] [state]
PAYROLL NO.  |  For week ending  |  AWO  |  Project and Location  |  Project or Contract No.
[payrollNo]  |  [weekEnding]     |  [awo] |  [projectAndLocation] |  [contractNumber]
```

**Column headers (row 3):**
```
Col 1: Name and Address of Employee
Col 2: Occupational Title
Col 3: ST or OT
Col 4-10: Day columns SU M T W TH F S  (with date MM/DD below each)
Col 11: Total Hours
Col 12: Hourly Rate
Col 13: Gross Amount (Project/Week)
Col 14-17: Deductions: FICA and Medicare | Fed and State Withholding Tax | OTHER A | OTHER B
Col 18: Total Deductions
Col 19: NET WAGES PAID FOR WEEK
```

**Employee rows — two rows per employee:**
- Row 1 (ST row): Name in col 1, occupation in col 2, "ST" in col 3, ST hours in day cols, 
  total ST in col 11, hourly rate in col 12, project gross in col 13, FICA/Medicare in col 14,
  fed+state tax in col 15, union dues in col 16 (OTHER A), vacation deduction in col 17 (OTHER B),
  total deductions in col 18, net pay in col 19
- Row 2 (OT row): Address in col 1, blank occupation, "OT" in col 3, OT hours in day cols,
  total OT in col 11, OT rate in col 12, week gross (ADP gross) in col 13, rest blank

#### Exact form layout — Page 2 "Fringe Benefits"

Header text: "FRINGE BENEFITS" centered, followed by the legal paragraph about payments to programs.

**Column headers:**
```
Employee Name | H&W ($/hr) | Pension ($/hr) | Vacation ($/hr) | Holiday ($/hr) |
Apprentice Training ($/hr) | Other C | Other D | Total ($/hr) |
If "Other/Deduction" or Fringes, please explain | Identify plan/fund/program
```

**One row per employee:**
- Employee name
- H&W = `healthWelfare` from fringe rate
- Pension = `pension`
- Vacation = `0` (vacation is a payroll deduction, not employer fringe)
- Holiday = `0`
- Apprentice Training = `apprenticeTraining`
- Other C = `iaf + citf + annuity` (IAF / CITF / Annuity combined)
- Other D = `0`
- Total = `totalEmployer` from fringe rate
- Explanation = "Other A: Union Dues, Other C: IAF / CITF / Annuity, Other B: Vacation"
- Plan name = "Mid American Carpenters Union"

For non-carpenter employees: show name, all zeros, explanation = classification name.

#### Component implementation

```typescript
// Inputs:
@Input({ required: true }) project!: Project;
@Input({ required: true }) week!: CertifiedPayrollWeek;
@Input({ required: true }) entries!: CertifiedPayrollEntry[];
@Input() payrollNumber = '01';  // e.g. "026"

// Computed properties:
// - weekDates: string[] — 7 dates Sun through Sat derived from week.weekEnding
// - page1Rows: for each entry, build { name, address, occupation, stHours[7], otHours[7],
//              totalST, totalOT, stRate, otRate, projectGross, weekGross, ficaMed,
//              fedStateTax, unionDues, vacationDeduction, totalDeductions, netPay }
// - page2Rows: for each entry, build fringe benefit row using fringeRateForClassification()
```

The template must use `@media print` CSS so when the user does `window.print()` the output
matches the form exactly — no nav, no buttons, just the two-page form.

Use CSS classes like `.cpr-form` with these print styles in the component's styles array:
```css
@media print {
  .no-print { display: none !important; }
  .cpr-form { font-size: 8pt; font-family: Arial, sans-serif; }
  .cpr-form table { border-collapse: collapse; width: 100%; }
  .cpr-form td, .cpr-form th { border: 1px solid #000; padding: 2px 3px; }
  .cpr-page-break { page-break-before: always; }
}
```

The form must look like a real government form when printed — thin black borders, small font,
dense layout. When viewed on screen (not printing) it can render at normal scale for review.

### 3B. Add a "Preview & Print" action to the weeks table

**File:** `src/app/features/labor/pages/certified-payroll.ts`

In the "Weekly Drafts" tab, the row already has "Review" and "Export" buttons.
Add a "Print Form" button next to them:
```html
<button type="button" (click)="printWeek(week.id)"
        class="text-violet-700 hover:text-violet-900 text-xs font-semibold mr-3">
  Print Form
</button>
```

When clicked, set `printWeekId.set(week.id)`. Show the `<app-cpr-form-print>` component in a
full-screen overlay (not a modal — a full page div that covers the app) with a "Print" button
at the top (hidden during actual printing) and a close button. The "Print" button calls
`window.print()`.

```typescript
printWeekId = signal<string | null>(null);
printWeek(weekId: string): void { this.printWeekId.set(weekId); }
closePrint(): void { this.printWeekId.set(null); }
```

Import and add `CprFormPrintComponent` to the imports array.

### 3C. Wire the payroll number calculation

The payroll number is the sequential week count for this job since the first CPR week.
In the print component, compute it from `week.weekEnding` and the sorted list of all weeks for
this project:

```typescript
// If the project has weeks stored, sort by weekEnding ascending.
// The payroll number is the 1-based index of this week in that sorted list.
// Pad to 3 digits: '001', '002', etc.
// Pass this as payrollNumber input from the parent.
```

In `certified-payroll.ts`, compute `payrollNumberForWeek(weekId: string): string` using
`allWeeks()` filtered to the same project, sorted ascending by `weekEnding`.

---

## PHASE 4 — ALSO DO THESE SMALL FIXES (from previous audit)

### 4A. Fix hidden-module-banner hardcoded 'rfis' message

**File:** `src/app/components/layout/hidden-module-banner.ts`

Line 26 hardcodes `'rfis'`. Fix it so the message is dynamic based on the `moduleId` input.
The `globalModuleHiddenMessage` function already accepts a `GlobalModuleId` parameter.
Use a `computed()` signal or a getter that calls `globalModuleHiddenMessage(this.moduleId)`.
Note: `@Input()` values aren't available at field-init time, so use a getter:

```typescript
get message(): string {
  return globalModuleHiddenMessage(this.moduleId);
}
```

And in the template, call `message` (no parentheses since it's a getter, not a signal).

### 4B. Wire Billing next-actions row clicks

**File:** `src/app/features/financials/pages/billing.ts`

Find `(rowClick)="null"` on billing action rows. Replace with a navigate method:
```typescript
openBillingProject(action: { projectId: string }): void {
  this.router.navigate(['/projects', action.projectId], { queryParams: { tab: 'billing' } });
}
```
Inject `Router` from `@angular/router`. Change `(rowClick)="null"` to `(rowClick)="openBillingProject(action)"`.

### 4C. Wire Purchase Orders row clicks

**File:** `src/app/features/financials/pages/pos-page.ts`

Same pattern — replace `(rowClick)="null"` with navigation to the project budget tab:
```typescript
openPo(po: { projectId: string }): void {
  this.router.navigate(['/projects', po.projectId], { queryParams: { tab: 'budget' } });
}
```

### 4D. Wire Reports Print button

**File:** `src/app/features/financials/pages/reports.ts`

Add `(click)="window.print()"` to the Print Report button. To call `window` from a template,
add a class method:
```typescript
printReport(): void { window.print(); }
```
And wire `(click)="printReport()"`.

---

## AFTER ALL PHASES — VERIFY

1. `npm test -- --no-watch` → must show 251 passed, 0 failed
2. `npm run build` → must complete with no TypeScript errors
3. `npm run build --prefix api` → must succeed
4. Navigate to `/certified-payroll` in the app — it should now appear in the nav when any project
   has `prevailingWage: true` or `certifiedPayrollRequired: true`
5. Open a prevailing wage project → "Certified Payroll" tab should show the compliance setup form
6. Click "Generate Weekly Drafts" on the hub page → should run without JS errors
7. If any week exists, click "Print Form" → the CPR form overlay should open showing the
   two-page form with real data

---

## DO NOT CHANGE

- `src/app/features/financials/utils/wip.compute.ts` line 262 — the `'Margin under 20%'` chip
  mapping MUST stay or test `wip.compute.spec.ts:117` will fail
- `src/app/components/ui/status-chip.ts` — keep the `toneClass()` method with bordered chip style
- `src/app/core/services/data.service.ts` — all write methods have try/catch with
  `handleFirestoreError`; do not remove these wrappers
- `scripts/backfill-owner-id.mjs` — do not delete
- `firestore.rules` — do not modify

---

## KEY FILES REFERENCE

```
src/app/models/certified-payroll.types.ts          — all CPR types (comprehensive, do not duplicate)
src/app/models/types.ts                            — Project type (add missing CPR fields)
src/app/features/labor/pages/certified-payroll.ts  — hub page (342 lines, already functional)
src/app/features/labor/services/
  certified-payroll.service.ts                     — orchestration service
  certified-payroll-data.service.ts                — Firestore CRUD (314 lines)
  certified-payroll-generator.service.ts           — builds weekly drafts from time logs (320 lines)
  certified-payroll-export.service.ts              — exports to Google Sheet
  certified-payroll-tasks.service.ts               — manages compliance task board
src/app/features/labor/utils/
  certified-payroll-week.ts                        — utility functions (weekEndingSunday, etc.)
  fringe-rates-seed.ts                             — CREATE THIS FILE (Phase 2A)
src/app/features/labor/components/
  cpr-form-print.ts                                — CREATE THIS FILE (Phase 3A)
src/app/features/projects/pages/
  certified-payroll-tab.ts                         — per-project CPR tab (256 lines)
src/app/shared/utils/global-enabled-modules.compute.ts — module visibility (change certified-payroll case)
src/app/components/layout/hidden-module-banner.ts  — fix hardcoded 'rfis' (Phase 4A)
src/app/features/financials/pages/billing.ts       — fix rowClick (Phase 4B)
src/app/features/financials/pages/pos-page.ts      — fix rowClick (Phase 4C)
src/app/features/financials/pages/reports.ts       — fix Print button (Phase 4D)
```

---

## CPR FORM DATA MAPPING (Apps Script → Angular)

| Apps Script field | Angular model field | Notes |
|---|---|---|
| `setup.awo` | `project.wageOrderNumber` | AWO line on form row 6 |
| `setup.projectLocation` | `project.projectName + project.address` | "Project and Location" |
| `setup.contractNo` | `project.contractNumber` | Right side of row 6 |
| `setup.publicBody` | `project.publicBody` | Row 4 left |
| `setup.publicBodyStreet` | `project.publicBodyAddress` | Row 4 right |
| `setup.publicBodyCity/State/Zip` | `project.publicBodyCity/State/Zip` | Row 4 right continued |
| `r.displayName` | `entry.employeeName` | Row 1 col 1 |
| `r.address` | `employeePayrollInfo.address` | Row 2 col 1 |
| `r.occupation` | `entry.classification` | Row 1 col 2 |
| `r.days[i].st` | `entry.dailyHours[i].regularHours` | ST hours per day |
| `r.days[i].ot` | `entry.dailyHours[i].overtimeHours` | OT hours per day |
| `r.stRate` | `entry.baseRate` | Col 12 ST row |
| `r.otRate` | `entry.baseRate * 1.5` | Col 12 OT row |
| `r.projectGross` | `entry.regularWage + entry.overtimeWage` | Col 13 ST row |
| `r.weekGross` | `entry.grossPackage` or ADP gross | Col 13 OT row |
| `r.ficaMed` | compute: SS + Medicare from ADP | Col 14 |
| `r.fedStateTax` | compute: FIT + KS + MO from ADP | Col 15 |
| `r.unionDues` | OTHER A — union dues deduction | Col 16 |
| `r.vacationDeduction` | OTHER B — vacation deduction | Col 17 |
| `r.netPay` | net pay from ADP | Col 19 |
| Fringe rate `health` → H&W column | `fringeRate.healthWelfare` | Page 2 |
| Fringe rate `pension` → Pension col | `fringeRate.pension` | Page 2 |
| Fringe rate `training` → APPR col | `fringeRate.apprenticeTraining` | Page 2 |
| `iaf + citf + annuity` → Other C | computed sum | Page 2 |
| `totalEmployer` → Total column | `fringeRate.totalEmployer` | Page 2 |

---

## WHAT NOT TO BUILD

- Do NOT build an ADP CSV parser — the existing generator reads from Firestore labor time logs
- Do NOT replace the DataService or existing service structure
- Do NOT add a new router module — the route `/certified-payroll` already exists in the routes
- Do NOT build a separate "FringeRates" settings page — the seed file handles rates statically
- Do NOT add backend API routes for CPR — it stays in Firestore via DataService/CertifiedPayrollDataService
