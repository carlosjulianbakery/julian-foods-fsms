import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating ShipStation integration tables...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_products (
      id TEXT PRIMARY KEY,
      "shipstationProductId" TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      upc TEXT,
      "isBundle" BOOLEAN NOT NULL DEFAULT false,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "fsmsPresentationId" TEXT,
      "fsmsProductId" TEXT,
      "lastSyncedAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS shipstation_products_shipstationProductId_key
    ON shipstation_products ("shipstationProductId")
  `);
  console.log("  ✅ shipstation_products");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_bundle_components (
      id TEXT PRIMARY KEY,
      "bundleProductId" TEXT NOT NULL,
      "componentProductId" TEXT NOT NULL,
      "quantityPerBundle" INT NOT NULL,
      "fsmsPresentationId" TEXT,
      "fsmsProductId" TEXT
    )
  `);
  console.log("  ✅ shipstation_bundle_components");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_shipments (
      id TEXT PRIMARY KEY,
      "shipstationShipmentId" TEXT NOT NULL,
      "shipstationOrderId" TEXT NOT NULL,
      "shipstationOrderNumber" TEXT NOT NULL,
      "storeId" INT NOT NULL,
      "storeName" TEXT NOT NULL,
      "customerName" TEXT,
      "customerEmail" TEXT,
      "orderDate" TIMESTAMPTZ NOT NULL,
      "shipDate" TIMESTAMPTZ NOT NULL,
      voided BOOLEAN NOT NULL DEFAULT false,
      "voidDate" TIMESTAMPTZ,
      "syncRunId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS shipstation_shipments_shipstationShipmentId_key
    ON shipstation_shipments ("shipstationShipmentId")
  `);
  console.log("  ✅ shipstation_shipments");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_shipment_items (
      id TEXT PRIMARY KEY,
      "shipmentId" TEXT NOT NULL,
      "shipstationProductId" TEXT,
      "productName" TEXT NOT NULL,
      upc TEXT,
      "quantityShipped" INT NOT NULL,
      "isBundleComponent" BOOLEAN NOT NULL DEFAULT false,
      "bundleProductName" TEXT,
      "fsmsPresentationId" TEXT,
      "fsmsProductId" TEXT,
      "fsmsBatchSheetId" TEXT,
      "fsmsMatchStatus" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_shipstation_shipment_items_shipment
        FOREIGN KEY ("shipmentId") REFERENCES shipstation_shipments(id) ON DELETE CASCADE
    )
  `);
  console.log("  ✅ shipstation_shipment_items");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS finished_goods_inventory (
      id TEXT PRIMARY KEY,
      "fsmsPresentationId" TEXT NOT NULL,
      "fsmsProductId" TEXT NOT NULL,
      "presentationName" TEXT NOT NULL,
      "productName" TEXT NOT NULL,
      upc TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'units',
      "totalProduced" INT NOT NULL DEFAULT 0,
      "totalShipped" INT NOT NULL DEFAULT 0,
      "onHand" INT NOT NULL DEFAULT 0,
      "lastBatchSheetDate" TIMESTAMPTZ,
      "lastShipmentDate" TIMESTAMPTZ,
      "lastUpdated" TIMESTAMPTZ NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS finished_goods_inventory_fsmsPresentationId_key
    ON finished_goods_inventory ("fsmsPresentationId")
  `);
  console.log("  ✅ finished_goods_inventory");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS shipstation_sync_logs (
      id TEXT PRIMARY KEY,
      "startedAt" TIMESTAMPTZ NOT NULL,
      "completedAt" TIMESTAMPTZ,
      status TEXT NOT NULL,
      "shipmentsFetched" INT NOT NULL DEFAULT 0,
      "shipmentsNew" INT NOT NULL DEFAULT 0,
      "shipmentsVoided" INT NOT NULL DEFAULT 0,
      "itemsProcessed" INT NOT NULL DEFAULT 0,
      "itemsMatched" INT NOT NULL DEFAULT 0,
      "itemsUnmatched" INT NOT NULL DEFAULT 0,
      "dateRangeFrom" TIMESTAMPTZ NOT NULL,
      "dateRangeTo" TIMESTAMPTZ NOT NULL,
      "errorMessage" TEXT,
      notes TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("  ✅ shipstation_sync_logs");

  console.log("\nAll ShipStation tables created successfully.");
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
