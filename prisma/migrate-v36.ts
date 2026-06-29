/**
 * migrate-v36: Add noPOReason column to receiving_records.
 *
 * When a supervisor receives goods without linking to an open PO, they must
 * select a reason. This column stores that reason as a string so it can be
 * surfaced in the receiving records detail view and audit trail.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v36: adding noPOReason to receiving_records…");

  await prisma.$executeRaw`
    ALTER TABLE receiving_records
    ADD COLUMN IF NOT EXISTS "noPOReason" TEXT
  `;

  console.log("Done. noPOReason column added to receiving_records.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
