# Phase 1 — Domain-Driven Structure

Phase 1 reorganizes the flat `pages/`, `services/`, and `utils/` folders into feature domains with path aliases.

## Layout

```
src/app/
├── core/services/          # Global: auth, data, drive, sync, import infrastructure
├── shared/utils/             # Cross-cutting pure logic (nav, CSV, sheets, lifecycle guards)
├── features/
│   ├── dashboard/pages/
│   ├── projects/pages|services|utils/
│   ├── financials/pages|services|utils/
│   ├── labor/pages|services|utils/
│   ├── subcontractors/pages|services|utils/
│   ├── documents/pages|utils/
│   ├── workflows/pages/      # Global RFIs, tasks, submittals, daily logs, field issues
│   └── settings/pages/
├── components/               # Shared UI (unchanged location)
├── models/                   # Shared types (unchanged)
└── config/                   # Build-time config (unchanged)
```

## Path aliases (`tsconfig.json`)

| Alias | Maps to |
|-------|---------|
| `@app/*` | `src/app/*` |
| `@core/*` | `src/app/core/*` |
| `@shared/*` | `src/app/shared/*` |
| `@features/*` | `src/app/features/*` |

**Import convention:** use aliases for cross-folder imports; use `./` only for same-directory siblings.

## Migration scripts

Run in order if re-applying on a fresh tree:

```bash
node scripts/phase1-ddd-restructure.mjs   # move files + first import pass
node scripts/phase1-fix-imports.mjs       # recursive ../services|utils → aliases
node scripts/phase1-fix-cross-imports.mjs # pages paths + cross-domain services/utils
node scripts/phase1-fix-sibling-imports.mjs # ./foo.service → correct @core/@features path
```

## Routes

`app.routes.ts` spreads per-feature `*.routes.ts` files under each domain (Phase 2). Each route still lazy-loads via `@features/.../pages/...`.

## Not moved (Phase 3+)

- `src/app/data/` — seed/import assets (evict in Phase 3)
- `components/` — shared UI shell; optional `shared/components/` later
- Hardcoded configs in `config/` — Firestore migration in Phase 5
