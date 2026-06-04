-- Phase 1B — Overview completion fields and project scope
-- Target database: brighten_pm (Cloud SQL, MySQL 8)
-- Style: manual reviewed DDL. The app reads via views and writes via the API;
--        there is no migration framework, so this script is applied by hand and
--        committed here as the schema record.
--
-- Pre-checks (run before applying):
--   SELECT DATABASE();                       -- expect brighten_pm (or use fully-qualified names below)
--   SHOW COLUMNS FROM brighten_pm.projects LIKE 'project_profile';   -- expect empty
--   SHOW TABLES FROM brighten_pm LIKE 'project_scope';               -- expect empty
--
-- All changes are additive and nullable. No backfill required.
-- Take a Cloud SQL backup/snapshot before running (DDL is not transactional in MySQL).

-- 1. Overview completion columns on projects (nullable, additive)
ALTER TABLE brighten_pm.projects
  ADD COLUMN project_profile   VARCHAR(100) NULL AFTER notes,
  ADD COLUMN retainage_percent DECIMAL(5,2) NULL AFTER project_profile,
  ADD COLUMN award_date        DATE         NULL AFTER retainage_percent,
  ADD COLUMN current_phase     VARCHAR(100) NULL AFTER award_date;

-- 2. One-to-one project scope detail table
CREATE TABLE brighten_pm.project_scope (
  project_id              VARCHAR(64) NOT NULL,
  scope_summary           TEXT NULL,
  included_work           TEXT NULL,
  exclusions              TEXT NULL,
  schedule_access_notes   TEXT NULL,
  closeout_requirements   TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  CONSTRAINT fk_project_scope_project
    FOREIGN KEY (project_id) REFERENCES brighten_pm.projects(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Post-checks (run after applying):
--   SHOW COLUMNS FROM brighten_pm.projects LIKE 'project_profile';
--   SHOW COLUMNS FROM brighten_pm.projects LIKE 'retainage_percent';
--   SHOW COLUMNS FROM brighten_pm.projects LIKE 'award_date';
--   SHOW COLUMNS FROM brighten_pm.projects LIKE 'current_phase';
--   SHOW COLUMNS FROM brighten_pm.project_scope;

-- =====================================================================
-- ROLLBACK (run only to undo this migration)
-- =====================================================================
-- DROP TABLE IF EXISTS brighten_pm.project_scope;
-- ALTER TABLE brighten_pm.projects
--   DROP COLUMN current_phase,
--   DROP COLUMN award_date,
--   DROP COLUMN retainage_percent,
--   DROP COLUMN project_profile;
