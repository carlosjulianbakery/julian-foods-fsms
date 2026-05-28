/**
 * migrate-v5.ts — Idempotent migration:
 *   1. Add DRAFT to the BatchSheetStatus enum
 *   2. Add last_saved_at (TIMESTAMPTZ nullable) to batch_sheet_submissions
 *   3. Add last_active_section (INTEGER nullable) to batch_sheet_submissions
 *
 * Run with:
 *   cd /Users/Carlos/Desktop/julian-foods-fsms
 *   DATABASE_URL="$(grep NEON_DATABASE_URL .env.local | head -1 | cut -d= -f2-)" npx tsx prisma/migrate-v5.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
  `;
  return rows.length > 0;
}

async function enumValueExists(enumName: string, value: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
    SELECT e.enumlabel FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = ${enumName} AND e.enumlabel = ${value}
  `;
  return rows.length > 0;
}

async function main() {
  console.log("Starting migrate-v5 (BatchSheetStatus DRAFT + draft columns)…");

  // 1. Add DRAFT to BatchSheetStatus enum (must be first value alphabetically or use IF NOT EXISTS workaround)
  const hasDraft = await enumValueExists("BatchSheetStatus", "DRAFT");
  if (!hasDraft) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BatchSheetStatus" ADD VALUE 'DRAFT'`);
    console.log("  ✓ Added DRAFT to BatchSheetStatus enum");
  } else {
    console.log("  ↷ DRAFT already in BatchSheetStatus enum");
  }

  // 2. Add last_saved_at column
  if (!(await columnExists("batch_sheet_submissions", "last_saved_at"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_submissions ADD COLUMN "last_saved_at" TIMESTAMPTZ`
    );
    console.log("  ✓ Added last_saved_at column");
  } else {
    console.log("  ↷ last_saved_at already exists");
  }

  // 3. Add last_active_section column
  if (!(await columnExists("batch_sheet_submissions", "last_active_section"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_submissions ADD COLUMN "last_active_section" INTEGER`
    );
    console.log("  ✓ Added last_active_section column");
  } else {
    console.log("  ↷ last_active_section already exists");
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
