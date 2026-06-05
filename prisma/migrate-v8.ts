/**
 * Migration v8 — Add manufacturer_name to suppliers
 *
 * Adds optional `manufacturer_name` TEXT column to the suppliers table.
 * Existing rows default to NULL — fully backward compatible.
 *
 * Run:
 *   npx tsx prisma/migrate-v8.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS manufacturer_name TEXT
  `);
  console.log("✓ Added manufacturer_name column to suppliers");
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
