/**
 * migrate-v6.ts — Idempotent migration:
 *   Add "productCode" (TEXT nullable) to batch_sheet_templates.
 *   Existing templates: productCode = NULL (no disruption to current behavior).
 *
 * Run with:
 *   cd /Users/Carlos/Desktop/julian-foods-fsms
 *   DATABASE_URL="$(grep NEON_DATABASE_URL .env.local | head -1 | cut -d= -f2-)" npx tsx prisma/migrate-v6.ts
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

async function main() {
  console.log("Starting migrate-v6 (productCode on batch_sheet_templates)…");

  if (!(await columnExists("batch_sheet_templates", "productCode"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_templates ADD COLUMN "productCode" TEXT`
    );
    console.log("  ✓ Added productCode column");
  } else {
    console.log("  ↷ productCode already exists");
  }

  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
