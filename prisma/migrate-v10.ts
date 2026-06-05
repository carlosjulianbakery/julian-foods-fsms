/**
 * Migration v10 — Add isOrganic to materials
 *
 * Adds `isOrganic` BOOLEAN column (default false, NOT NULL) to materials.
 * Existing rows: isOrganic = false — no disruption.
 * Also renames old snake_case column if it exists.
 *
 * Run:
 *   npx tsx prisma/migrate-v10.ts
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
        WHERE table_name = 'materials' AND column_name = 'is_organic'
      ) THEN
        ALTER TABLE materials RENAME COLUMN is_organic TO "isOrganic";
      END IF;
    END
    $$
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS "isOrganic" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added/renamed isOrganic column on materials");
}

main()
  .then(() => {
    console.log("Migration v10 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v10 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
