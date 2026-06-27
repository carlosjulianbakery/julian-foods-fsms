/**
 * migrate-v33: Create purchase_orders and purchase_order_items tables.
 * Add poId + poNumber columns to receiving_records.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id                      TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "poNumber"              TEXT        NOT NULL UNIQUE,
      "supplierId"            TEXT        NOT NULL REFERENCES suppliers(id),
      "supplierName"          TEXT        NOT NULL DEFAULT '',
      status                  TEXT        NOT NULL DEFAULT 'sent',
      "sentDate"              DATE        NOT NULL DEFAULT CURRENT_DATE,
      "estimatedDeliveryDate" DATE,
      "actualDeliveryDate"    DATE,
      notes                   TEXT,
      "forecastPeriodFrom"    DATE,
      "forecastPeriodTo"      DATE,
      "createdById"           TEXT        NOT NULL REFERENCES users(id),
      "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("✓ purchase_orders table created");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id                TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "poId"            TEXT    NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      "materialId"      TEXT    NOT NULL REFERENCES materials(id),
      "materialName"    TEXT    NOT NULL DEFAULT '',
      "qtyOrdered"      FLOAT   NOT NULL,
      unit              TEXT    NOT NULL DEFAULT 'lb',
      "qtyReceived"     FLOAT   NOT NULL DEFAULT 0,
      "qtyRemaining"    FLOAT   NOT NULL DEFAULT 0,
      "isFullyReceived" BOOLEAN NOT NULL DEFAULT false,
      source            TEXT    NOT NULL DEFAULT 'direct',
      "wipMaterialName" TEXT,
      notes             TEXT
    );
  `);
  console.log("✓ purchase_order_items table created");

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders ("supplierId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders (status);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items ("poId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_poi_material ON purchase_order_items ("materialId");`);
  console.log("✓ Indexes created");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE receiving_records
    ADD COLUMN IF NOT EXISTS "poId"     TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "poNumber" TEXT;
  `);
  console.log("✓ receiving_records updated with poId and poNumber");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
