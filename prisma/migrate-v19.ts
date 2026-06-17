/**
 * Migration v19 — Supplier Brands / Delivery Names
 *
 * Changes:
 *   1. Create "supplier_brands" table
 *   2. Add "brandId" TEXT to receiving_records
 *   3. Add "brandName" TEXT to receiving_records
 *   4. Add "brandId" TEXT to inventory_lots
 *   5. Add "brandName" TEXT to inventory_lots
 *
 * Idempotent — safe to re-run.
 *
 * Run:
 *   npx tsx prisma/migrate-v19.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 1. Create supplier_brands table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "supplier_brands" (
      "id"          TEXT        NOT NULL,
      "supplierId"  TEXT        NOT NULL,
      "brandName"   TEXT        NOT NULL,
      "description" TEXT,
      "isActive"    BOOLEAN     NOT NULL DEFAULT true,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "supplier_brands_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "supplier_brands_supplierId_fkey"
        FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  console.log("✓ Created supplier_brands table");

  // 2. receiving_records.brandId
  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
      ADD COLUMN IF NOT EXISTS "brandId" TEXT
  `);
  console.log("✓ Added receiving_records.brandId");

  // 3. receiving_records.brandName
  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
      ADD COLUMN IF NOT EXISTS "brandName" TEXT
  `);
  console.log("✓ Added receiving_records.brandName");

  // 4. inventory_lots.brandId
  await prisma.$executeRawUnsafe(`
    ALTER TABLE inventory_lots
      ADD COLUMN IF NOT EXISTS "brandId" TEXT
  `);
  console.log("✓ Added inventory_lots.brandId");

  // 5. inventory_lots.brandName
  await prisma.$executeRawUnsafe(`
    ALTER TABLE inventory_lots
      ADD COLUMN IF NOT EXISTS "brandName" TEXT
  `);
  console.log("✓ Added inventory_lots.brandName");

  console.log("\nMigration v19 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v19 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
