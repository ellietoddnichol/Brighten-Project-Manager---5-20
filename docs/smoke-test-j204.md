# J204 LightEdge — Smoke Test Log

**Project:** 204 – LightEdge Data Center  
**Tester:**  
**Date:**  
**Build:** production / development  
**Seed synced:** ☐ Yes ☐ No  

## Pre-flight

- [ ] Signed in with Google
- [ ] Settings → Sync seed data (upsert)
- [ ] J204 project exists in Projects list
- [ ] Google Drive folder ID saved on project (Setup → Integrations)
- [ ] Drive Mapping scan completed

**Record before test:**

| Field | Value |
| ----- | ----- |
| Original contract (`Setup → Contract Amount`) | $ |
| Rev contract (`Billing → Rev Contract` or overview stat) | $ |
| Existing approved COs (seed ADD-1-34 is Pending, not approved) | |

---

## Phase 1 — CR → CO → Billing → Drive

| Area | Test | Result | Notes / Fix Needed |
| ---- | ---- | ------ | ------------------ |
| Drive Mapping | Scan J204 folder | ☐ Pass ☐ Fail | Expect `CHANGE_REQUESTS` → Change Requests Pending; `CHANGE_ORDERS` → Contract & COs / Change Orders |
| CR | Create CR-001 | ☐ Pass ☐ Fail | Changes tab → New change request → Save → Submit for Pricing |
| CR Docs | Upload backup/photo | ☐ Pass ☐ Fail | Docs → Upload; folder = CHANGE_REQUESTS or fallback label shown |
| CO | Convert CR to CO-001 | ☐ Pass ☐ Fail | Convert → enter pricing → Convert to CO |
| CO Pricing | Add labor/material/sub/other pricing | ☐ Pass ☐ Fail | Verify sell price / total |
| CO Doc | Generate CO document | ☐ Pass ☐ Fail | Docs → Generate; folder = CHANGE_ORDERS |
| CO Status | Mark Sent | ☐ Pass ☐ Fail | |
| CO Approval | Mark Approved | ☐ Pass ☐ Fail | Task “Add approved CO to next pay app” should appear |
| Financials | Current contract updates correctly | ☐ Pass ☐ Fail | **Original contract must not change**; Rev = Original + approved COs |
| Billing | Approved unbilled CO appears | ☐ Pass ☐ Fail | Billing tab green panel |
| Pay App | Add CO to draft pay app | ☐ Pass ☐ Fail | Create Draft pay app first; then Add to draft pay app |
| Tasks | Billing/follow-up tasks update | ☐ Pass ☐ Fail | co-billing task completes; CO may show Billed when added to draft |
| Auth | No popup flood | ☐ Pass ☐ Fail | Only prompt on explicit upload/generate |

**Record after Phase 1:**

| Field | Before | After | Pass? |
| ----- | ------ | ----- | ----- |
| Original contract | | | ☐ |
| Rev contract | | | ☐ |
| CO-001 amount in rev contract | | | ☐ |
| Drive: CR file path | | | ☐ |
| Drive: CO file path | | | ☐ |

---

## Phase 2 — Field ops (after Phase 1 passes)

| Area | Test | Result | Notes |
| ---- | ---- | ------ | ----- |
| RFI | Create RFI-001 → generate doc → cost impact → Create CR | ☐ Pass ☐ Fail | Linked both ways |
| Submittal | SUB-001 → Submit → Approved + material release | ☐ Pass ☐ Fail | Release material task |
| Daily Log | Log + photos → potential change → Create CR | ☐ Pass ☐ Fail | Manual CR only |
| Field Issue | Convert to RFI | ☐ Pass ☐ Fail | |
| Field Issue | Convert to CR | ☐ Pass ☐ Fail | |

---

## Red flags (stop if any fail)

1. Original contract amount changes after CO approval  
2. Approved CO does not appear in Billing  
3. CO counted twice in current/revised contract  
4. Docs save to project root when mapped folders exist  
5. Repeated Drive auth popups without user action  
6. Linked records only one direction  

---

## Outcome

- [ ] **J204 PASS** — proceed to J158 comparison test, then Phase 3  
- [ ] **J204 FAIL** — fix failed path only (see files below)  

**Failed areas / tickets:**

---

## Code paths (if fixing)

- `ProjectDocumentSaveService` / `ProjectWorkflowSaveService` — Drive folder resolution  
- `ProjectControlsService` — CR/CO lifecycle, pay app link  
- `change-management.ts` — approved unbilled, status normalization  
- `financial.ts` — revised contract = original + approved COs  
- `billing-tab.ts` — approved unbilled panel, draft pay app  
- Drive Mapping tab — scan + folder keys  
