# Manual SQL migrations (Cloud SQL MySQL)

Brighten uses **hand-reviewed DDL** in this folder — there is no automated migration runner.  
Target database: `brighten_pm` on Cloud SQL MySQL 8.

## Run order

| Script | Purpose |
|--------|---------|
| `2026-06-04_phase_1b_overview_completion.sql` | Overview fields on `projects` + `project_scope` |
| `2026-06-08_subcontractors_schema.sql` | Subcontractor tables + minimal view |
| `2026-06-08_subcontractors_legacy_align.sql` | Align pre-existing sub tables to app schema |

Pay-app backfill scripts (`2026-06-04_*`, `2026-06-05_*`) are one-off data fixes — run only when documented.

## Before every migration

1. Cloud SQL backup / snapshot  
2. `SELECT DATABASE();` — expect `brighten_pm`  
3. Re-run scripts are safe when they use `IF NOT EXISTS` / idempotent align blocks

## Subcontractors

- **New environment:** run `subcontractors_schema.sql` then `subcontractors_legacy_align.sql`  
- **Legacy tables already exist:** skip to `subcontractors_legacy_align.sql` only  
- **Verify:** `SELECT * FROM brighten_pm.v_project_subcontractors LIMIT 10;`

The Angular app still reads subcontractor **Firestore** collections until API routes are added.

## Archive

`archive/` holds reference DDL for other engines (e.g. BigQuery) — not used by the production API.
