# Brighten Project Manager

Angular web app for Brighten project operations: project financials, WIP, billing, labor, subcontractors, tasks, documents, and settings/import tools.

## Local setup (Angular only)

**Prerequisite:** Node.js.

1. `npm install`
2. Copy `.env.example` → `.env.local` for Google/Firebase workspace keys (not database credentials).
3. `npm run dev`
4. Open `http://localhost:3000`

## Cloud SQL API (read-only integration)

The app is gradually moving project data to **Google Cloud SQL (MySQL)** via a small **Node API** in `/api`. The browser never receives DB passwords.

**Full workflow:** [docs/sql-api-integration.md](docs/sql-api-integration.md)

### Inspect first / test API before Angular

1. **Do not commit** until `/api/health` and `/api/projects` work against your real database.
2. Create **`api/.env.local`** locally only (never commit). Copy from `api/.env.example` and set:
   - `DB_HOST`, `DB_PORT`, `DB_NAME=brighten_pm`, `DB_USER`, `DB_PASSWORD`
   - `API_PORT=8080`
   - `CORS_ORIGIN=http://localhost:3000` (must match Angular dev port)
3. Run **only the API** first:

   ```powershell
   cd api
   npm install
   npm run dev
   ```

4. Test before starting Angular:

   ```powershell
   Invoke-RestMethod http://localhost:8080/api/health
   Invoke-RestMethod http://localhost:8080/api/projects
   ```

5. When those pass, from repo root: `npm run dev`, open `/projects`.
   - API mode: `localStorage brighten.useApiBackend` = `true` (default in code)
   - Success: list loads from `/api/projects` (~28 rows)
   - Fallback: amber “Using Firestore fallback” if API is down

From repo root you can also run `npm run dev:api` (same as `npm run dev` inside `api/`).

**Wired today:** Projects list only. Firebase, seeds, and other pages are unchanged.

**Commit message** (only after live API tests pass):

```text
Add read-only Cloud SQL API and wire Projects list to /api/projects
```

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Angular dev server (port **3000**) |
| `npm run dev:api` | Cloud SQL read API (port **8080**) |
| `npm run build` | Production Angular build |
| `npm run test` | Unit tests |
| `npm run lint` | Lint |
| `npm run import:seeds` | Rebuild import seeds from `mock-data/imports` |

## Project layout

Feature-based structure under `src/app/`:

- `features/*/pages` — route screens (e.g. `features/projects/pages/projects.ts`)
- `components/` — shared UI
- `core/services/` — `DataService`, API client, sync/import infrastructure
- `models/` — TypeScript types
- `config/` — app constants + `api.config.ts`
- `mock-data/` — seeds and import source files (static assets)
- `api/` — read-only Express API for Cloud SQL
- `scripts/` — import/build tools
- `docs/` — setup, SQL API, deploy checklist

See `docs/project-setup-audit.md` and `docs/data-storage-map.md` for data architecture notes.

## Deployment

Firebase + Docker/nginx. Review `docs/deploy-readiness-checklist.md` before deploy. DB credentials belong on the API service (Cloud Run env / Secret Manager), not in the Angular build.
