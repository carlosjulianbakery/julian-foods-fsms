/**
 * migrate-v5.ts — Idempotent migration:
 *   1. Add DRAFT to the BatchSheetStatus enum
 *   2. Add "lastSavedAt" (TIMESTAMPTZ nullable) to batch_sheet_submissions
 *   3. Add "lastActiveSection" (INTEGER nullable) to batch_sheet_submissions
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

  // 1. Add DRAFT to BatchSheetStatus enum
  const hasDraft = await enumValueExists("BatchSheetStatus", "DRAFT");
  if (!hasDraft) {
    await prisma.$executeRawUnsafe(`ALTER TYPE "BatchSheetStatus" ADD VALUE 'DRAFT'`);
    console.log("  ✓ Added DRAFT to BatchSheetStatus enum");
  } else {
    console.log("  ↷ DRAFT already in BatchSheetStatus enum");
  }

  // 2. Add "lastSavedAt" column (camelCase to match Prisma field name)
  if (!(await columnExists("batch_sheet_submissions", "lastSavedAt"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_submissions ADD COLUMN "lastSavedAt" TIMESTAMPTZ`
    );
    console.log("  ✓ Added lastSavedAt column");
  } else {
    console.log("  ↷ lastSavedAt already exists");
  }

  // 3. Add "lastActiveSection" column (camelCase to match Prisma field name)
  if (!(await columnExists("batch_sheet_submissions", "lastActiveSection"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_submissions ADD COLUMN "lastActiveSection" INTEGER`
    );
    console.log("  ✓ Added lastActiveSection column");
  } else {
    console.log("  ↷ lastActiveSection already exists");
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
