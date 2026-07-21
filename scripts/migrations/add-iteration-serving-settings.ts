import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Adding serving settings columns to rd_iterations...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE rd_iterations
    ADD COLUMN IF NOT EXISTS "servingSizeG"         DECIMAL(10,4),
    ADD COLUMN IF NOT EXISTS "servingSizeLabel"     TEXT,
    ADD COLUMN IF NOT EXISTS "servingsPerContainer" INTEGER,
    ADD COLUMN IF NOT EXISTS "calculatedAddedSugars" DECIMAL(10,4)
  `);
  console.log("✓ rd_iterations serving settings columns added.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
