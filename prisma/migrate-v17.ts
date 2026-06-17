/**
 * Migration v17 — Receiving System, Inventory System, Material Config
 *
 * New tables:
 *   1. receiving_records   — Incoming delivery log with condition checks
 *   2. quarantine_records  — Records for rejected/conditional deliveries
 *   3. inventory_lots      — Per-lot inventory tracking
 *   4. inventory_movements — Immutable ledger of all stock changes
 *   5. cycle_counts        — Physical count reconciliation events
 *
 * Updated tables:
 *   6. materials — adds isTemperatureSensitive, coaRequired, minimumStockQuantity, minimumStockUnit
 *
 * Idempotent — safe to re-run.
 *
 * Run:
 *   npx tsx prisma/migrate-v17.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // ── 1. receiving_records ────────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "receiving_records" (
      "id"                  TEXT NOT NULL,
      "recordNumber"        TEXT NOT NULL,
      "date"                DATE NOT NULL,
      "timeReceived"        TEXT NOT NULL,
      "receivedById"        TEXT NOT NULL,
      "purchaseOrderNumber" TEXT,
      "materialId"          TEXT NOT NULL,
      "materialName"        TEXT NOT NULL,
      "supplierId"          TEXT,
      "supplierName"        TEXT NOT NULL DEFAULT '',
      "lotNumber"           TEXT NOT NULL,
      "quantityReceived"    DOUBLE PRECISION NOT NULL,
      "unit"                TEXT NOT NULL,
      "expirationDate"      DATE,
      "conditionCheck"      JSONB NOT NULL DEFAULT '{}',
      "coaRequired"         BOOLEAN NOT NULL DEFAULT false,
      "coaReceived"         BOOLEAN,
      "coaDocumentUrl"      TEXT,
      "decision"            TEXT NOT NULL,
      "submittedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "notes"               TEXT,
      CONSTRAINT "receiving_records_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("✓ Created receiving_records");

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "receiving_records_recordNumber_key"
      ON "receiving_records" ("recordNumber")
  `);
  console.log("✓ Indexed receiving_records.recordNumber");

  // ── 2. quarantine_records ───────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "quarantine_records" (
      "id"                TEXT NOT NULL,
      "recordNumber"      TEXT NOT NULL,
      "receivingRecordId" TEXT NOT NULL,
      "materialName"      TEXT NOT NULL,
      "supplierName"      TEXT NOT NULL,
      "lotNumber"         TEXT NOT NULL,
      "quantity"          DOUBLE PRECISION NOT NULL,
      "unit"              TEXT NOT NULL,
      "quarantineReason"  TEXT NOT NULL,
      "actionTaken"       TEXT NOT NULL,
      "quarantineLocation" TEXT,
      "adminNotified"     BOOLEAN NOT NULL DEFAULT false,
      "status"            TEXT NOT NULL DEFAULT 'open',
      "resolutionNotes"   TEXT,
      "resolvedById"      TEXT,
      "resolvedAt"        TIMESTAMPTZ,
      "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "quarantine_records_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("✓ Created quarantine_records");

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "quarantine_records_recordNumber_key"
      ON "quarantine_records" ("recordNumber")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "quarantine_records_receivingRecordId_key"
      ON "quarantine_records" ("receivingRecordId")
  `);
  console.log("✓ Indexed quarantine_records");

  // ── 3. inventory_lots ───────────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "inventory_lots" (
      "id"                  TEXT NOT NULL,
      "materialId"          TEXT NOT NULL,
      "materialName"        TEXT NOT NULL,
      "supplierId"          TEXT,
      "supplierName"        TEXT NOT NULL DEFAULT '',
      "lotNumber"           TEXT NOT NULL,
      "receivingRecordId"   TEXT,
      "quantityReceived"    DOUBLE PRECISION NOT NULL,
      "quantityRemaining"   DOUBLE PRECISION NOT NULL,
      "unit"                TEXT NOT NULL,
      "receivedDate"        DATE NOT NULL,
      "expirationDate"      DATE,
      "status"              TEXT NOT NULL DEFAULT 'active',
      "isConditional"       BOOLEAN NOT NULL DEFAULT false,
      "conditionalNotes"    TEXT,
      "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("✓ Created inventory_lots");

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "inventory_lots_receivingRecordId_key"
      ON "inventory_lots" ("receivingRecordId")
      WHERE "receivingRecordId" IS NOT NULL
  `);
  console.log("✓ Indexed inventory_lots");

  // ── 4. inventory_movements ──────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "inventory_movements" (
      "id"              TEXT NOT NULL,
      "inventoryLotId"  TEXT NOT NULL,
      "materialId"      TEXT NOT NULL,
      "materialName"    TEXT NOT NULL,
      "lotNumber"       TEXT NOT NULL,
      "movementType"    TEXT NOT NULL,
      "quantity"        DOUBLE PRECISION NOT NULL,
      "unit"            TEXT NOT NULL,
      "referenceType"   TEXT NOT NULL,
      "referenceId"     TEXT NOT NULL,
      "referenceNumber" TEXT NOT NULL,
      "quantityBefore"  DOUBLE PRECISION NOT NULL,
      "quantityAfter"   DOUBLE PRECISION NOT NULL,
      "performedById"   TEXT NOT NULL,
      "performedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "notes"           TEXT,
      CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("✓ Created inventory_movements");

  // ── 5. cycle_counts ─────────────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "cycle_counts" (
      "id"               TEXT NOT NULL,
      "countDate"        DATE NOT NULL,
      "materialId"       TEXT NOT NULL,
      "materialName"     TEXT NOT NULL,
      "inventoryLotId"   TEXT NOT NULL,
      "lotNumber"        TEXT NOT NULL,
      "quantityExpected" DOUBLE PRECISION NOT NULL,
      "quantityCounted"  DOUBLE PRECISION NOT NULL,
      "variance"         DOUBLE PRECISION NOT NULL,
      "unit"             TEXT NOT NULL,
      "reason"           TEXT,
      "reasonOther"      TEXT,
      "performedById"    TEXT NOT NULL,
      "performedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "notes"            TEXT,
      CONSTRAINT "cycle_counts_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log("✓ Created cycle_counts");

  // ── 6. Update materials table ────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS "isTemperatureSensitive" BOOLEAN NOT NULL DEFAULT false
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS "coaRequired" BOOLEAN NOT NULL DEFAULT false
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS "minimumStockQuantity" DOUBLE PRECISION
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
      ADD COLUMN IF NOT EXISTS "minimumStockUnit" TEXT
  `);
  console.log("✓ Updated materials table with new columns");

  console.log("\nMigration v17 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v17 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
