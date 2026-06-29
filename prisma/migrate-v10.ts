/**
 * migrate-v10.ts
 * Drop the `decision` column from `receiving_records`.
 * The column was never written to in production — all rows should be empty.
 * Safe to drop without data migration.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v10: drop receiving_records.decision");

  // Verify: count rows that have a non-default or non-empty decision
  const result = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt FROM receiving_records
    WHERE decision IS NOT NULL AND decision != ''
  `;
  const count = Number(result[0]?.cnt ?? 0);
  console.log(`Rows with a decision value: ${count}`);

  if (count > 0) {
    console.error(
      "ERROR: " + count + " row(s) have a non-empty decision. " +
      "Manual review required before dropping the column."
    );
    process.exit(1);
  }

  await prisma.$executeRaw`
    ALTER TABLE receiving_records DROP COLUMN IF EXISTS decision
  `;
  console.log("✓ Column dropped successfully.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
