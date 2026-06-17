-- Subcontractors schema for BigQuery (NOT Cloud SQL MySQL)
-- Replace YOUR_GCP_PROJECT with your project id before running.
--
-- Run in BigQuery console or: bq query --use_legacy_sql=false < this-file.sql
--
-- Notes:
--   - BigQuery has no enforced foreign keys; project_id / subcontractor_id are logical FKs.
--   - Omit "NULL" after column types — nullable columns are optional by default.
--   - The Brighten Angular API (api/) still reads Cloud SQL MySQL today; this schema is
--     for BigQuery analytics / warehouse unless you add a BQ data layer to the app.

-- ---------------------------------------------------------------------------
-- 0. Dataset (skip if brighten_pm already exists)
-- ---------------------------------------------------------------------------
-- CREATE SCHEMA IF NOT EXISTS `YOUR_GCP_PROJECT.brighten_pm`
-- OPTIONS (location = 'US');

-- ---------------------------------------------------------------------------
-- 1. Master vendor directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.brighten_pm.subcontractors` (
  id STRING NOT NULL,
  owner_id STRING NOT NULL,
  company_name STRING NOT NULL,
  normalized_name STRING,
  trade STRING,
  contact_name STRING,
  phone STRING,
  email STRING,
  address STRING,
  w9_status STRING NOT NULL,
  insurance_status STRING NOT NULL,
  coi_expiration_date DATE,
  status STRING NOT NULL,
  vendor_classification STRING,
  source STRING,
  seeded_total_cost NUMERIC,
  notes STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY normalized_name, company_name;

-- ---------------------------------------------------------------------------
-- 2. Job ↔ sub assignment (attach subs to projects here)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.brighten_pm.project_subcontractors` (
  id STRING NOT NULL,
  owner_id STRING NOT NULL,
  project_id STRING NOT NULL,
  subcontractor_id STRING NOT NULL,
  job_number STRING,
  project_name STRING,
  subcontractor_name STRING NOT NULL,
  trade STRING,
  scope_of_work STRING,
  cost_code STRING,
  budget_line_id STRING,
  linked_purchase_order_id STRING,
  original_commitment_amount NUMERIC,
  approved_change_order_amount NUMERIC,
  current_commitment_amount NUMERIC,
  invoiced_to_date NUMERIC,
  paid_to_date NUMERIC,
  open_balance NUMERIC,
  remaining_commitment NUMERIC,
  retainage_held NUMERIC,
  start_date DATE,
  finish_date DATE,
  status STRING NOT NULL,
  compliance_status STRING NOT NULL,
  performance_status STRING NOT NULL,
  compliance_override_note STRING,
  import_source STRING,
  imported_cost_to_date NUMERIC,
  notes STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY project_id, subcontractor_id;

-- ---------------------------------------------------------------------------
-- 3. Compliance document metadata (files live in Google Drive)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.brighten_pm.subcontractor_documents` (
  id STRING NOT NULL,
  owner_id STRING NOT NULL,
  subcontractor_id STRING NOT NULL,
  project_subcontractor_id STRING,
  project_id STRING,
  document_type STRING NOT NULL,
  drive_file_id STRING,
  drive_folder_id STRING,
  effective_date DATE,
  expiration_date DATE,
  status STRING NOT NULL,
  notes STRING,
  uploaded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY subcontractor_id, project_id;

-- ---------------------------------------------------------------------------
-- 4. Subcontractor invoices (per job assignment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `YOUR_GCP_PROJECT.brighten_pm.subcontractor_invoices` (
  id STRING NOT NULL,
  owner_id STRING NOT NULL,
  project_id STRING NOT NULL,
  subcontractor_id STRING NOT NULL,
  project_subcontractor_id STRING NOT NULL,
  job_number STRING,
  project_name STRING,
  subcontractor_name STRING NOT NULL,
  invoice_number STRING NOT NULL,
  invoice_date DATE,
  due_date DATE,
  description STRING,
  amount NUMERIC NOT NULL,
  approved_amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL,
  open_balance NUMERIC NOT NULL,
  retainage_percent NUMERIC,
  retainage_amount NUMERIC,
  net_due NUMERIC,
  status STRING NOT NULL,
  payment_date DATE,
  check_number STRING,
  lien_waiver_status STRING NOT NULL,
  notes STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY project_id, project_subcontractor_id;

-- ---------------------------------------------------------------------------
-- 5. Convenience view — subs on a job with master compliance fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `YOUR_GCP_PROJECT.brighten_pm.v_project_subcontractors` AS
SELECT
  ps.*,
  p.job_number AS project_job_number,
  p.project_name AS project_display_name,
  s.company_name AS master_company_name,
  s.w9_status,
  s.insurance_status,
  s.coi_expiration_date
FROM `YOUR_GCP_PROJECT.brighten_pm.project_subcontractors` AS ps
LEFT JOIN `YOUR_GCP_PROJECT.brighten_pm.projects` AS p
  ON p.id = ps.project_id
LEFT JOIN `YOUR_GCP_PROJECT.brighten_pm.subcontractors` AS s
  ON s.id = ps.subcontractor_id;

-- ---------------------------------------------------------------------------
-- Example: attach a sub to a job (run after tables + projects exist)
-- ---------------------------------------------------------------------------
-- Step A — upsert vendor
-- INSERT INTO `YOUR_GCP_PROJECT.brighten_pm.subcontractors` (
--   id, owner_id, company_name, normalized_name, trade,
--   w9_status, insurance_status, status, created_at, updated_at
-- ) VALUES (
--   'sub_abc_electric', 'YOUR_UID', 'ABC Electric LLC', 'abc electric', 'Electrical',
--   'Missing', 'Missing', 'Approved', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
-- );
--
-- Step B — link to job (project_id must match brighten_pm.projects.id)
-- INSERT INTO `YOUR_GCP_PROJECT.brighten_pm.project_subcontractors` (
--   id, owner_id, project_id, subcontractor_id,
--   job_number, project_name, subcontractor_name, trade,
--   status, compliance_status, performance_status,
--   created_at, updated_at
-- )
-- SELECT
--   'ps_j208_abc',
--   'YOUR_UID',
--   p.id,
--   'sub_abc_electric',
--   p.job_number,
--   p.project_name,
--   'ABC Electric LLC',
--   'Electrical',
--   'Planned',
--   'MissingItems',
--   'Good',
--   CURRENT_TIMESTAMP(),
--   CURRENT_TIMESTAMP()
-- FROM `YOUR_GCP_PROJECT.brighten_pm.projects` AS p
-- WHERE p.job_number IN ('J208', '208')
-- LIMIT 1;
--
-- Step C — prevent duplicate assignment (BigQuery has no UNIQUE constraint)
-- SELECT COUNT(*) AS existing
-- FROM `YOUR_GCP_PROJECT.brighten_pm.project_subcontractors`
-- WHERE project_id = 'PROJECT_ID' AND subcontractor_id = 'sub_abc_electric';
