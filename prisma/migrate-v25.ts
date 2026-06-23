/**
 * Migration v25 — Admin notes on batch sheet submissions
 *
 * Adds three nullable columns to batch_sheet_submissions:
 *   adminNotes             — internal annotation text
 *   adminNotesUpdatedByName — name snapshot of the admin who last saved
 *   adminNotesUpdatedAt    — timestamp of last save
 *
 * All columns are nullable; no impact on existing records.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE batch_sheet_submissions
      ADD COLUMN IF NOT EXISTS "adminNotes"              TEXT,
      ADD COLUMN IF NOT EXISTS "adminNotesUpdatedByName" TEXT,
      ADD COLUMN IF NOT EXISTS "adminNotesUpdatedAt"     TIMESTAMPTZ
  `);
  console.log("✓ Added adminNotes columns to batch_sheet_submissions");

  console.log("\nMigration v25 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v25 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
