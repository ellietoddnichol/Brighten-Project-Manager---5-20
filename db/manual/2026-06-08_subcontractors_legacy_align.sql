-- Align legacy brighten_pm.subcontractors + project_subcontractors to app schema
-- Run AFTER 2026-06-08_subcontractors_schema.sql (tables + minimal view already exist)
-- Idempotent: safe to re-run. Uses information_schema + prepared statements (Cloud SQL UI friendly).
--
-- Backup Cloud SQL before running.

-- ============================================================================
-- Helper: add column only when missing
-- ============================================================================
-- Pattern repeated below — each block is independent.

-- ---------------------------------------------------------------------------
-- A. subcontractors — add canonical columns
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'owner_id') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN owner_id VARCHAR(128) NOT NULL DEFAULT '''' AFTER id',
  'SELECT ''owner_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'company_name') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN company_name VARCHAR(255) NULL AFTER owner_id',
  'SELECT ''company_name ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'normalized_name') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN normalized_name VARCHAR(255) NULL AFTER company_name',
  'SELECT ''normalized_name ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'trade') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN trade VARCHAR(100) NULL AFTER normalized_name',
  'SELECT ''trade ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'contact_name') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN contact_name VARCHAR(255) NULL AFTER trade',
  'SELECT ''contact_name ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'phone') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN phone VARCHAR(50) NULL AFTER contact_name',
  'SELECT ''phone ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'email') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN email VARCHAR(255) NULL AFTER phone',
  'SELECT ''email ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'address') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN address TEXT NULL AFTER email',
  'SELECT ''address ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'w9_status') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN w9_status VARCHAR(32) NOT NULL DEFAULT ''Missing'' AFTER address',
  'SELECT ''w9_status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'insurance_status') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN insurance_status VARCHAR(32) NOT NULL DEFAULT ''Missing'' AFTER w9_status',
  'SELECT ''insurance_status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'coi_expiration_date') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN coi_expiration_date DATE NULL AFTER insurance_status',
  'SELECT ''coi_expiration_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''PendingSetup'' AFTER coi_expiration_date',
  'SELECT ''status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'vendor_classification') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN vendor_classification VARCHAR(32) NULL AFTER status',
  'SELECT ''vendor_classification ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'source') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN source VARCHAR(32) NULL AFTER vendor_classification',
  'SELECT ''source ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'seeded_total_cost') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN seeded_total_cost DECIMAL(14,2) NULL AFTER source',
  'SELECT ''seeded_total_cost ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN notes TEXT NULL AFTER seeded_total_cost',
  'SELECT ''notes ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'created_at') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''created_at ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'updated_at') = 0,
  'ALTER TABLE brighten_pm.subcontractors ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''updated_at ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- B. subcontractors — backfill company_name from legacy name columns
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'company_name') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'name') > 0,
  'UPDATE brighten_pm.subcontractors SET company_name = COALESCE(company_name, name) WHERE company_name IS NULL AND name IS NOT NULL AND TRIM(name) <> ''''',
  'SELECT ''skip backfill name'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'company_name') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'vendor_name') > 0,
  'UPDATE brighten_pm.subcontractors SET company_name = COALESCE(company_name, vendor_name) WHERE company_name IS NULL AND vendor_name IS NOT NULL AND TRIM(vendor_name) <> ''''',
  'SELECT ''skip backfill vendor_name'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'company_name') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'display_name') > 0,
  'UPDATE brighten_pm.subcontractors SET company_name = COALESCE(company_name, display_name) WHERE company_name IS NULL AND display_name IS NOT NULL AND TRIM(display_name) <> ''''',
  'SELECT ''skip backfill display_name'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE brighten_pm.subcontractors
SET company_name = COALESCE(NULLIF(TRIM(company_name), ''), id)
WHERE company_name IS NULL OR TRIM(company_name) = '';

UPDATE brighten_pm.subcontractors
SET normalized_name = LOWER(TRIM(company_name))
WHERE (normalized_name IS NULL OR TRIM(normalized_name) = '')
  AND company_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C. project_subcontractors — add canonical columns
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'owner_id') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN owner_id VARCHAR(128) NOT NULL DEFAULT '''' AFTER id',
  'SELECT ''ps owner_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'project_id') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN project_id VARCHAR(64) NULL AFTER owner_id',
  'SELECT ''ps project_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_id') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'sub_id') > 0,
  'ALTER TABLE brighten_pm.project_subcontractors CHANGE COLUMN sub_id subcontractor_id VARCHAR(64) NOT NULL',
  'SELECT ''ps subcontractor_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_id') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'vendor_id') > 0,
  'ALTER TABLE brighten_pm.project_subcontractors CHANGE COLUMN vendor_id subcontractor_id VARCHAR(64) NOT NULL',
  'SELECT ''ps vendor_id rename skip'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_id') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN subcontractor_id VARCHAR(64) NULL AFTER project_id',
  'SELECT ''ps subcontractor_id add skip'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'job_number') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN job_number VARCHAR(32) NULL AFTER subcontractor_id',
  'SELECT ''ps job_number ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'project_name') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN project_name VARCHAR(255) NULL AFTER job_number',
  'SELECT ''ps project_name ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_name') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN subcontractor_name VARCHAR(255) NULL AFTER project_name',
  'SELECT ''ps subcontractor_name ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'trade') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN trade VARCHAR(100) NULL AFTER subcontractor_name',
  'SELECT ''ps trade ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'scope_of_work') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN scope_of_work TEXT NULL AFTER trade',
  'SELECT ''ps scope_of_work ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'cost_code') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN cost_code VARCHAR(64) NULL AFTER scope_of_work',
  'SELECT ''ps cost_code ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'budget_line_id') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN budget_line_id VARCHAR(64) NULL AFTER cost_code',
  'SELECT ''ps budget_line_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'linked_purchase_order_id') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN linked_purchase_order_id VARCHAR(64) NULL AFTER budget_line_id',
  'SELECT ''ps linked_purchase_order_id ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'original_commitment_amount') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN original_commitment_amount DECIMAL(14,2) DEFAULT 0 AFTER linked_purchase_order_id',
  'SELECT ''ps original_commitment_amount ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'approved_change_order_amount') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN approved_change_order_amount DECIMAL(14,2) DEFAULT 0 AFTER original_commitment_amount',
  'SELECT ''ps approved_change_order_amount ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'current_commitment_amount') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN current_commitment_amount DECIMAL(14,2) DEFAULT 0 AFTER approved_change_order_amount',
  'SELECT ''ps current_commitment_amount ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'invoiced_to_date') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN invoiced_to_date DECIMAL(14,2) DEFAULT 0 AFTER current_commitment_amount',
  'SELECT ''ps invoiced_to_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'paid_to_date') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN paid_to_date DECIMAL(14,2) DEFAULT 0 AFTER invoiced_to_date',
  'SELECT ''ps paid_to_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'open_balance') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN open_balance DECIMAL(14,2) DEFAULT 0 AFTER paid_to_date',
  'SELECT ''ps open_balance ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'remaining_commitment') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN remaining_commitment DECIMAL(14,2) DEFAULT 0 AFTER open_balance',
  'SELECT ''ps remaining_commitment ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'retainage_held') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN retainage_held DECIMAL(14,2) DEFAULT 0 AFTER remaining_commitment',
  'SELECT ''ps retainage_held ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'start_date') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN start_date DATE NULL AFTER retainage_held',
  'SELECT ''ps start_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'finish_date') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN finish_date DATE NULL AFTER start_date',
  'SELECT ''ps finish_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''Planned'' AFTER finish_date',
  'SELECT ''ps status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'compliance_status') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN compliance_status VARCHAR(32) NOT NULL DEFAULT ''MissingItems'' AFTER status',
  'SELECT ''ps compliance_status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'performance_status') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN performance_status VARCHAR(32) NOT NULL DEFAULT ''Good'' AFTER compliance_status',
  'SELECT ''ps performance_status ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'compliance_override_note') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN compliance_override_note TEXT NULL AFTER performance_status',
  'SELECT ''ps compliance_override_note ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'import_source') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN import_source VARCHAR(32) NULL AFTER compliance_override_note',
  'SELECT ''ps import_source ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'imported_cost_to_date') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN imported_cost_to_date DECIMAL(14,2) NULL AFTER import_source',
  'SELECT ''ps imported_cost_to_date ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN notes TEXT NULL AFTER imported_cost_to_date',
  'SELECT ''ps notes ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'created_at') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT ''ps created_at ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'updated_at') = 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT ''ps updated_at ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- D. project_subcontractors — backfill links + denormalized fields
-- ---------------------------------------------------------------------------

-- project_id from job_number when missing
UPDATE brighten_pm.project_subcontractors ps
JOIN brighten_pm.projects p
  ON p.job_number = ps.job_number
  OR p.job_number = CONCAT('J', ps.job_number)
  OR REPLACE(UPPER(p.job_number), 'J', '') = REPLACE(UPPER(ps.job_number), 'J', '')
SET ps.project_id = p.id
WHERE (ps.project_id IS NULL OR TRIM(ps.project_id) = '')
  AND ps.job_number IS NOT NULL
  AND TRIM(ps.job_number) <> '';

-- job_number + project_name from projects when missing
UPDATE brighten_pm.project_subcontractors ps
JOIN brighten_pm.projects p ON p.id = ps.project_id
SET ps.job_number = COALESCE(NULLIF(TRIM(ps.job_number), ''), p.job_number),
    ps.project_name = COALESCE(NULLIF(TRIM(ps.project_name), ''), p.project_name)
WHERE ps.project_id IS NOT NULL AND TRIM(ps.project_id) <> '';

-- subcontractor_name from master subcontractors
UPDATE brighten_pm.project_subcontractors ps
JOIN brighten_pm.subcontractors s ON s.id = ps.subcontractor_id
SET ps.subcontractor_name = COALESCE(NULLIF(TRIM(ps.subcontractor_name), ''), s.company_name)
WHERE (ps.subcontractor_name IS NULL OR TRIM(ps.subcontractor_name) = '')
  AND s.company_name IS NOT NULL;

-- legacy sub_name / vendor_name on junction row
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_name') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'sub_name') > 0,
  'UPDATE brighten_pm.project_subcontractors SET subcontractor_name = COALESCE(NULLIF(TRIM(subcontractor_name), ''''), sub_name) WHERE subcontractor_name IS NULL OR TRIM(subcontractor_name) = ''''',
  'SELECT ''skip ps sub_name backfill'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_name') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'vendor_name') > 0,
  'UPDATE brighten_pm.project_subcontractors SET subcontractor_name = COALESCE(NULLIF(TRIM(subcontractor_name), ''''), vendor_name) WHERE subcontractor_name IS NULL OR TRIM(subcontractor_name) = ''''',
  'SELECT ''skip ps vendor_name backfill'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE brighten_pm.project_subcontractors
SET subcontractor_name = COALESCE(NULLIF(TRIM(subcontractor_name), ''), subcontractor_id)
WHERE subcontractor_name IS NULL OR TRIM(subcontractor_name) = '';

-- ---------------------------------------------------------------------------
-- E. Indexes (add when missing)
-- ---------------------------------------------------------------------------
SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND INDEX_NAME = 'idx_sub_normalized') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'normalized_name') > 0,
  'ALTER TABLE brighten_pm.subcontractors ADD KEY idx_sub_normalized (normalized_name)',
  'SELECT ''idx_sub_normalized ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND INDEX_NAME = 'idx_sub_company') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'subcontractors' AND COLUMN_NAME = 'company_name') > 0,
  'ALTER TABLE brighten_pm.subcontractors ADD KEY idx_sub_company (company_name)',
  'SELECT ''idx_sub_company ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND INDEX_NAME = 'uq_project_sub') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'project_id') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = 'brighten_pm' AND TABLE_NAME = 'project_subcontractors' AND COLUMN_NAME = 'subcontractor_id') > 0,
  'ALTER TABLE brighten_pm.project_subcontractors ADD UNIQUE KEY uq_project_sub (project_id, subcontractor_id)',
  'SELECT ''uq_project_sub ok'' AS status'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- F. Views — app-ready
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW brighten_pm.v_project_subcontractors AS
SELECT
  ps.*,
  p.job_number   AS project_job_number,
  p.project_name AS project_display_name,
  s.company_name AS master_company_name,
  s.w9_status,
  s.insurance_status,
  s.coi_expiration_date
FROM brighten_pm.project_subcontractors ps
JOIN brighten_pm.projects p ON p.id = ps.project_id
JOIN brighten_pm.subcontractors s ON s.id = ps.subcontractor_id;

-- ---------------------------------------------------------------------------
-- G. Verification
-- ---------------------------------------------------------------------------
-- SELECT COUNT(*) AS subs FROM brighten_pm.subcontractors;
-- SELECT COUNT(*) AS links FROM brighten_pm.project_subcontractors;
-- SELECT * FROM brighten_pm.v_project_subcontractors LIMIT 10;
