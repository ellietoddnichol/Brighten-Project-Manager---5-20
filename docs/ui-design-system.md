# Brighten Project Manager — UI Design System

_Single source of truth for colors, typography, spacing, and components.
Every page and new feature must follow these rules. If something isn't covered,
add it here before implementing it — do not invent new patterns inline._

---

## 1. Color Palette

### Text

| Token | Tailwind class | Use |
|-------|---------------|-----|
| `text-primary` | `text-slate-900` | Headings, strong labels, job numbers |
| `text-body` | `text-slate-600` | Standard body copy, descriptions |
| `text-secondary` | `text-slate-500` | Supporting info, timestamps, subtitles |
| `text-muted` | `text-slate-400` | Placeholder text, disabled states |
| `text-accent` | `text-indigo-700` | Links, action text, nav active state |
| `text-success` | `text-emerald-700` | Positive values, paid status |
| `text-warning` | `text-amber-700` | Cautions, needs-review items |
| `text-danger` | `text-rose-700` | Errors, overdue, critical items |

### Backgrounds

| Token | Tailwind class | Use |
|-------|---------------|-----|
| `bg-page` | `bg-slate-50` | App background (set on app-shell) |
| `bg-surface` | `bg-white` | Cards, drawers, panels |
| `bg-subtle` | `bg-slate-50` | Hover states, alternate rows |
| `bg-accent` | `bg-indigo-50` | Accent button background, selected state |
| `bg-primary-action` | `bg-slate-900` | Primary button |
| `bg-success` | `bg-emerald-50` | Success chip background |
| `bg-warning` | `bg-amber-50` | Warning chip/banner background |
| `bg-danger` | `bg-rose-50` | Error chip/banner background |

### Borders

| Token | Tailwind class | Use |
|-------|---------------|-----|
| `border-default` | `border-slate-200` | Cards, inputs, separators |
| `border-strong` | `border-slate-300` | Stronger dividers |
| `border-subtle` | `border-slate-100` | Row dividers inside cards |
| `border-accent` | `border-indigo-200` | Focused/active state |
| `border-warning` | `border-amber-200` | Warning banners |
| `border-success` | `border-emerald-200` | Success chips |
| `border-danger` | `border-rose-200` | Error chips |

### Status Dot Colors (for `<app-list-row>` indicators)

| State | Tailwind class |
|-------|---------------|
| Active / On track | `bg-emerald-500` |
| Needs attention | `bg-amber-400` |
| Overdue / Critical | `bg-rose-600` |
| Inactive / Unknown | `bg-slate-300` |

---

## 2. Typography

### Hierarchy

| Role | Classes | Example use |
|------|---------|-------------|
| Page title (h1) | `text-2xl font-bold text-slate-900 tracking-tight` | "Projects", "Financials" |
| Section header (h2) | `text-lg font-bold text-slate-900` | Panel titles inside a page |
| Card/row header (h3) | `text-sm font-bold text-slate-900` | Card labels, drawer section titles |
| Body | `text-sm text-slate-600` | Descriptions, notes, help text |
| Meta / supporting | `text-xs text-slate-500` | Timestamps, IDs, sub-labels |
| Stat value | `text-xl font-black text-slate-900` | Large KPI numbers in stat cards |
| Stat label | `text-[10px] font-bold uppercase tracking-widest text-slate-500` | Labels above stat values |
| Mono data | `text-xs font-mono text-slate-700` | Job numbers (J208), dollar amounts in tables |
| Badge / chip text | `text-[10px] font-bold uppercase` | Status chips, category pills |

### Rules
- **Never use `text-base` (16px)** for body — `text-sm` (14px) is the app's body size
- **Never bold more than two things on a row** — one primary label, one optional secondary
- `font-black` is reserved for stat card values only
- Page titles always use `tracking-tight`
- Mono font (`font-mono`) for job numbers (J208), dollar amounts in dense tables, and IDs

---

## 3. Spacing & Layout

### Page containers

Every route-level page must wrap its content in:

```html
<div class="p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6">
```

- `p-6 lg:p-8` — consistent page padding, responsive
- `max-w-[1440px]` — single max-width standard across all pages
- `space-y-6` — consistent gap between sections/cards

**Do not use** `max-w-[1400px]`, `max-w-[1500px]`, or `p-8` without responsive breakpoint.

### Section spacing

| Context | Class |
|---------|-------|
| Between page sections | `space-y-6` |
| Between items in a card | `space-y-3` |
| Between inline items | `gap-2` or `gap-3` |
| Between filter controls | `gap-2` |

### Card/panel padding

| Card size | Classes |
|-----------|---------|
| Standard card | `p-5` |
| Compact card | `p-4` |
| Row inside a list card | `px-5 py-3` |
| Tight row (sub-items) | `px-5 py-2` |

---

## 4. Component Patterns

### Cards

**Standard card** (for data panels, section containers):
```html
<div class="bg-white rounded-xl border border-slate-200 shadow-sm">
```

**Compact stat card** (for KPI grids):
```html
<div class="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
```

**List card** (rows of data):
```html
<section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
```

Rules:
- Always `rounded-xl` for cards and panels (not `rounded-lg`)
- Always `shadow-sm` (not `shadow`, `shadow-md`)
- Dividers inside list cards use `divide-slate-100` (not `divide-slate-200`)

---

### Buttons

**Primary** (main page action — one per page max):
```html
<button class="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors">
```

**Secondary** (supporting actions, filters):
```html
<button class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors">
```

**Accent** (inline actions, "open", "view", next step CTAs):
```html
<button class="text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors">
```

**Ghost / text link** (low-emphasis, table row actions):
```html
<button class="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
```

**Danger** (destructive actions — archive, void, delete):
```html
<button class="text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors">
```

Rules:
- Every button must have a `hover:` state and `transition-colors`
- **Do not use** `bg-blue-600`, `bg-emerald-600`, or colored primary buttons — use `bg-slate-900` for all primary actions
- Green/emerald buttons are only for explicit "confirm save" dialogs
- Icon-only buttons need `aria-label`

---

### Status chips

Always use `<app-status-chip [tone]="..." [label]="...">` — never hardcode status chip colors inline.

| Situation | Tone |
|-----------|------|
| Active, paid, complete, on track | `green` |
| In progress, pending, partial | `blue` |
| Needs review, caution, waiting | `amber` |
| Overdue, error, critical, rejected | `red` |
| Archived, inactive, closed | `slate` |
| Special / prevailing wage / flagged | `violet` |
| Secondary warning | `orange` |

---

### Page header

Every route-level page must use `<app-page-header>`:

```html
<app-page-header
  title="Projects"
  subtitle="All active and closed jobs"
  primaryActionLabel="Export CSV"
  (primaryAction)="exportCsv()">
  <!-- Extra buttons go in ng-content -->
</app-page-header>
```

- **One** primary action button per page maximum
- Secondary actions go in `ng-content` slot as secondary buttons
- Subtitle is optional but use it when the page needs context

---

### Stat card grid

```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <app-stat-card label="Contract" [value]="..." />
  ...
</div>
```

- Always `grid-cols-2 lg:grid-cols-4` for stat grids (2 on mobile, 4 on desktop)
- Use `<app-stat-card>` — never build inline stat boxes
- Stat label: `text-[10px] font-bold uppercase tracking-widest`
- Stat value: `text-xl font-black`

---

### Detail drawers / modals

```html
<div class="fixed inset-0 bg-black/30 z-40">
  <aside class="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl overflow-y-auto">
```

- Always `max-w-lg` (32rem) for standard drawers
- `max-w-xl` only for complex multi-column edit forms
- Never use `max-w-md` — too narrow for form fields
- Overlay: `bg-black/30` (not `bg-black/50`)
- Shadow: `shadow-xl`

---

### List rows

```html
<div class="px-5 py-3 flex flex-wrap items-center gap-3 hover:bg-slate-50 transition-colors">
  <span class="text-xs font-mono font-bold text-slate-900 w-12 shrink-0">J208</span>
  <span class="text-sm font-semibold text-slate-900 min-w-0 truncate flex-1">Project Name</span>
  <span class="text-xs text-slate-500">Supporting info</span>
  <app-status-chip tone="green" label="Active" />
</div>
```

Rules:
- Hover: always `hover:bg-slate-50` (not `hover:bg-slate-50/80` — inconsistency to clean up)
- Job numbers: `font-mono font-bold text-xs w-12 shrink-0` — fixed width so columns align
- Primary label: `font-semibold text-slate-900` (not `font-bold` in rows — reserved for headings)
- Always `transition-colors` on interactive rows

---

### Empty states

Always use `<app-empty-state>`:
```html
<app-empty-state
  icon="inbox"
  title="No projects found"
  message="Try adjusting your search or filters." />
```

Never write inline empty state text like `<p class="text-slate-400 italic">Nothing here</p>`.

---

### Banners / alerts

```html
<!-- Warning -->
<div class="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
  <span class="material-icons text-amber-500 text-base">warning</span>
  <span>Message here.</span>
  <button class="ml-auto text-xs font-semibold underline hover:text-amber-900">Action</button>
</div>

<!-- Error -->
<div class="flex items-center gap-3 px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
  <span class="material-icons text-rose-500 text-base">error</span>
  <span>Message here.</span>
</div>

<!-- Info -->
<div class="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
  <span class="material-icons text-indigo-400 text-base">info</span>
  <span>Message here.</span>
</div>
```

---

## 5. Icons

Use **Material Icons** only (`mat-icon` component). Size classes:

| Size | Class | Use |
|------|-------|-----|
| Small (inline) | `!text-[14px]` | Inside chips, tight rows |
| Standard | `!text-[16px]` | Nav items, buttons |
| Medium | `!text-[18px]` | Stat card icons |
| Large | `!text-[22px]` | Page-level empty states |

Use `!text-[Npx]` (not `text-sm`, `text-lg`) because Material Icons require exact pixel override.

---

## 6. Responsive Rules

| Breakpoint | What changes |
|------------|-------------|
| Default (mobile) | Single column, stacked layout |
| `md:` (768px+) | Page header goes flex-row, some grids go 2-col |
| `lg:` (1024px+) | Stat grids go 4-col, page padding increases to p-8, sidebar visible |

- All tab rows must have `overflow-x-auto whitespace-nowrap` for horizontal scroll on mobile
- Tables must be wrapped in `overflow-x-auto` on mobile
- Never rely on `xl:` or `2xl:` breakpoints — the app is designed for 1024px–1440px desktops

---

## 7. What NOT to Do

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Inline status chip colors (`bg-amber-100 text-amber-800`) | Use `<app-status-chip tone="amber">` |
| `max-w-[1400px]` or `max-w-[1500px]` | `max-w-[1440px]` always |
| `p-8` without responsive breakpoint | `p-6 lg:p-8` |
| `bg-blue-600` or `bg-emerald-600` for primary buttons | `bg-slate-900` |
| `font-black` on anything other than stat values | Use `font-bold` or `font-semibold` |
| `hover:bg-slate-50/80` | `hover:bg-slate-50` |
| `rounded-lg` on full cards | `rounded-xl` |
| Inline empty state text | Use `<app-empty-state>` |
| Different max-widths per page | Single `max-w-[1440px]` |
| `text-base` for body text | `text-sm` |
| Hardcoding drawer widths as `max-w-md` | `max-w-lg` |

---

## 8. New Page Checklist

When building or updating any page, verify:

- [ ] Page container uses `p-6 lg:p-8 w-full max-w-[1440px] mx-auto space-y-6`
- [ ] Starts with `<app-page-header>`
- [ ] Has a loading state using a spinner or "Loading..." text
- [ ] Has an empty state using `<app-empty-state>`
- [ ] Has an error state (banner or empty state variant)
- [ ] All status indicators use `<app-status-chip>`
- [ ] Primary button is `bg-slate-900`, secondary is `bg-white border border-slate-200`
- [ ] Cards use `rounded-xl border border-slate-200 shadow-sm`
- [ ] List rows use `px-5 py-3 hover:bg-slate-50 transition-colors`
- [ ] Job numbers rendered in `font-mono font-bold text-xs`
- [ ] Tab rows have `overflow-x-auto whitespace-nowrap`
- [ ] All buttons have `hover:` and `transition-colors`
- [ ] Drawers use `max-w-lg`
