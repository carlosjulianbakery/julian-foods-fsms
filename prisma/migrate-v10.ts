/**
 * Migration v10 — Add is_organic to materials
 *
 * Adds `is_organic` BOOLEAN column (default false, NOT NULL) to materials.
 * Existing rows: is_organic = false — no disruption.
 *
 * Run:
 *   npx tsx prisma/migrate-v10.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS is_organic BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added is_organic column to materials");
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
