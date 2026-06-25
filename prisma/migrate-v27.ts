/**
 * migrate-v27.ts
 *
 * Adds "Product Specifications" as a new locked supplier-level
 * document requirement (one_time, all_suppliers, isSystemLocked=true).
 *
 * Idempotent — safe to run multiple times.
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Product Specifications', 'ONE_TIME', true, true, 4, true, 'supplier_level', 'all_suppliers', NOW(), NOW()
    WHERE NOT EXISTS (
      SELECT 1 FROM document_requirements
      WHERE LOWER(name) = 'product specifications'
    )
  `);

  console.log("Migration v27 complete ✓  — Product Specifications requirement added (or already existed).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("Migration v27 failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
