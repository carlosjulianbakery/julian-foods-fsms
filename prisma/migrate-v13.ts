/**
 * Migration v13 — Products: shelfLifeMonths + presentations
 *
 * 1. ADD "shelfLifeMonths" INTEGER (nullable) to products
 * 2. ADD "presentations" JSONB (default '[]') to products
 *
 * Run:
 *   npx tsx prisma/migrate-v13.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS "shelfLifeMonths" INTEGER
  `);
  console.log("✓ Added shelfLifeMonths to products");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS "presentations" JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  console.log("✓ Added presentations to products");

  console.log("\nMigration v13 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v13 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
