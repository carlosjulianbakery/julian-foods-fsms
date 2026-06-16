/**
 * Migration v16 — Configurable Base Production Unit
 *
 * Replaces the hardcoded "Bowl" label with a per-template configurable
 * base production unit name, plus a toggle to distinguish production
 * vessels (yield is calculated) from finished units (no yield calc).
 *
 * 1. ADD "baseUnitName" TEXT NOT NULL DEFAULT 'Bowl' to batch_sheet_templates
 * 2. ADD "baseUnitIsFinished" BOOLEAN NOT NULL DEFAULT false to batch_sheet_templates
 * 3. ADD "baseUnitName" TEXT (nullable) to batch_sheet_submissions
 * 4. ADD "baseUnitIsFinished" BOOLEAN (nullable) to batch_sheet_submissions
 *
 * Existing templates/submissions are unaffected — they default to
 * "Bowl" / Production Vessel, matching current behavior exactly.
 *
 * Idempotent — safe to re-run.
 *
 * Run:
 *   npx tsx prisma/migrate-v16.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_templates ADD COLUMN IF NOT EXISTS "baseUnitName" TEXT NOT NULL DEFAULT 'Bowl'
  `);
  console.log("✓ Added baseUnitName to batch_sheet_templates");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_templates ADD COLUMN IF NOT EXISTS "baseUnitIsFinished" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added baseUnitIsFinished to batch_sheet_templates");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_submissions ADD COLUMN IF NOT EXISTS "baseUnitName" TEXT
  `);
  console.log("✓ Added baseUnitName to batch_sheet_submissions");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_submissions ADD COLUMN IF NOT EXISTS "baseUnitIsFinished" BOOLEAN
  `);
  console.log("✓ Added baseUnitIsFinished to batch_sheet_submissions");

  console.log("\nMigration v16 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v16 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
