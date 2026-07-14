import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Dropping costPerUnit column from rd_ingredients...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE rd_ingredients DROP COLUMN IF EXISTS "costPerUnit"
  `);
  console.log("✓ Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
