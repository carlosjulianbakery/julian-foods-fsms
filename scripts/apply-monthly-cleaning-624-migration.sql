-- =============================================================================
-- Monthly Cleaning 624 — new table migration
-- Target: Neon project, monthly_clean_624_records (NEW table)
-- Rollout order: apply scripts/apply-task-rules-end-of-month-migration.sql
--                FIRST (step a), wait for deploy, then apply THIS (step b).
-- Idempotent: IF NOT EXISTS / DO $$ guards make it safe to re-run.
-- =============================================================================

-- ── Prisma model field ↔ SQL column ─────────────────────────────────────────
--
--   Prisma                      | SQL                           | Notes
--   ────────────────────────────|─────────────────────────────── |──────────────
--   id      String @id cuid()  | id TEXT NOT NULL               | CUID from app
--   facility String @default   | facility TEXT NOT NULL         | DEFAULT '624'
--   month   String             | month TEXT NOT NULL            | "YYYY-MM"
--   status  String @default    | status TEXT NOT NULL           | DEFAULT 'draft'
--   conductedBy String @def    | "conductedBy" TEXT NOT NULL    | camelCase kept
--   initials String @default   | initials TEXT NOT NULL         | DEFAULT ''
--   lines   Json @default      | lines JSONB NOT NULL           | DEFAULT '[]'
--   doneCount Int @default     | "doneCount" INTEGER NOT NULL   | DEFAULT 0
--   naCount  Int @default      | "naCount" INTEGER NOT NULL     | DEFAULT 0
--   notDoneCount Int @default  | "notDoneCount" INTEGER NOT NULL| DEFAULT 0
--   notes   String?            | notes TEXT                     | nullable
--   instructionsVer String     | "instructionsVer" TEXT NOT NULL| DEFAULT 'v1.0'
--   autoSubmitted Boolean      | "autoSubmitted" BOOL NOT NULL  | DEFAULT false
--   lastEditedBy String?       | "lastEditedBy" TEXT            | nullable
--   lastEditedAt DateTime?     | "lastEditedAt" TIMESTAMP(3)    | nullable
--   createdById String?        | "createdById" TEXT             | nullable FK
--   submittedAt DateTime?      | "submittedAt" TIMESTAMP(3)     | nullable
--   submittedById String?      | "submittedById" TEXT           | nullable FK
--   linkedInstanceId String?   | "linkedInstanceId" TEXT        | nullable
--   createdAt DateTime @now    | "createdAt" TIMESTAMP(3)       | DEFAULT NOW()
--   updatedAt DateTime @upd    | "updatedAt" TIMESTAMP(3)       | set by app
--   @@unique([facility,month]) | UNIQUE("facility","month")     |
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS monthly_clean_624_records (
  id                  TEXT NOT NULL,
  facility            TEXT NOT NULL DEFAULT '624',
  month               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  "conductedBy"       TEXT NOT NULL DEFAULT '',
  initials            TEXT NOT NULL DEFAULT '',
  lines               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "doneCount"         INTEGER NOT NULL DEFAULT 0,
  "naCount"           INTEGER NOT NULL DEFAULT 0,
  "notDoneCount"      INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  "instructionsVer"   TEXT NOT NULL DEFAULT 'v1.0',
  "autoSubmitted"     BOOLEAN NOT NULL DEFAULT false,
  "lastEditedBy"      TEXT,
  "lastEditedAt"      TIMESTAMP(3),
  "createdById"       TEXT,
  "submittedAt"       TIMESTAMP(3),
  "submittedById"     TEXT,
  "linkedInstanceId"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT monthly_clean_624_records_pkey PRIMARY KEY (id)
);

-- Unique index on (facility, month)
CREATE UNIQUE INDEX IF NOT EXISTS monthly_clean_624_records_facility_month_key
  ON monthly_clean_624_records (facility, month);

-- Foreign key: submittedById → users(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monthly_clean_624_records_submittedById_fkey'
  ) THEN
    ALTER TABLE monthly_clean_624_records
      ADD CONSTRAINT "monthly_clean_624_records_submittedById_fkey"
      FOREIGN KEY ("submittedById") REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Foreign key: createdById → users(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monthly_clean_624_records_createdById_fkey'
  ) THEN
    ALTER TABLE monthly_clean_624_records
      ADD CONSTRAINT "monthly_clean_624_records_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- ── Verify (run after COMMIT) ────────────────────────────────────────────────
SELECT
  to_regclass('public.monthly_clean_624_records')                    AS table_exists,
  to_regclass('public.monthly_clean_624_records_facility_month_key') AS unique_index_exists;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'monthly_clean_624_records'
ORDER BY ordinal_position;
