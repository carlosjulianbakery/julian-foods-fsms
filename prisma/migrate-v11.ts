/**
 * Migration v11 — Smart document requirements engine
 *
 * 1. ADD is_gluten_free, has_special_risk, special_risk_types to materials
 * 2. ADD is_system_locked, trigger_type, trigger_condition to document_requirements
 * 3. Seed/update 14 locked system rules
 *
 * Run:
 *   npx tsx prisma/migrate-v11.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const SYSTEM_RULES = [
  // Supplier-level
  { name: "Signed Supplier Agreement", requirementType: "ONE_TIME" as const, sortOrder: 1, triggerType: "supplier_level", triggerCondition: "all_suppliers" },
  { name: "Letter of Good Manufacturing Practices", requirementType: "ONE_TIME" as const, sortOrder: 2, triggerType: "supplier_level", triggerCondition: "all_suppliers" },
  { name: "Third Party Audit", requirementType: "ANNUAL" as const, sortOrder: 3, triggerType: "supplier_level", triggerCondition: "all_suppliers" },
  // Material-level
  { name: "Certificate of Analysis (COA)", requirementType: "ANNUAL" as const, sortOrder: 4, triggerType: "material_level", triggerCondition: "all_materials" },
  { name: "Allergen Declaration", requirementType: "ONE_TIME" as const, sortOrder: 5, triggerType: "material_level", triggerCondition: "is_allergen" },
  { name: "Allergen Control Statement", requirementType: "ONE_TIME" as const, sortOrder: 6, triggerType: "material_level", triggerCondition: "is_allergen" },
  { name: "Organic Certificate", requirementType: "ANNUAL" as const, sortOrder: 7, triggerType: "material_level", triggerCondition: "is_organic" },
  { name: "Gluten Free Statement / Declaration", requirementType: "ONE_TIME" as const, sortOrder: 8, triggerType: "material_level", triggerCondition: "is_gluten_free" },
  { name: "Pesticide Residue Test", requirementType: "ANNUAL" as const, sortOrder: 9, triggerType: "material_level", triggerCondition: "special_risk:Pesticide Residues" },
  { name: "Heavy Metal Test", requirementType: "ANNUAL" as const, sortOrder: 10, triggerType: "material_level", triggerCondition: "special_risk:Heavy Metal Contamination" },
  { name: "Mycotoxin Test", requirementType: "ANNUAL" as const, sortOrder: 11, triggerType: "material_level", triggerCondition: "special_risk:Mycotoxin Risk" },
  { name: "Microbiological Risk Assessment", requirementType: "ANNUAL" as const, sortOrder: 12, triggerType: "material_level", triggerCondition: "special_risk:Microbiological Risk" },
  { name: "Cross-Contamination Risk Assessment", requirementType: "ONE_TIME" as const, sortOrder: 13, triggerType: "material_level", triggerCondition: "special_risk:Cross-Contamination Risk" },
  { name: "Special Risk Documentation", requirementType: "ANNUAL" as const, sortOrder: 14, triggerType: "material_level", triggerCondition: "special_risk:Other" },
] as const;

async function main() {
  // 1. materials: isGlutenFree
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS "isGlutenFree" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added isGlutenFree to materials");

  // 2. materials: hasSpecialRisk
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS "hasSpecialRisk" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added hasSpecialRisk to materials");

  // 3. materials: specialRiskTypes
  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials
    ADD COLUMN IF NOT EXISTS "specialRiskTypes" JSONB
  `);
  console.log("✓ Added specialRiskTypes to materials");

  // 4. document_requirements: isSystemLocked
  await prisma.$executeRawUnsafe(`
    ALTER TABLE document_requirements
    ADD COLUMN IF NOT EXISTS "isSystemLocked" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added isSystemLocked to document_requirements");

  // 5. document_requirements: triggerType
  await prisma.$executeRawUnsafe(`
    ALTER TABLE document_requirements
    ADD COLUMN IF NOT EXISTS "triggerType" TEXT
  `);
  console.log("✓ Added triggerType to document_requirements");

  // 6. document_requirements: triggerCondition
  await prisma.$executeRawUnsafe(`
    ALTER TABLE document_requirements
    ADD COLUMN IF NOT EXISTS "triggerCondition" TEXT
  `);
  console.log("✓ Added triggerCondition to document_requirements");

  // 7. Seed / update 14 locked system rules
  for (const rule of SYSTEM_RULES) {
    const existing = await prisma.documentRequirement.findFirst({
      where: { name: rule.name },
    });

    if (existing) {
      await prisma.documentRequirement.update({
        where: { id: existing.id },
        data: {
          isSystemLocked: true,
          triggerType: rule.triggerType,
          triggerCondition: rule.triggerCondition,
          sortOrder: rule.sortOrder,
          requirementType: rule.requirementType,
          isRequired: true,
          isActive: true,
        },
      });
      console.log(`✓ Updated existing rule: ${rule.name}`);
    } else {
      await prisma.documentRequirement.create({
        data: {
          name: rule.name,
          requirementType: rule.requirementType,
          isRequired: true,
          isActive: true,
          isSystemLocked: true,
          triggerType: rule.triggerType,
          triggerCondition: rule.triggerCondition,
          sortOrder: rule.sortOrder,
        },
      });
      console.log(`✓ Created rule: ${rule.name}`);
    }
  }

  console.log("\nAll 14 system rules seeded.");
}

main()
  .then(() => {
    console.log("Migration v11 complete ✓");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migration v11 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
