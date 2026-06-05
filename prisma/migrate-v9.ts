/**
 * Migration v9 — Add allergen fields to materials
 *
 * 1. Adds `isAllergen` BOOLEAN column (default false, NOT NULL) to materials
 * 2. Adds `allergens`  JSONB  column (nullable) to materials
 *
 * Existing rows: isAllergen = false, allergens = NULL — no disruption.
 * Also renames old snake_case columns if they exist.
 *
 * Run:
 *   npx tsx prisma/migrate-v9.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Rename old snake_case column if it exists (idempotent for existing DBs)
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'materials' AND column_name = 'is_allergen'
      ) THEN
        ALTER TABLE materials RENAME COLUMN is_allergen TO "isAllergen";
      END IF;
    END
    $$
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS "isAllergen" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added/renamed isAllergen column on materials");

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
