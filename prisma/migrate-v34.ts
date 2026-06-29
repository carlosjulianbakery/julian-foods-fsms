/**
 * migrate-v34: Make performedById nullable on inventory_movements.
 *
 * The retroactive unit-correction script created 7 in_correction movements
 * with performedById = "system-correction" (a literal string, not a real user ID).
 * Prisma's required User relation threw "Field performedBy is required to return
 * data, got null instead", breaking the Movement History page for all users.
 *
 * Fix: drop the NOT NULL constraint on performedById so the relation becomes
 * optional. Existing rows are unaffected; the 7 correction rows will show no
 * performer name (null) rather than crashing the query.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v34: making inventory_movements.performedById nullable…");

  await prisma.$executeRaw`
    ALTER TABLE inventory_movements
    ALTER COLUMN "performedById" DROP NOT NULL
  `;

  console.log("Done. performedById is now nullable.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
