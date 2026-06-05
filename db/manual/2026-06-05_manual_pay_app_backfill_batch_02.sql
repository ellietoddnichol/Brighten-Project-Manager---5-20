-- Manual SQL record: pay app / billing backfill Batch 02
-- Date: 2026-06-05
-- Purpose: document the manual staging/import batch that backfilled additional
-- pay app headers and SOV lines for selected jobs.
--
-- This file is a record only.
-- Do not run this file as an app migration.
-- Do not apply schema changes from application code.
-- Do not add routes, UI, or financial write behavior from this record.
-- Do not import additional data from this record without separate approval.

USE brighten_pm;

-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- Jobs included in manual backfill Batch 02:
--   J197, J204, J206, J210, J216
--
-- Jobs intentionally held out:
--   J193 - needs final/current due confirmation.
--   J208 - existing partial header-only row needs source/SOV review.
--   J212 - contract mismatch needs confirmation.
--   J189 - blank/zero template; do not import unless user confirms valid billing.
--
-- Staging tables used for review/import:
--   brighten_pm.staging_pay_app_headers
--   brighten_pm.staging_sov_lines
--
-- Production tables populated manually:
--   brighten_pm.pay_apps
--   brighten_pm.sov_lines

-- ---------------------------------------------------------------------------
-- Business rules preserved
-- ---------------------------------------------------------------------------
-- - Do not overwrite project contract values.
-- - J197 project contract remains protected at $34,000. The imported pay app
--   contract is stored separately at $28,485.
-- - J206 SOV came from a scanned/rendered source and should remain
--   review-oriented / medium-confidence.
-- - J210 includes a negative deduct line.
-- - J216 is retainage/final style billing.
-- - Retainage percent values in staging_pay_app_headers are stored as whole
--   percentages, for example 10.00 for 10%.
-- - Business statuses remain meaningful. Do not mark rows Paid unless payment
--   receipt is confirmed.
-- - Batch 02 production import filtering used the explicit import batch /
--   approved import keys, not a generic billing_status = 'Ready' predicate.

-- ---------------------------------------------------------------------------
-- Batch 02 final verification totals
-- ---------------------------------------------------------------------------
-- Job   Pay app       SOV lines   Scheduled      This period    Completed/stored   Balance       Retainage
-- J197  PA005             5       $28,485.00     $6,000.00      $28,485.00         $0.00         $0.00
-- J204  PA005            11       $335,450.00    $121,447.25    $278,601.25        $56,848.75    $27,860.14
-- J206  PA004            16       $665,000.00    $115,273.25    $451,923.80        $213,076.20   $45,192.39
-- J210  PA001             2       $18,760.00     $14,070.00     $14,070.00         $4,690.00     $703.50
-- J216  PA002 Ret         2       $3,478.70      $0.00          $3,478.70          $0.00         $0.00

-- ---------------------------------------------------------------------------
-- Verification queries
-- ---------------------------------------------------------------------------
-- Confirm production counts for Batch 02 jobs:
SELECT
  p.job_number,
  COUNT(DISTINCT pa.id) AS pay_app_count,
  COUNT(sl.id) AS sov_line_count
FROM brighten_pm.projects p
LEFT JOIN brighten_pm.pay_apps pa
  ON pa.project_id = p.id
LEFT JOIN brighten_pm.sov_lines sl
  ON sl.pay_app_id = pa.id
WHERE p.job_number IN ('197', '204', '206', '210', '216')
GROUP BY p.job_number
ORDER BY CAST(p.job_number AS UNSIGNED);

-- Inspect Batch 02 pay app headers:
SELECT
  p.job_number,
  p.project_name,
  pa.id AS pay_app_id,
  pa.pay_app_number,
  pa.application_date,
  pa.contract_sum,
  pa.net_change_by_change_orders,
  pa.contract_sum_to_date,
  pa.total_completed_stored_to_date,
  pa.retainage_amount,
  pa.current_payment_due,
  pa.balance_to_finish,
  pa.status,
  pa.notes
FROM brighten_pm.pay_apps pa
JOIN brighten_pm.projects p
  ON p.id = pa.project_id
WHERE p.job_number IN ('197', '204', '206', '210', '216')
ORDER BY CAST(p.job_number AS UNSIGNED), pa.pay_app_number, pa.created_at;

-- Inspect Batch 02 SOV totals:
SELECT
  p.job_number,
  pa.pay_app_number,
  COUNT(sl.id) AS sov_line_count,
  SUM(sl.scheduled_value) AS scheduled_value_total,
  SUM(sl.work_completed_this_period) AS total_this_period,
  SUM(sl.total_completed_and_stored) AS total_completed_stored,
  SUM(sl.balance_to_finish) AS balance_to_finish,
  SUM(sl.retainage) AS retainage
FROM brighten_pm.pay_apps pa
JOIN brighten_pm.projects p
  ON p.id = pa.project_id
LEFT JOIN brighten_pm.sov_lines sl
  ON sl.pay_app_id = pa.id
WHERE p.job_number IN ('197', '204', '206', '210', '216')
GROUP BY p.job_number, pa.pay_app_number
ORDER BY CAST(p.job_number AS UNSIGNED), pa.pay_app_number;

-- Confirm held-out jobs were not imported by Batch 02:
SELECT
  p.job_number,
  COUNT(DISTINCT pa.id) AS pay_app_count,
  COUNT(sl.id) AS sov_line_count
FROM brighten_pm.projects p
LEFT JOIN brighten_pm.pay_apps pa
  ON pa.project_id = p.id
LEFT JOIN brighten_pm.sov_lines sl
  ON sl.pay_app_id = pa.id
WHERE p.job_number IN ('189', '193', '208', '212')
GROUP BY p.job_number
ORDER BY CAST(p.job_number AS UNSIGNED);

-- Compare staging rows to production rows by Batch 02 import batch:
SELECT
  h.job_number,
  h.pay_app_number,
  h.invoice_number,
  h.import_key,
  COUNT(DISTINCT l.import_key) AS staging_sov_line_count
FROM brighten_pm.staging_pay_app_headers h
LEFT JOIN brighten_pm.staging_sov_lines l
  ON l.header_import_key = h.import_key
  AND l.import_batch = h.import_batch
WHERE h.import_batch = '2026-06-05_batch_02'
GROUP BY h.job_number, h.pay_app_number, h.invoice_number, h.import_key
ORDER BY CAST(h.job_number AS UNSIGNED), h.pay_app_number;

-- ---------------------------------------------------------------------------
-- Rollback notes
-- ---------------------------------------------------------------------------
-- Do not use a blind DELETE for rollback.
-- If rollback is needed:
-- 1. First confirm exact Batch 02 rows by job_number, pay_app_number, source
--    notes, and import/staging history.
-- 2. Delete sov_lines joined to those exact pay_apps first.
-- 3. Delete the corresponding pay_apps only after SOV rows are confirmed.
-- 4. Re-run the verification queries above.
--
-- Rollback should be written as a reviewed, targeted script after confirming
-- exact production IDs. Do not infer rows from project number alone.
