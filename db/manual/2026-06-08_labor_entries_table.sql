-- Labor entries table — manual seed/update of labor hours and cost per project
-- Target database: brighten_pm (Cloud SQL, MySQL 8)
-- Style: manual reviewed DDL. The app reads via views/tables and writes via the
--        API; there is no migration framework, so this script is applied by hand
--        and committed here as the schema record (same pattern as
--        2026-06-04_phase_1b_overview_completion.sql).
--
-- Pre-checks (run before applying):
--   SELECT DATABASE();                                     -- expect brighten_pm
--   SHOW TABLES FROM brighten_pm LIKE 'labor_entries';     -- expect empty
--
-- Purpose: lets the app seed and keep updating labor/time data directly in SQL
-- (job hours, classification, hourly cost) instead of depending on the
-- Master Time Sheet Google Sheets sync. Entries are project-scoped and
-- additive — they do not replace or migrate any existing Firestore time entry
-- data.

CREATE TABLE brighten_pm.labor_entries (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  project_id         VARCHAR(64)  NOT NULL,
  work_date          DATE         NOT NULL,
  employee_name      VARCHAR(150) NOT NULL,
  classification     VARCHAR(100) NULL,
  regular_hours      DECIMAL(6,2) NOT NULL DEFAULT 0,
  overtime_hours     DECIMAL(6,2) NOT NULL DEFAULT 0,
  double_time_hours  DECIMAL(6,2) NOT NULL DEFAULT 0,
  hourly_rate        DECIMAL(8,2) NULL,
  labor_cost         DECIMAL(12,2) NULL,
  notes              TEXT NULL,
  source_type        VARCHAR(30)  NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_labor_entries_project (project_id),
  KEY idx_labor_entries_date (work_date),
  CONSTRAINT fk_labor_entries_project
    FOREIGN KEY (project_id) REFERENCES brighten_pm.projects(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Optional read-side rollup view: total hours and labor cost per project
CREATE OR REPLACE VIEW brighten_pm.v_project_labor_summary AS
SELECT
  project_id,
  COUNT(*)                                            AS entry_count,
  SUM(regular_hours)                                  AS regular_hours_total,
  SUM(overtime_hours)                                 AS overtime_hours_total,
  SUM(double_time_hours)                              AS double_time_hours_total,
  SUM(regular_hours + overtime_hours + double_time_hours) AS total_hours,
  SUM(labor_cost)                                     AS labor_cost_total,
  MAX(work_date)                                      AS last_work_date
FROM brighten_pm.labor_entries
GROUP BY project_id;

-- Post-checks (run after applying):
--   SHOW COLUMNS FROM brighten_pm.labor_entries;
--   SHOW FULL TABLES FROM brighten_pm LIKE 'v_project_labor_summary';

-- =====================================================================
-- ROLLBACK (run only to undo this migration)
-- =====================================================================
-- DROP VIEW IF EXISTS brighten_pm.v_project_labor_summary;
-- DROP TABLE IF EXISTS brighten_pm.labor_entries;
