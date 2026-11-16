-- Migration: create pre_op_624_inspections table
-- Apply with: psql $DATABASE_URL -f scripts/apply-preop-624-migration.sql
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS "pre_op_624_inspections" (
  "id"               TEXT NOT NULL,
  "date"             DATE NOT NULL,
  "conductedBy"      TEXT NOT NULL,
  "rows"             JSONB NOT NULL,
  "hasNotOk"         BOOLEAN NOT NULL DEFAULT false,
  "overallOk"        BOOLEAN NOT NULL,
  "submittedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById"    TEXT NOT NULL,
  "linkedInstanceId" TEXT,
  CONSTRAINT "pre_op_624_inspections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pre_op_624_inspections_date_idx"
  ON "pre_op_624_inspections"("date");

CREATE INDEX IF NOT EXISTS "pre_op_624_inspections_hasNotOk_idx"
  ON "pre_op_624_inspections"("hasNotOk");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'pre_op_624_inspections_submittedById_fkey'
  ) THEN
    ALTER TABLE "pre_op_624_inspections"
      ADD CONSTRAINT "pre_op_624_inspections_submittedById_fkey"
      FOREIGN KEY ("submittedById")
      REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
