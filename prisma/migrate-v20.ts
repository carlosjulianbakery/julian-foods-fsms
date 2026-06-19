/**
 * Migration v20 — Per-delivery document requirements & obligation tracking
 *
 * Changes:
 *   1. Add PER_DELIVERY to RequirementType enum
 *   2. Make requirementId nullable on supplier_documents
 *   3. Add receivingRecordId, lotNumber to supplier_documents
 *   4. Create per_delivery_obligations table
 *   5. Orphan documents from old locked rules
 *   6. Delete old locked system rules
 *   7. Insert 9 new locked system rules
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.NEON_DATABASE_URL } },
});

async function main() {
  console.log("Running migration v20: per-delivery document requirements…");

  // a) Add PER_DELIVERY enum value
  await prisma.$executeRawUnsafe(
    `ALTER TYPE "RequirementType" ADD VALUE IF NOT EXISTS 'PER_DELIVERY'`
  );
  console.log("✓ Added PER_DELIVERY to RequirementType enum");

  // b) Make requirementId nullable on supplier_documents
  await prisma.$executeRawUnsafe(
    `ALTER TABLE supplier_documents ALTER COLUMN "requirementId" DROP NOT NULL`
  );
  console.log("✓ Made requirementId nullable on supplier_documents");

  // c) Add new columns to supplier_documents
  await prisma.$executeRawUnsafe(
    `ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS "receivingRecordId" TEXT REFERENCES receiving_records(id)`
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE supplier_documents ADD COLUMN IF NOT EXISTS "lotNumber" TEXT`
  );
  console.log("✓ Added receivingRecordId, lotNumber to supplier_documents");

  // d) Create per_delivery_obligations table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS per_delivery_obligations (
      id TEXT NOT NULL PRIMARY KEY,
      "supplierId" TEXT NOT NULL REFERENCES suppliers(id),
      "materialId" TEXT NOT NULL REFERENCES materials(id),
      "receivingRecordId" TEXT NOT NULL REFERENCES receiving_records(id),
      "lotNumber" TEXT NOT NULL,
      "requirementId" TEXT NOT NULL REFERENCES document_requirements(id),
      status TEXT NOT NULL DEFAULT 'pending',
      "documentId" TEXT UNIQUE REFERENCES supplier_documents(id),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "fulfilledAt" TIMESTAMP(3)
    )
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS per_delivery_obl_rcv_req_key ON per_delivery_obligations("receivingRecordId", "requirementId")`
  );
  console.log("✓ Created per_delivery_obligations table");

  // e) Orphan documents from old locked rules that will be deleted
  await prisma.$executeRawUnsafe(`
    UPDATE supplier_documents
    SET "requirementId" = NULL
    WHERE "requirementId" IN (
      SELECT id FROM document_requirements
      WHERE "isSystemLocked" = true
      AND name IN (
        'Letter of Good Manufacturing Practices',
        'Allergen Control Statement',
        'Pesticide Residue Test',
        'Heavy Metal Test',
        'Mycotoxin Test',
        'Microbiological Risk Assessment',
        'Cross-Contamination Risk Assessment',
        'Special Risk Documentation'
      )
    )
  `);
  console.log("✓ Orphaned documents from old locked rules");

  // f) Delete old locked system rules
  await prisma.$executeRawUnsafe(`
    DELETE FROM document_requirements
    WHERE "isSystemLocked" = true
    AND name IN (
      'Letter of Good Manufacturing Practices',
      'Allergen Control Statement',
      'Pesticide Residue Test',
      'Heavy Metal Test',
      'Mycotoxin Test',
      'Microbiological Risk Assessment',
      'Cross-Contamination Risk Assessment',
      'Special Risk Documentation'
    )
  `);
  console.log("✓ Deleted old locked system rules");

  // g) Insert 9 new locked rules (idempotent via WHERE NOT EXISTS)
  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Signed Supplier Agreement', 'ONE_TIME', true, true, 1, true, 'supplier_level', 'all_suppliers', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Signed Supplier Agreement' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'W-9', 'ONE_TIME', true, true, 2, true, 'supplier_level', 'all_suppliers', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'W-9' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Third Party Audit', 'ANNUAL', true, true, 3, true, 'supplier_level', 'all_suppliers', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Third Party Audit' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Gluten Free Statement', 'ONE_TIME', true, true, 4, true, 'material_level', 'is_gluten_free', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Gluten Free Statement' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Nutritional Information', 'ONE_TIME', true, true, 5, true, 'material_level', 'raw_ingredient', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Nutritional Information' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Certificate of Analysis (COA)', 'PER_DELIVERY', true, true, 6, true, 'material_level', 'coa_required', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Certificate of Analysis (COA)' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Organic Certificate', 'ANNUAL', true, true, 7, true, 'material_level', 'is_organic', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Organic Certificate' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Allergen Statement', 'ONE_TIME', true, true, 8, true, 'material_level', 'is_allergen', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Allergen Statement' AND "isSystemLocked" = true)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO document_requirements (id, name, "requirementType", "isRequired", "isActive", "sortOrder", "isSystemLocked", "triggerType", "triggerCondition", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Special Risk Document', 'PER_DELIVERY', true, true, 9, true, 'material_level', 'has_special_risk', NOW(), NOW()
    WHERE NOT EXISTS (SELECT 1 FROM document_requirements WHERE name = 'Special Risk Document' AND "isSystemLocked" = true)
  `);

  console.log("✓ Inserted 9 new system locked rules");
  console.log("Migration v20 complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
