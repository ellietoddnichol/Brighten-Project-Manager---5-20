# Project Setup Audit

Last reviewed: 2026-06-02

## Current Shape

This is an Angular 21 app with Firebase-related configuration, Docker/nginx deployment files, import scripts, and app seed data. The main source code is organized by broad type:

- `src/app/pages` for route-level screens.
- `src/app/components` for shared and feature UI.
- `src/app/services` for persistence, sync, imports, and workflow actions.
- `src/app/utils` for domain calculations.
- `src/app/models` for shared TypeScript types.
- `src/app/config` for operational constants.
- `src/app/data/seeds` for generated or maintained seed data.
- `src/app/data/imports` for source files consumed by import scripts.

## Setup Findings

- The README was still the generated AI Studio starter text. It now describes the Brighten app, local setup, common commands, and the active folder conventions.
- The repository root had business spreadsheets and PDFs mixed with app setup files. The job budget spreadsheets were duplicate copies of files already present in `src/app/data/imports/budgets`.
- Import scripts currently assume source files live under `src/app/data/imports`. Keep that stable until the scripts are deliberately updated together.
- `.env.example` includes required and optional environment values. Real `.env*` files remain ignored.
- Firebase service account key patterns are ignored. The root `gen-lang-client-*.json` file should remain local-only.

## Organization Conventions

- Keep app source in `src/app`.
- Keep operational scripts in `scripts`.
- Keep project notes and QA/deploy checklists in `docs`.
- Keep import source files in `src/app/data/imports` while the scripts depend on that path.
- Keep local-only reference PDFs/spreadsheets in `reference-files`; this folder is ignored by Git.
- Keep the repository root reserved for project configuration files only.

## Suggested Next Cleanup

- Consider moving import source files from `src/app/data/imports` to a top-level `imports/` folder in a future pass, then update all scripts in the same change.
- Consider splitting the large `src/app/services` folder by domain once feature ownership settles.
- Consider adding a lightweight script that validates expected import files are present before rebuilding seeds.
- Review whether generated seed JSON should stay committed, be rebuilt in CI, or be managed through a controlled data release process.
