import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("Adding bundle configuration schema...");

  // Add configStatus and ignoredReason to shipstation_products
  await prisma.$executeRawUnsafe(`
    ALTER TABLE shipstation_products
    ADD COLUMN IF NOT EXISTS "configStatus" TEXT NOT NULL DEFAULT 'unmatched'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE shipstation_products
    ADD COLUMN IF NOT EXISTS "ignoredReason" TEXT
  `);
  console.log("  ✅ shipstation_products: configStatus, ignoredReason");

  // Add configStatus to shipstation_shipment_items
  await prisma.$executeRawUnsafe(`
    ALTER TABLE shipstation_shipment_items
    ADD COLUMN IF NOT EXISTS "configStatus" TEXT
  `);
  console.log("  ✅ shipstation_shipment_items: configStatus");

  // Create shipstation_bundle_configs table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_bundle_configs (
      id TEXT PRIMARY KEY,
      "bundleProductId" TEXT NOT NULL,
      "componentProductId" TEXT NOT NULL,
      "fsmsPresentationId" TEXT NOT NULL,
      "fsmsProductId" TEXT NOT NULL,
      "quantityPerBundle" INTEGER NOT NULL,
      "createdBy" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "shipstation_bundle_configs_bundleProductId_fkey"
        FOREIGN KEY ("bundleProductId") REFERENCES shipstation_products(id) ON DELETE CASCADE,
      CONSTRAINT "shipstation_bundle_configs_componentProductId_fkey"
        FOREIGN KEY ("componentProductId") REFERENCES shipstation_products(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS shipstation_bundle_configs_bundleProductId_idx
    ON shipstation_bundle_configs ("bundleProductId")
  `);
  console.log("  ✅ shipstation_bundle_configs");

  // Back-fill configStatus for already-matched products
  await prisma.$executeRawUnsafe(`
    UPDATE shipstation_products
    SET "configStatus" = 'single_matched'
    WHERE "fsmsPresentationId" IS NOT NULL
      AND "isBundle" = false
      AND "configStatus" = 'unmatched'
  `);
  const backfilled = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS count FROM shipstation_products WHERE "configStatus" = 'single_matched'`
  ).then((rows) => Number(rows[0]?.count ?? 0));
  console.log(`  ✅ Back-filled ${backfilled} already-matched single products → single_matched`);

  console.log("\nBundle configuration schema migration complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
