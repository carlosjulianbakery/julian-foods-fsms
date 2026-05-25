/**
 * migrate-v4.ts — Idempotent migration:
 *   1. Rename batch_sheet_submissions columns: section5→section6, section4→section5,
 *      section3→section4, section2→section3
 *   2. Add section2_allergen JSONB column (NULL by default for existing rows)
 *
 * Run with:
 *   cd /Users/Carlos/Desktop/julian-foods-fsms
 *   DATABASE_URL="$(grep NEON_DATABASE_URL .env.local | head -1 | cut -d= -f2-)" npx tsx prisma/migrate-v4.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function getColumns(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'batch_sheet_submissions'
  `;
  return rows.map((r) => r.column_name);
}

async function main() {
  console.log("Starting migrate-v4 (section column renames + section2_allergen)…");

  const cols = await getColumns();
  console.log("Current columns:", cols.filter((c) => c.startsWith("section")).join(", "));

  // Rename in reverse order to avoid conflicts:
  //   section5 → section6  (done first — frees the name "section5")
  //   section4 → section5
  //   section3 → section4
  //   section2 → section3

  const renames: Array<[string, string]> = [
    ["section5", "section6"],
    ["section4", "section5"],
    ["section3", "section4"],
    ["section2", "section3"],
  ];

  for (const [from, to] of renames) {
    const currentCols = await getColumns();
    if (currentCols.includes(from) && !currentCols.includes(to)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE batch_sheet_submissions RENAME COLUMN "${from}" TO "${to}"`
      );
      console.log(`  ✓ Renamed ${from} → ${to}`);
    } else if (currentCols.includes(to) && !currentCols.includes(from)) {
      console.log(`  ↷ ${to} already exists, ${from} gone — skipping rename`);
    } else if (currentCols.includes(from) && currentCols.includes(to)) {
      console.log(`  ⚠ Both ${from} and ${to} exist — manual intervention required`);
    } else {
      console.log(`  ? Neither ${from} nor ${to} found — skipping`);
    }
  }

  // Add section2_allergen if absent
  const finalCols = await getColumns();
  if (!finalCols.includes("section2_allergen")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE batch_sheet_submissions ADD COLUMN "section2_allergen" JSONB`
    );
    console.log("  ✓ Added section2_allergen column");
  } else {
    console.log("  ↷ section2_allergen already exists — skipping");
  }

  const done = await getColumns();
  console.log("\nFinal section columns:", done.filter((c) => c.startsWith("section")).sort().join(", "));
  console.log("Migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
