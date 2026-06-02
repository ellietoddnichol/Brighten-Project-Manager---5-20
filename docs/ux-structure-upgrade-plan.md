# UX And Structure Upgrade Plan

Last updated: 2026-06-02

## Goal

Make Brighten Project Manager feel like one focused operating system instead of a collection of dashboards and imports. The product lane is:

Brighten's internal command center for job health, money, source trust, documents, labor, payroll, subcontractors, and action follow-up.

## Phase 1: Navigation And Information Architecture

Status: started.

The first upgrade is to organize the shell around work areas:

- Command: Home.
- Operations: Jobs.
- Money: WIP, AR, billing, purchase orders, budget, job margin.
- Field: tasks, changes, RFIs, submittals, daily logs, field issues, documents.
- People: directory, subcontractors, labor, payroll, foreman bonuses.
- Admin: settings, sync health, source review, setup, imports.

Implementation started with the grouped sidebar. The next step is to make hub pages mirror these buckets so the sidebar, page titles, and task queues all speak the same language.

## Phase 2: Standard Page Experience

Create one standard pattern for operational pages:

- Header with title, short subtitle, primary action, and secondary actions.
- Four key stat cards maximum.
- Segment/filter row.
- Action queue or table/list.
- Detail drawer for review and quick edits.
- Export and source-health affordances where relevant.

Apply this first to Home, Jobs, Money, Field, Documents, People & Subs, Payroll, and Settings.

## Phase 3: Action Queue Model

Every warning should become an action item with:

- Owner or responsible role.
- Source record.
- Severity.
- Next action.
- Due or follow-up date.
- Status.
- Resolution history.

Initial queues should cover AR follow-up, missing setup, import conflicts, approved-unbilled change orders, missing documents, payroll exceptions, and subcontractor compliance gaps.

## Phase 4: Frontend Feature Structure

Move from broad technical folders to feature folders once navigation is stable:

```text
src/app/
  core/
  shared/
  features/
    home/
    jobs/
    money/
    field/
    documents/
    people/
    payroll/
    settings/
```

Each feature should own its pages, feature components, data facades, models, and helpers. Shared UI belongs in `shared/ui`.

## Phase 5: Data Layer Structure

Split the central data service into repositories and domain services:

```text
UI page
  -> feature facade/service
  -> domain repository
  -> Firestore/import/source adapter
```

Suggested repositories:

- ProjectRepository
- BillingRepository
- ArRepository
- BudgetRepository
- PurchaseOrderRepository
- FieldControlsRepository
- DocumentRepository
- SubcontractorRepository
- LaborPayrollRepository

Keep the current `DataService` as a compatibility layer during migration so the app can evolve gradually.

## Phase 6: Source Authority And Trust

For financial and operational fields, show source trust clearly:

- QuickBooks
- Google Sheet
- Drive
- Imported workbook
- Manual override
- Derived calculation

Each important value should answer: where did this come from, when was it updated, can it be edited, and what happens if sources disagree?

## Phase 7: Interface Polish

Prioritize operational clarity:

- Dense, scannable rows over large decorative cards.
- Consistent status chips.
- Consistent tables and filters.
- Detail drawers for review workflows.
- Mobile-friendly field forms where actual field capture matters.
- Better empty states with concrete next actions.

## First Build Priorities

1. Finish grouped navigation and hub alignment.
2. Redesign Home as the daily command queue.
3. Redesign Money hub around WIP, AR, billing, and source trust.
4. Turn Import Review into a true review queue.
5. Split data access behind the Money and Field features first.
