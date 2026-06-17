# Held-Out Billing Jobs — Decision Record

**Status:** Awaiting explicit user approval before SQL import.  
**Related:** `docs/sql-api-integration.md` (Manual Pay App Backfill Batch 02)

Do **not** import these jobs into `pay_apps` / `sov_lines` until each row below is signed off.

---

## J193 — PA006 April 2026

| Field | Value |
|-------|-------|
| Production SQL rows | None yet |
| Source file | `J193 - PA006 APRIL 2026 (1).xlsx` |
| Pay app | 06 — 14 SOV lines |
| Scheduled / completed | $77,491.00 |
| Current due | $1,157.00 |
| Retainage | $57.85 |
| Confidence | `NeedsReview` |
| Context | Invoice packet shows paid-in-full |

**Decision required:** Confirm import as final/current paid billing, or hold for manual review.

- [ ] **Approve import** — write to staging then production tables  
- [ ] **Hold** — do not import  
- [ ] **Other:** _______________________________

---

## J208 — PA002 (partial header only)

| Field | Value |
|-------|-------|
| Production SQL | Header `PA002` exists: $5,586.47 current due, $17,355.50 completed/stored, $867.78 retainage, $343,732.28 balance |
| SOV lines in SQL | **0** |
| Source expectation | 27-line SOV from source document |

**Decision required:** Do not create duplicate header. Confirm source document / SOV before backfill.

- [ ] **Approve SOV backfill** — attach lines to existing `PA002` header  
- [ ] **Replace header** — delete partial and re-import from source  
- [ ] **Hold** — do not import  
- [ ] **Other:** _______________________________

---

## J212 — LPS Lewis Clark Restroom

| Field | Value |
|-------|-------|
| Production SQL rows | None yet |
| Source file | `J212 - LPS Lewis Clark Restroom - 001 April.xlsx` |
| Pay app | `J212-001` — 7 SOV lines |
| Pay app contract | $79,250.00 |
| Protected / project contract | $91,775.00 |
| Current due | $2,375.00 |
| Retainage | $125.00 |

**Decision required:** Confirm contract mismatch handling (`$79,250` vs `$91,775`). Do not import May `J212-PA002-May` without source support.

- [ ] **Approve import at pay-app contract** ($79,250)  
- [ ] **Approve import at project contract** ($91,775) — document variance  
- [ ] **Hold** — do not import  
- [ ] **Other:** _______________________________

---

## J189 — Blank / zero template

| Field | Value |
|-------|-------|
| Production SQL rows | None |
| Source | Blank/zero pay app template |

**Decision required:** Explicit confirmation before any import.

- [ ] **Approve import** (describe source/version): _______________________________  
- [ ] **Hold** — do not import (recommended until real pay app exists)

---

## Sign-off

| Job | Decision | Date | Approved by |
|-----|----------|------|-------------|
| J193 | | | |
| J208 | | | |
| J212 | | | |
| J189 | | | |

After approval, record imports in `db/manual/` with dated SQL batch files (same pattern as `2026-06-05_manual_pay_app_backfill_batch_02.sql`).
