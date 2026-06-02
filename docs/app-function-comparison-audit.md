# App Function Comparison Audit

Last reviewed: 2026-06-02

## Executive Summary

Brighten Project Manager is strongest as an internal construction operations and financial control app. Compared with broad commercial platforms, it is less mature in mobile field execution, drawing/spec control, external stakeholder portals, approvals, and marketplace integrations. Its best differentiator is the way it focuses Brighten's real operating data into source-health, WIP, AR, margin, setup, certified payroll, subcontractor, and import-review workflows.

## Current App Function Set

### Portfolio And Project Control

- Home command center for source sync, priorities, and active 2026 job controls.
- Active 2026 Control view for job-level risk, billing, labor, subcontractor/compliance, setup, and document status.
- Project hub and project detail routes.
- Lifecycle and setup signals for active, closeout, archive, missing setup, and source exceptions.

### Financial Operations

- Financials hub covering WIP, AR, billing, purchase orders, and job margin.
- WIP page with over/under billing, projected margin, closeout AR, assumptions, and CSV export.
- AR page with aging, receivable follow-up, notes, QuickBooks refresh, and CSV export.
- Billing/pay-app flows, SOV imports, draft pay apps, and change-order-to-pay-app workflows.
- Purchase order tracking and imported subcontractor cost visibility.
- Budget workbook snapshots and manual budget-line editing.

### Field And Project Controls

- Change requests and change orders, including document generation and billing handoff.
- RFIs, submittals, daily logs, and field issues.
- Field issues can convert into RFIs, change requests, daily logs, or tasks.
- Automated side effects create tasks for overdue/missing RFIs, submittals, and daily logs.

### Documents And Drive

- Document hub for required documents, generated documents, uploads, and Drive links.
- Upload flow saves metadata in Firestore while files remain in Google Drive.
- Drive folder mapping and folder discovery tools.
- Workflow document sections for change requests, change orders, daily logs, submittals, and billing records.

### Labor, Payroll, And Compliance

- Master Time Sheet sync.
- Labor actuals, labor-code mapping, labor calculations, and setup review.
- Certified payroll draft generation, validation, weekly exports, and export sheet connection.
- Foreman bonus reporting and export.

### Subcontractors And Directory

- Directory hub and subcontractor management.
- Subcontractor imports from QuickBooks/Drive seeds.
- Project subcontractor links, compliance documents, invoices, lien-waiver status, and invoice-driven tasks.

### Settings, Imports, And Source Trust

- Settings hub for sync health, setup completeness, source review, labor codes, Drive folders, QuickBooks sync, and advanced imports.
- QuickBooks workbook sync for billing, AR, vendor balances, bill payments, and project cost detail.
- Master Sheet, PO Sheet, Master Time Sheet, and legacy QBO/project-cost imports.
- Import review center for unmatched projects/vendors, conflicts, missing tabs, warnings, and run logs.

## Comparison To Similar Platforms

### Procore

Procore is broader and more field-first. It emphasizes mobile/offline field work, photos, daily reports, RFI/submittal automation, real-time cost data, document/drawing control, integrated scheduling, and hundreds of integrations.

Brighten overlaps on RFIs, submittals, daily logs, change orders, documents, tasks, directories, financials, and accounting data. Brighten is narrower but more tailored to Brighten's actual workflows, especially WIP, AR, setup health, source exceptions, certified payroll, and job-specific import reconciliation.

Key gap versus Procore: offline/mobile field capture, drawing/spec revision control, formal schedule tools, meeting minutes, photos/video workflows, punch lists, permissions by stakeholder, and external collaboration.

### Buildertrend

Buildertrend is more residential/customer-facing. Its public feature set spans sales, proposals, estimates, bids, schedule, selections, daily logs, submittals, tasks, customer/sub portals, file storage, budget, bills/POs, invoices, payments, and warranties.

Brighten overlaps on project details, changes, daily logs, submittals, tasks, documents, budget, POs, billing, and subcontractors. Brighten appears stronger for commercial/accounting-style controls: WIP, AR aging, certified payroll, project-cost imports, and operational setup review.

Key gap versus Buildertrend: CRM/leads, proposals/estimates/takeoff, selections, customer portal, sub portal, payments, warranties, and polished external communication.

### Autodesk Construction Cloud

Autodesk is strongest around common data environment, document/drawing/model workflows, construction administration, RFIs/submittals, cost management, integrations, and large-project collaboration.

Brighten overlaps on RFIs, submittals, documents, source data, and cost visibility. It does not appear to compete with Autodesk's BIM/drawing/model/document-revision depth. Brighten's advantage is that it encodes Brighten's specific accounting and setup rules instead of trying to be a general construction cloud.

Key gap versus Autodesk: drawing sheet lifecycle, model/design coordination, spec management, project-wide document control discipline, enterprise integration ecosystem, and owner/GC/sub collaboration at scale.

### QuickBooks-Connected Construction Cost Tools

Construction cost platforms built around QuickBooks often focus on job-cost sync, vendors/AP, commitments, invoices, project/customer mapping, progress billing, two-way updates, logs, exceptions, and scheduled syncs.

Brighten already mirrors several of these ideas: project/customer matching, QuickBooks workbook sync, AR aging, project cost detail, vendor/subcontractor discovery, billing imports, exceptions, and source-health status. The biggest difference is that Brighten currently appears workbook/report-driven rather than a direct QuickBooks API connector with controlled two-way posting.

Key gap versus dedicated QuickBooks integrations: authorization flow, direct one-way/two-way sync choices, scheduled sync management, pushing approved invoices/bills back to QuickBooks, mapping admin for Items/Classes/Customers, and audit-grade sync history.

## Strengths

- The app is tuned to the company's real operating model instead of generic construction software categories.
- Financial visibility is unusually central: WIP, AR, billing, job margin, imported costs, forecast values, and sync health all point to decision-making.
- Import review is a serious advantage; many tools hide data-quality problems, while this app surfaces them as work.
- Settings/source health is unusually practical for a business running from spreadsheets, QuickBooks exports, and Drive.
- Certified payroll and foreman bonus workflows are valuable internal specializations that broad tools often treat as add-ons or integrations.

## Risks And Gaps

- Many features are dashboards or internal admin workflows, while commercial platforms complete external workflows with approvals, portals, signatures, and notifications.
- Field workflows need a stronger mobile/offline story before they can replace jobsite tools.
- Document management is metadata/Drive-oriented, not a full document-control system with revisions, transmittals, drawings, specs, markups, and distribution logs.
- QuickBooks sync appears import/report-driven. That is useful, but it will not match a direct accounting connector until posting, mapping, audit logs, and conflict resolution are formalized.
- The central data service owns many collections and responsibilities. It works as a backbone, but future growth would benefit from domain data facades so financials, field controls, documents, labor, and subs can evolve independently.
- Some screens appear to have duplicate legacy/new routes or tabs, which can make the product feel larger than it is and harder to navigate.

## Recommended Priorities

1. Define the app's lane: "Brighten internal financial and operations control center" rather than trying to become a full Procore replacement.
2. Finish the source-health/import-review loop: every import warning should have an owner, action, resolution state, and history.
3. Make QuickBooks sync more explicit: document what is imported, what is manual, what is authoritative, and what never writes back.
4. Consolidate navigation around hubs: Home, Active Control, Financials, Projects, Field, Documents, Directory/Subs, Labor/Payroll, Settings.
5. Add workflow completion states: approvals, submitted/exported/posted flags, required-document completion, and billing handoff status.
6. Improve field capture only where Brighten will actually use it: daily log photos, RFI answers, field issue conversion, and mobile-friendly forms.
7. Treat external portals, drawing/spec control, CRM, estimates/takeoff, warranties, and payment processing as integrations or future scope, not core build-now priorities.

## Best-Fit Positioning

Brighten Project Manager should be positioned as an internal control layer that sits above QuickBooks, Google Sheets, Drive, and job documents. It should make the office faster and more confident by answering:

- Which jobs need action today?
- Which source data can we trust?
- Where are margin, billing, AR, and setup risks?
- What documents, subcontractor items, payroll items, and change workflows are blocking progress?
- What should be reviewed before a PM, bookkeeper, or owner makes a decision?

That is a valuable lane, and it is more realistic than trying to match the full breadth of Procore, Buildertrend, or Autodesk.
