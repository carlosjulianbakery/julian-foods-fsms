/**
 * Migration v14 — In-House / WIP Materials
 *
 * 1. ADD "materialType" TEXT NOT NULL DEFAULT 'raw' to materials
 * 2. ADD "sourceProductId" TEXT NULL to materials
 * 3. ADD "supplierType" TEXT NOT NULL DEFAULT 'ingredient' to suppliers
 * 4. ADD "isSystemLocked" BOOLEAN NOT NULL DEFAULT false to suppliers
 * 5. ADD "isWipMaterial" BOOLEAN NOT NULL DEFAULT false to products
 * 6. Backfill: materialType = 'packaging' for PACKAGING category materials
 * 7. Seed: create internal supplier "Julian Bakery (Internal Production)"
 * 8. Seed: create 4 WIP PreMix materials linked to that supplier
 * 9. Set isWipMaterial = true for matching products
 *
 * Run:
 *   npx tsx prisma/migrate-v14.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // ── Schema changes ──────────────────────────────────────────────────────────

  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS "materialType" TEXT NOT NULL DEFAULT 'raw'
  `);
  console.log("✓ Added materialType to materials");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE materials ADD COLUMN IF NOT EXISTS "sourceProductId" TEXT
  `);
  console.log("✓ Added sourceProductId to materials");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "supplierType" TEXT NOT NULL DEFAULT 'ingredient'
  `);
  console.log("✓ Added supplierType to suppliers");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "isSystemLocked" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added isSystemLocked to suppliers");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS "isWipMaterial" BOOLEAN NOT NULL DEFAULT false
  `);
  console.log("✓ Added isWipMaterial to products");

  // ── Backfill packaging materials ────────────────────────────────────────────

  await prisma.$executeRawUnsafe(`
    UPDATE materials SET "materialType" = 'packaging' WHERE category = 'PACKAGING' AND "materialType" = 'raw'
  `);
  console.log("✓ Backfilled materialType = 'packaging' for PACKAGING category materials");

  // ── Seed: internal supplier ─────────────────────────────────────────────────

  const internalSupplierName = "Julian Bakery (Internal Production)";
  let internalSupplier = await prisma.supplier.findFirst({
    where: { name: internalSupplierName },
  });

  if (!internalSupplier) {
    internalSupplier = await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`
      INSERT INTO suppliers (id, name, "supplierType", status, "isSystemLocked", "isActive", "createdAt", "updatedAt", notes)
      VALUES (
        gen_random_uuid()::text,
        '${internalSupplierName}',
        'internal',
        'APPROVED',
        true,
        true,
        NOW(),
        NOW(),
        'In-house production — no external documentation required'
      )
      RETURNING id, name
    `).then((rows) => rows[0]);
    console.log(`✓ Created internal supplier: ${internalSupplierName}`);
  } else {
    // Update existing to set supplierType and isSystemLocked if not already set
    await prisma.$executeRawUnsafe(`
      UPDATE suppliers SET "supplierType" = 'internal', "isSystemLocked" = true, status = 'APPROVED'
      WHERE name = '${internalSupplierName}'
    `);
    console.log(`✓ Internal supplier already exists — updated supplierType/isSystemLocked`);
  }

  // Re-fetch to get current id
  const internalSup = await prisma.supplier.findFirst({
    where: { name: internalSupplierName },
  });
  if (!internalSup) throw new Error("Failed to find/create internal supplier");

  // ── Seed: WIP PreMix materials ───────────────────────────────────────────────

  const wipMaterials = [
    "PreMix Powder — Egg Vanilla",
    "PreMix Powder — Pea Vanilla",
    "PreMix Powder — Egg Chocolate",
    "PreMix Powder — Egg Espresso",
  ];

  for (const matName of wipMaterials) {
    let material = await prisma.material.findFirst({ where: { name: matName } });

    // Find matching product
    const product = await prisma.product.findFirst({ where: { name: matName } });

    if (!material) {
      // Create the material
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`
        INSERT INTO materials (id, name, category, "materialType", "sourceProductId", "isOrganic", "isAllergen", "isGlutenFree", "hasSpecialRisk", "isActive", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          $1,
          'INGREDIENT',
          'wip',
          $2,
          false,
          false,
          false,
          false,
          true,
          NOW(),
          NOW()
        )
        RETURNING id
      `, matName, product?.id ?? null);
      material = { id: rows[0].id, name: matName } as typeof material;
      console.log(`✓ Created WIP material: ${matName}`);
    } else {
      // Update existing material to set materialType and sourceProductId
      await prisma.$executeRawUnsafe(`
        UPDATE materials SET "materialType" = 'wip', "sourceProductId" = $1
        WHERE name = $2
      `, product?.id ?? null, matName);
      console.log(`✓ WIP material already exists — updated materialType: ${matName}`);
    }

    if (!material) continue;

    // Create supplier_materials link if not exists
    const existingLink = await prisma.supplierMaterial.findFirst({
      where: { supplierId: internalSup.id, materialId: material.id },
    });
    if (!existingLink) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO supplier_materials (id, "supplierId", "materialId", "createdAt")
        VALUES (gen_random_uuid()::text, $1, $2, NOW())
        ON CONFLICT ("supplierId", "materialId") DO NOTHING
      `, internalSup.id, material.id);
      console.log(`  ✓ Linked ${matName} to internal supplier`);
    } else {
      console.log(`  ✓ Supplier link already exists for: ${matName}`);
    }

    // Set isWipMaterial = true for matching product
    if (product) {
      await prisma.$executeRawUnsafe(`
        UPDATE products SET "isWipMaterial" = true WHERE name = $1
      `, matName);
      console.log(`  ✓ Set isWipMaterial = true for product: ${matName}`);
    }
  }

  console.log("\nMigration v14 complete ✓");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration v14 failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
