/**
 * Migration v9 — Add allergen fields to materials
 *
 * 1. Adds `is_allergen` BOOLEAN column (default false, NOT NULL) to materials
 * 2. Adds `allergens`   JSONB  column (nullable) to materials
 *
 * Existing rows: is_allergen = false, allergens = NULL — no disruption.
 *
 * Run:
 *   npx tsx prisma/migrate-v9.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS is_allergen BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added is_allergen column to materials");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS allergens JSONB
  `);
  console.log("✓ Added allergens column to materials");
}

main()
  .then(() => {
    console.log("Migration v9 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v9 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
