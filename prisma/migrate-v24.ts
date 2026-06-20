import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  console.log("migrate-v24: create initial_stock_entries table");

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS initial_stock_entries (
      id                TEXT        NOT NULL PRIMARY KEY,
      "materialId"      TEXT        NOT NULL REFERENCES materials(id),
      "materialName"    TEXT        NOT NULL,
      "supplierId"      TEXT        REFERENCES suppliers(id),
      "supplierName"    TEXT        NOT NULL DEFAULT '',
      "brandId"         TEXT,
      "brandName"       TEXT,
      "lotNumber"       TEXT        NOT NULL,
      quantity          DOUBLE PRECISION NOT NULL,
      unit              TEXT        NOT NULL,
      "expirationDate"  DATE,
      "dateReceived"    DATE,
      notes             TEXT,
      "inventoryLotId"  TEXT        NOT NULL UNIQUE REFERENCES inventory_lots(id),
      "enteredById"     TEXT        NOT NULL REFERENCES users(id),
      "enteredAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  created initial_stock_entries");

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'initial_stock_entries'
    ORDER BY ordinal_position
  `;
  console.log("  columns:", cols.map((c) => c.column_name).join(", "));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
