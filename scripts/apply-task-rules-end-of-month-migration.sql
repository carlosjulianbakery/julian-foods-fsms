-- =============================================================================
-- Task Rules — recurrenceEndOfMonth column
-- Target: Neon project, task_rules table (EXISTING table)
-- Rollout order: apply THIS first (step a), wait for deploy, then apply
--                scripts/apply-monthly-cleaning-624-migration.sql (step b).
-- Idempotent: IF NOT EXISTS guard makes it safe to re-run.
-- =============================================================================

-- ── Prisma model field ↔ SQL column ─────────────────────────────────────────
--
--   Prisma                                   SQL
--   ──────────────────────────────────────── ──────────────────────────────────
--   recurrenceEndOfMonth Boolean? @default   "recurrenceEndOfMonth" BOOLEAN
--                                            DEFAULT false
--
--   The `?` in Prisma means nullable → SQL column has NO NOT NULL constraint.
--   The @default(false) maps to DEFAULT false (not NOT NULL DEFAULT false).
--   Existing rows will have NULL until they are touched; Prisma reads NULL as
--   false via the ?? false cast in task-generator.ts.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_rules'
      AND column_name = 'recurrenceEndOfMonth'
  ) THEN
    ALTER TABLE task_rules
      ADD COLUMN "recurrenceEndOfMonth" BOOLEAN DEFAULT false;
  END IF;
END $$;

COMMIT;

-- ── Verify (run after COMMIT) ────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'task_rules'
  AND column_name = 'recurrenceEndOfMonth';
-- Expected: 1 row, data_type=boolean, is_nullable=YES, column_default=false
