/**
 * migrate-v32: Create stock_alert_acknowledgments table.
 *
 * Allows supervisors and admins to acknowledge stock alerts with an optional note
 * and an expiry date (default 7 days), so alerts don't stay hidden forever.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS stock_alert_acknowledgments (
      id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "materialId"      TEXT        NOT NULL REFERENCES materials(id),
      "alertType"       TEXT        NOT NULL,
      "acknowledgedById" TEXT       NOT NULL REFERENCES users(id),
      "acknowledgedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
      note              TEXT,
      "isResolved"      BOOLEAN     NOT NULL DEFAULT false,
      "resolvedAt"      TIMESTAMPTZ,
      "expiresAt"       TIMESTAMPTZ
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saa_material ON stock_alert_acknowledgments ("materialId");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_saa_expires ON stock_alert_acknowledgments ("expiresAt") WHERE "isResolved" = false;
  `);

  console.log("✓ stock_alert_acknowledgments table created");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
