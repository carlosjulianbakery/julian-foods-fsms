-- Migration: Daily Cleaning 624
-- Table: daily_clean_624_records
-- Run in Neon SQL editor. Idempotent (IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS daily_clean_624_records (
  id               TEXT      NOT NULL PRIMARY KEY,
  date             DATE      NOT NULL,
  time             TEXT      NOT NULL,
  "conductedBy"    TEXT      NOT NULL,
  rows             JSONB     NOT NULL,
  "doneCount"      INTEGER   NOT NULL DEFAULT 0,
  "naCount"        INTEGER   NOT NULL DEFAULT 0,
  "notDoneCount"   INTEGER   NOT NULL DEFAULT 0,
  "allergenChange" BOOLEAN   NOT NULL DEFAULT FALSE,
  notes            TEXT,
  "instructionsVer" TEXT     NOT NULL DEFAULT 'v1.0',
  "submittedAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "submittedById"  TEXT      NOT NULL,
  "linkedInstanceId" TEXT
);

-- Foreign key to users (users table is mapped as "users")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'daily_clean_624_records_submittedById_fkey'
      AND table_name = 'daily_clean_624_records'
  ) THEN
    ALTER TABLE daily_clean_624_records
      ADD CONSTRAINT "daily_clean_624_records_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "daily_clean_624_records_date_idx"
  ON daily_clean_624_records (date);

CREATE INDEX IF NOT EXISTS "daily_clean_624_records_notDoneCount_idx"
  ON daily_clean_624_records ("notDoneCount");

COMMIT;

-- Verification
SELECT COUNT(*) AS total_records FROM daily_clean_624_records;
