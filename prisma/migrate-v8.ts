/**
 * Migration v8 — Add manufacturerName to suppliers
 *
 * Adds optional `manufacturerName` TEXT column to the suppliers table.
 * Existing rows default to NULL — fully backward compatible.
 * Also renames the old snake_case column if it exists.
 *
 * Run:
 *   npx tsx prisma/migrate-v8.ts
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
        WHERE table_name = 'suppliers' AND column_name = 'manufacturer_name'
      ) THEN
        ALTER TABLE suppliers RENAME COLUMN manufacturer_name TO "manufacturerName";
      END IF;
    END
    $$
  `);

  // Add column if it doesn't already exist (new DBs)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS "manufacturerName" TEXT
  `);
  console.log("✓ Added/renamed manufacturerName column on suppliers");
}

main()
  .then(() => {
    console.log("Migration v8 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v8 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
