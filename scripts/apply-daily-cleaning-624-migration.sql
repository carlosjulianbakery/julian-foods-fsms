-- Migration: Daily Cleaning 624
-- Table: daily_clean_624_records
-- Run in Neon SQL editor. Idempotent (IF NOT EXISTS).
--
-- Column notes:
--   date            DATE              (Prisma: DateTime @db.Date)
--   submittedAt     TIMESTAMP(3)      (Prisma: DateTime @default(now()), no @db annotation → TIMESTAMP(3))
--   facility        TEXT DEFAULT '624' (always 624; added for direct query/filter without JOIN)
--   conductedBy     TEXT              (stores initials, e.g. "HGA")
--   allergenChange  BOOLEAN           confirmed stored
--   notes           TEXT nullable     confirmed stored
--   instructionsVer TEXT DEFAULT 'v1.0' confirmed stored

BEGIN;

CREATE TABLE IF NOT EXISTS daily_clean_624_records (
  id               TEXT         NOT NULL PRIMARY KEY,
  date             DATE         NOT NULL,
  time             TEXT         NOT NULL,
  facility         TEXT         NOT NULL DEFAULT '624',
  "conductedBy"    TEXT         NOT NULL,
  rows             JSONB        NOT NULL,
  "doneCount"      INTEGER      NOT NULL DEFAULT 0,
  "naCount"        INTEGER      NOT NULL DEFAULT 0,
  "notDoneCount"   INTEGER      NOT NULL DEFAULT 0,
  "allergenChange" BOOLEAN      NOT NULL DEFAULT FALSE,
  notes            TEXT,
  "instructionsVer" TEXT        NOT NULL DEFAULT 'v1.0',
  "submittedAt"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "submittedById"  TEXT         NOT NULL,
  "linkedInstanceId" TEXT
);

-- Add facility column if running against a table created before this fix
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_clean_624_records'
      AND column_name = 'facility'
  ) THEN
    ALTER TABLE daily_clean_624_records
      ADD COLUMN facility TEXT NOT NULL DEFAULT '624';
  END IF;
END $$;

-- Foreign key: submittedById → users(id)
-- (User model @@map is "users", PK is "id")
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
