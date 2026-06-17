/**
 * Migration v18 — Receiving: support unregistered (off-system) materials
 *
 * Changes:
 *   1. receiving_records."materialId"  — make nullable (was NOT NULL)
 *   2. Add "isUnregisteredMaterial" BOOLEAN NOT NULL DEFAULT false
 *   3. Add "materialCategoryFreetext" TEXT (category free text for off-system items)
 *
 * Idempotent — safe to re-run.
 *
 * Run:
 *   npx tsx prisma/migrate-v18.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 1. Make materialId nullable
  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
      ALTER COLUMN "materialId" DROP NOT NULL
  `);
  console.log("✓ receiving_records.materialId is now nullable");

  // 2. Add isUnregisteredMaterial
  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
      ADD COLUMN IF NOT EXISTS "isUnregisteredMaterial" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added receiving_records.isUnregisteredMaterial");

  // 3. Add materialCategoryFreetext
  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
      ADD COLUMN IF NOT EXISTS "materialCategoryFreetext" TEXT
  `);
  console.log("✓ Added receiving_records.materialCategoryFreetext");

  console.log("\nMigration v18 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v18 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
