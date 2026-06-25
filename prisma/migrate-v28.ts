/**
 * migrate-v28.ts
 *
 * Adds quantityCountedOriginal and quantityCountedOriginalUnit to cycle_counts
 * so the audit trail preserves the unit admin counted in when it differs from
 * the lot unit.
 *
 * Idempotent — safe to run multiple times.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE cycle_counts
      ADD COLUMN IF NOT EXISTS "quantityCountedOriginal" FLOAT,
      ADD COLUMN IF NOT EXISTS "quantityCountedOriginalUnit" TEXT
  `);

  console.log("Migration v28 complete ✓ — cycle_counts gained quantityCountedOriginal + quantityCountedOriginalUnit columns.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Migration v28 failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
