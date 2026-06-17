-- Subcontractors schema for Cloud SQL MySQL (brighten_pm)
-- See db/manual/README.md for run order.
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe to re-run.
--
-- Pre-check — see what already exists:
--   SELECT TABLE_NAME
--   FROM information_schema.TABLES
--   WHERE TABLE_SCHEMA = 'brighten_pm'
--     AND TABLE_NAME IN (
--       'subcontractors', 'project_subcontractors',
--       'subcontractor_documents', 'subcontractor_invoices'
--     )
--   ORDER BY TABLE_NAME;
--
-- Legacy tables may predate this script — inspect columns before relying on views:
--   SHOW COLUMNS FROM brighten_pm.subcontractors;
--   SHOW COLUMNS FROM brighten_pm.project_subcontractors;
--
-- Take a Cloud SQL backup/snapshot before running.

-- ---------------------------------------------------------------------------
-- 1. Master vendor directory
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brighten_pm.subcontractors (
  id                    VARCHAR(64)  NOT NULL,
  owner_id              VARCHAR(128) NOT NULL,
  company_name          VARCHAR(255) NOT NULL,
  normalized_name       VARCHAR(255) DEFAULT NULL,
  trade                 VARCHAR(100) DEFAULT NULL,
  contact_name          VARCHAR(255) DEFAULT NULL,
  phone                 VARCHAR(50)  DEFAULT NULL,
  email                 VARCHAR(255) DEFAULT NULL,
  address               TEXT         DEFAULT NULL,
  w9_status             VARCHAR(32)  NOT NULL DEFAULT 'Missing',
  insurance_status      VARCHAR(32)  NOT NULL DEFAULT 'Missing',
  coi_expiration_date   DATE         DEFAULT NULL,
  status                VARCHAR(32)  NOT NULL DEFAULT 'PendingSetup',
  vendor_classification VARCHAR(32)  DEFAULT NULL,
  source                VARCHAR(32)  DEFAULT NULL,
  seeded_total_cost     DECIMAL(14,2) DEFAULT NULL,
  notes                 TEXT         DEFAULT NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sub_owner (owner_id),
  KEY idx_sub_normalized (normalized_name),
  KEY idx_sub_company (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 2. Job ↔ sub assignment
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brighten_pm.project_subcontractors (
  id                           VARCHAR(64)  NOT NULL,
  owner_id                     VARCHAR(128) NOT NULL,
  project_id                   VARCHAR(64)  NOT NULL,
  subcontractor_id             VARCHAR(64)  NOT NULL,
  job_number                   VARCHAR(32)  DEFAULT NULL,
  project_name                 VARCHAR(255) DEFAULT NULL,
  subcontractor_name           VARCHAR(255) NOT NULL,
  trade                        VARCHAR(100) DEFAULT NULL,
  scope_of_work                TEXT         DEFAULT NULL,
  cost_code                    VARCHAR(64)  DEFAULT NULL,
  budget_line_id               VARCHAR(64)  DEFAULT NULL,
  linked_purchase_order_id     VARCHAR(64)  DEFAULT NULL,
  original_commitment_amount   DECIMAL(14,2) DEFAULT 0,
  approved_change_order_amount DECIMAL(14,2) DEFAULT 0,
  current_commitment_amount    DECIMAL(14,2) DEFAULT 0,
  invoiced_to_date             DECIMAL(14,2) DEFAULT 0,
  paid_to_date                 DECIMAL(14,2) DEFAULT 0,
  open_balance                 DECIMAL(14,2) DEFAULT 0,
  remaining_commitment         DECIMAL(14,2) DEFAULT 0,
  retainage_held               DECIMAL(14,2) DEFAULT 0,
  start_date                   DATE         DEFAULT NULL,
  finish_date                  DATE         DEFAULT NULL,
  status                       VARCHAR(32)  NOT NULL DEFAULT 'Planned',
  compliance_status            VARCHAR(32)  NOT NULL DEFAULT 'MissingItems',
  performance_status           VARCHAR(32)  NOT NULL DEFAULT 'Good',
  compliance_override_note     TEXT         DEFAULT NULL,
  import_source                VARCHAR(32)  DEFAULT NULL,
  imported_cost_to_date        DECIMAL(14,2) DEFAULT NULL,
  notes                        TEXT         DEFAULT NULL,
  created_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_project_sub (project_id, subcontractor_id),
  KEY idx_ps_project (project_id),
  KEY idx_ps_sub (subcontractor_id),
  KEY idx_ps_owner (owner_id),
  CONSTRAINT fk_ps_project
    FOREIGN KEY (project_id) REFERENCES brighten_pm.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_subcontractor
    FOREIGN KEY (subcontractor_id) REFERENCES brighten_pm.subcontractors(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 3. Compliance document metadata (files stay in Google Drive)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brighten_pm.subcontractor_documents (
  id                     VARCHAR(64)  NOT NULL,
  owner_id               VARCHAR(128) NOT NULL,
  subcontractor_id       VARCHAR(64)  NOT NULL,
  project_subcontractor_id VARCHAR(64) DEFAULT NULL,
  project_id             VARCHAR(64)  DEFAULT NULL,
  document_type          VARCHAR(64)  NOT NULL,
  drive_file_id          VARCHAR(128) DEFAULT NULL,
  drive_folder_id        VARCHAR(128) DEFAULT NULL,
  effective_date         DATE         DEFAULT NULL,
  expiration_date        DATE         DEFAULT NULL,
  status                 VARCHAR(32)  NOT NULL DEFAULT 'Missing',
  notes                  TEXT         DEFAULT NULL,
  uploaded_at            DATETIME     DEFAULT NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sd_sub (subcontractor_id),
  KEY idx_sd_ps (project_subcontractor_id),
  KEY idx_sd_project (project_id),
  CONSTRAINT fk_sd_sub
    FOREIGN KEY (subcontractor_id) REFERENCES brighten_pm.subcontractors(id) ON DELETE CASCADE,
  CONSTRAINT fk_sd_ps
    FOREIGN KEY (project_subcontractor_id) REFERENCES brighten_pm.project_subcontractors(id) ON DELETE SET NULL,
  CONSTRAINT fk_sd_project
    FOREIGN KEY (project_id) REFERENCES brighten_pm.projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 4. Subcontractor invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brighten_pm.subcontractor_invoices (
  id                     VARCHAR(64)  NOT NULL,
  owner_id               VARCHAR(128) NOT NULL,
  project_id             VARCHAR(64)  NOT NULL,
  subcontractor_id       VARCHAR(64)  NOT NULL,
  project_subcontractor_id VARCHAR(64) NOT NULL,
  job_number             VARCHAR(32)  DEFAULT NULL,
  project_name           VARCHAR(255) DEFAULT NULL,
  subcontractor_name     VARCHAR(255) NOT NULL,
  invoice_number         VARCHAR(64)  NOT NULL,
  invoice_date           DATE         DEFAULT NULL,
  due_date               DATE         DEFAULT NULL,
  description            TEXT         DEFAULT NULL,
  amount                 DECIMAL(14,2) NOT NULL DEFAULT 0,
  approved_amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_amount            DECIMAL(14,2) NOT NULL DEFAULT 0,
  open_balance           DECIMAL(14,2) NOT NULL DEFAULT 0,
  retainage_percent      DECIMAL(5,2)  DEFAULT 0,
  retainage_amount       DECIMAL(14,2) DEFAULT 0,
  net_due                DECIMAL(14,2) DEFAULT 0,
  status                 VARCHAR(32)  NOT NULL DEFAULT 'Received',
  payment_date           DATE         DEFAULT NULL,
  check_number           VARCHAR(64)  DEFAULT NULL,
  lien_waiver_status     VARCHAR(32)  NOT NULL DEFAULT 'Needed',
  notes                  TEXT         DEFAULT NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_si_project (project_id),
  KEY idx_si_ps (project_subcontractor_id),
  CONSTRAINT fk_si_project
    FOREIGN KEY (project_id) REFERENCES brighten_pm.projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_si_ps
    FOREIGN KEY (project_subcontractor_id) REFERENCES brighten_pm.project_subcontractors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------------
-- 5. Legacy alignment + app-ready view
-- ---------------------------------------------------------------------------
-- If subcontractors / project_subcontractors predate this script, run next:
--   db/manual/2026-06-08_subcontractors_legacy_align.sql
-- That file adds missing columns, backfills from legacy names, and replaces
-- v_project_subcontractors with the enriched join (company_name, compliance).
--
-- Minimal view (only if you have NOT run legacy_align yet):
CREATE OR REPLACE VIEW brighten_pm.v_project_subcontractors AS
SELECT
  ps.*,
  p.job_number   AS project_job_number,
  p.project_name AS project_display_name
FROM brighten_pm.project_subcontractors ps
JOIN brighten_pm.projects p ON p.id = ps.project_id;

-- Post-checks:
--   SHOW TABLES FROM brighten_pm LIKE 'subcontractor%';
--   SHOW CREATE VIEW brighten_pm.v_project_subcontractors;
--   SELECT * FROM brighten_pm.v_project_subcontractors LIMIT 5;

-- =====================================================================
-- ROLLBACK (run only to undo this migration)
-- =====================================================================
-- DROP VIEW IF EXISTS brighten_pm.v_project_subcontractors;
-- DROP TABLE IF EXISTS brighten_pm.subcontractor_invoices;
-- DROP TABLE IF EXISTS brighten_pm.subcontractor_documents;
-- DROP TABLE IF EXISTS brighten_pm.project_subcontractors;
-- DROP TABLE IF EXISTS brighten_pm.subcontractors;
