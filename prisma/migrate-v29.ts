/**
 * migrate-v29.ts
 *
 * Adds the forecast_exclusions table so admins can manually exclude specific
 * productions from the Ingredient Forecast without affecting the production
 * schedule itself.
 *
 * Idempotent — safe to run multiple times.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "forecast_exclusions" (
      "id"              TEXT NOT NULL PRIMARY KEY,
      "excludedById"    TEXT NOT NULL,
      "excludedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "productionDate"  DATE NOT NULL,
      "productName"     TEXT NOT NULL,
      "productId"       TEXT,
      "baseUnitCount"   INTEGER,
      "reason"          TEXT,
      "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "forecast_exclusions_excludedById_fkey"
        FOREIGN KEY ("excludedById") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "forecast_exclusions_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "products"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);

  console.log("Migration v29 complete ✓ — forecast_exclusions table created.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Migration v29 failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
