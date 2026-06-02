# Brighten Project Manager

Angular web app for Brighten project operations, including project financials, WIP tracking, billing, purchase orders, certified payroll, subcontractors, tasks, documents, and settings/import review tools.

## Local Setup

**Prerequisite:** Node.js.

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the local values you need.
3. Start the app:
   `npm run dev`
4. Open the local app at:
   `http://localhost:3000`

## Common Commands

- `npm run dev` starts the local Angular dev server.
- `npm run build` creates a production build.
- `npm run lint` runs Angular/TypeScript linting.
- `npm run test` runs unit tests.
- `npm run import:seeds` rebuilds import-derived seed JSON from files in `src/app/data/imports`.
- `npm run import:budgets` rebuilds the legacy job-cost budget seed.
- `npm run import:project-costs` rebuilds the legacy project-cost seed.
- `npm run load:budgets` loads budget seed data to Firestore.

## Project Layout

- `src/app/pages` contains route-level screens.
- `src/app/components` contains reusable UI, layout, chart, and project panels.
- `src/app/services` contains data access, sync, import, save, and domain workflow services.
- `src/app/utils` contains calculation and transformation helpers.
- `src/app/models` contains shared TypeScript data shapes.
- `src/app/config` contains app configuration and operational constants.
- `src/app/data/seeds` contains app seed data used by import/review flows.
- `src/app/data/imports` contains source files used by import scripts.
- `scripts` contains one-off and repeatable data import/build tools.
- `docs` contains project notes, setup guidance, smoke tests, and deployment readiness.

See `docs/project-setup-audit.md` for the current setup audit, cleanup notes, and organization conventions.

## Import Files

Keep import source files under `src/app/data/imports` unless an import script is intentionally updated to use a new location. Do not leave working spreadsheets, PDFs, or downloaded reports in the repository root. Local-only reference files can go in `reference-files/`, which is ignored by Git.

## Deployment

This app includes Firebase configuration and a Docker/nginx runtime setup. Before deploys, review `docs/deploy-readiness-checklist.md` and confirm environment values are present outside source control.
