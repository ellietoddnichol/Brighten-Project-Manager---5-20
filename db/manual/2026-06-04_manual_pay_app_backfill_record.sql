-- Manual SQL record: pay app staging/import backfill
-- Date: 2026-06-04
-- Purpose: document the manual staging/import batch that backfilled initial
-- pay app headers and SOV lines for selected jobs.
--
-- This file is a record only.
-- Do not run this file as an app migration.
-- Do not apply schema changes from application code.
-- Do not add routes, UI, or financial write behavior from this record.

USE brighten_pm;

-- ---------------------------------------------------------------------------
-- Scope
-- ---------------------------------------------------------------------------
-- Jobs included in the manual backfill:
--   J158, J186, J209, J215, J218, J219, J221, J222, J223
--
-- Production tables populated manually:
--   brighten_pm.pay_apps
--   brighten_pm.sov_lines
--
-- Staging tables used for review/import:
--   brighten_pm.staging_pay_app_headers
--   brighten_pm.staging_sov_lines

-- ---------------------------------------------------------------------------
-- Staging table record
-- ---------------------------------------------------------------------------
-- staging_pay_app_headers key columns:
--   import_key, import_batch, job_number, project_name, billing_record_type,
--   pay_app_number, invoice_number, source_file_name, source_type, billing_type,
--   period_start, period_end, application_date, original_contract,
--   net_change_by_co, contract_sum_to_date, completed_stored_to_date,
--   retainage_percent, retainage_to_date, earned_less_retainage,
--   previous_certificates, current_due, balance_to_finish_incl_retainage,
--   billing_status, review_flags, notes, source_drive_url, created_at, updated_at
--
-- staging_sov_lines key columns:
--   import_key, header_import_key, import_batch, job_number, pay_app_number,
--   invoice_number, line_number, cost_code, description, scheduled_value,
--   previous_completed, this_period, stored_materials, total_completed_stored,
--   percent_complete, balance_to_finish, retainage, line_type, confidence,
--   source_file_name, notes, created_at, updated_at

-- ---------------------------------------------------------------------------
-- Production insert rules used for this manual batch
-- ---------------------------------------------------------------------------
-- 1. Resolve each staging header to brighten_pm.projects.id by exact job_number.
-- 2. Insert one production pay_apps row per reviewed staging header.
-- 3. Preserve source pay app / invoice identity in pay_app_number and notes when
--    source documents use invoice-oriented naming.
-- 4. Map header amount fields conservatively:
--      original_contract                  -> pay_apps.contract_sum
--      net_change_by_co                   -> pay_apps.net_change_by_change_orders
--      contract_sum_to_date               -> pay_apps.contract_sum_to_date
--      completed_stored_to_date           -> pay_apps.total_completed_stored_to_date
--      retainage_to_date                  -> pay_apps.retainage_amount
--      earned_less_retainage              -> pay_apps.total_earned_less_retainage
--      previous_certificates              -> pay_apps.previous_certificates
--      current_due                        -> pay_apps.current_payment_due
--      balance_to_finish_incl_retainage   -> pay_apps.balance_to_finish
-- 5. Insert production sov_lines only after the related production pay_apps row
--    exists.
-- 6. Map line amount fields conservatively:
--      scheduled_value           -> sov_lines.scheduled_value
--      previous_completed        -> sov_lines.work_completed_previous
--      this_period               -> sov_lines.work_completed_this_period
--      stored_materials          -> sov_lines.materials_presently_stored
--      total_completed_stored    -> sov_lines.total_completed_and_stored
--      percent_complete          -> sov_lines.percent_complete
--      balance_to_finish         -> sov_lines.balance_to_finish
--      retainage                 -> sov_lines.retainage
-- 7. Keep ambiguous values nullable. Do not convert missing amounts to 0.
-- 8. Keep questionable rows in Review status / notes rather than treating them
--    as final billing truth.
-- 9. This backfill is read-only preparation for later API work. It does not
--    approve financial writes or replace existing Budget/Billing tab behavior.

-- ---------------------------------------------------------------------------
-- Imported job counts observed after manual backfill
-- ---------------------------------------------------------------------------
-- Job   Pay app rows   SOV line rows   Application date note
-- J158       1               1         Not available in source/staging
-- J186       1              16         2026-03-30
-- J209       1               4         Not available in source/staging
-- J215       1               1         Not available in source/staging
-- J218       1               1         2026-05-15
-- J219       1               3         2026-05-19
-- J221       1               1         2026-05-20
-- J222       1               1         Not available in source/staging
-- J223       1               1         Not available in source/staging

-- ---------------------------------------------------------------------------
-- Review notes
-- ---------------------------------------------------------------------------
-- - This was a manual backfill to seed initial pay app header/SOV visibility in
--   SQL for known jobs.
-- - Some source records were invoice-style or summary-only; where a full pay app
--   structure was not available, the row should remain review-oriented.
-- - Null dates/amounts are intentional when source data was missing.
-- - Do not infer retainage, percent complete, or balance values from missing
--   source fields.
-- - Do not use this record as permission to enable pay app editing or billing
--   writes in the app.
-- - Future read APIs should surface review status/warnings rather than making
--   these rows look more complete than they are.

-- ---------------------------------------------------------------------------
-- Verification queries
-- ---------------------------------------------------------------------------
-- Confirm production counts for the imported jobs:
SELECT
  p.job_number,
  COUNT(DISTINCT pa.id) AS pay_app_count,
  COUNT(sl.id) AS sov_line_count,
  MIN(pa.application_date) AS first_application_date,
  MAX(pa.application_date) AS last_application_date
FROM brighten_pm.projects p
LEFT JOIN brighten_pm.pay_apps pa
  ON pa.project_id = p.id
LEFT JOIN brighten_pm.sov_lines sl
  ON sl.pay_app_id = pa.id
WHERE p.job_number IN ('158', '186', '209', '215', '218', '219', '221', '222', '223')
GROUP BY p.job_number
ORDER BY CAST(p.job_number AS UNSIGNED);

-- Inspect pay app headers for the imported jobs:
SELECT
  p.job_number,
  p.project_name,
  pa.id AS pay_app_id,
  pa.pay_app_number,
  pa.application_date,
  pa.contract_sum,
  pa.contract_sum_to_date,
  pa.total_completed_stored_to_date,
  pa.retainage_amount,
  pa.current_payment_due,
  pa.status,
  pa.notes
FROM brighten_pm.pay_apps pa
JOIN brighten_pm.projects p
  ON p.id = pa.project_id
WHERE p.job_number IN ('158', '186', '209', '215', '218', '219', '221', '222', '223')
ORDER BY CAST(p.job_number AS UNSIGNED), pa.pay_app_number, pa.created_at;

-- Inspect SOV line totals for the imported jobs:
SELECT
  p.job_number,
  pa.pay_app_number,
  COUNT(sl.id) AS sov_line_count,
  SUM(sl.scheduled_value) AS scheduled_value_total,
  SUM(sl.total_completed_and_stored) AS completed_stored_total,
  SUM(sl.retainage) AS retainage_total
FROM brighten_pm.pay_apps pa
JOIN brighten_pm.projects p
  ON p.id = pa.project_id
LEFT JOIN brighten_pm.sov_lines sl
  ON sl.pay_app_id = pa.id
WHERE p.job_number IN ('158', '186', '209', '215', '218', '219', '221', '222', '223')
GROUP BY p.job_number, pa.pay_app_number
ORDER BY CAST(p.job_number AS UNSIGNED), pa.pay_app_number;

-- Compare staging rows to production rows by job:
SELECT
  h.job_number,
  COUNT(DISTINCT h.import_key) AS staging_header_count,
  COUNT(DISTINCT l.import_key) AS staging_sov_line_count
FROM brighten_pm.staging_pay_app_headers h
LEFT JOIN brighten_pm.staging_sov_lines l
  ON l.header_import_key = h.import_key
WHERE h.job_number IN ('158', '186', '209', '215', '218', '219', '221', '222', '223')
GROUP BY h.job_number
ORDER BY CAST(h.job_number AS UNSIGNED);
