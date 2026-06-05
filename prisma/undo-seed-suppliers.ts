/**
 * Undo script — reverses the supplier seed run from Supplier_Tracker_3.xlsx.
 *
 * Identifies seeded records by:
 *   - Suppliers: notes containing "Country of Origin: US"
 *
 * Deletes in safe order:
 *   1. supplier_materials links for seeded suppliers
 *   2. Materials created by the seed (if not referenced in batch sheet data)
 *   3. Suppliers (if no uploaded documents)
 *
 * Usage: npx tsx prisma/undo-seed-suppliers.ts
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const counts = {
  linksDeleted: 0,
  materialsDeleted: 0,
  materialsSkipped: 0,
  suppliersDeleted: 0,
  suppliersSkipped: 0,
  errors: [] as string[],
};

async function main() {
  // ── 1. Identify seeded suppliers ──────────────────────────────────────────

  const seededSuppliers = await prisma.supplier.findMany({
    where: { notes: { contains: "Country of Origin: US" } },
    select: { id: true, name: true },
  });

  if (seededSuppliers.length === 0) {
    console.log("No seeded suppliers found — nothing to undo.");
    return;
  }

  const seededIds = seededSuppliers.map((s) => s.id);
  console.log(`Found ${seededIds.length} seeded suppliers to undo.`);

  // ── 2. Collect material IDs linked to seeded suppliers ────────────────────

  const links = await prisma.supplierMaterial.findMany({
    where: { supplierId: { in: seededIds } },
    select: { id: true, materialId: true, supplierId: true },
  });

  const seededMaterialIds = [...new Set(links.map((l) => l.materialId))];
  console.log(`Found ${links.length} supplier-material links to delete.`);
  console.log(`Found ${seededMaterialIds.length} unique materials to evaluate.`);

  // ── 3. Delete supplier_materials links ────────────────────────────────────

  for (const link of links) {
    try {
      await prisma.supplierMaterial.delete({ where: { id: link.id } });
      counts.linksDeleted++;
    } catch (err) {
      const msg = `Link id=${link.id}: ${err instanceof Error ? err.message : String(err)}`;
      counts.errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }
  console.log(`  ✓ Deleted ${counts.linksDeleted} supplier-material links.`);

  // ── 4. Delete materials (if not referenced in batch sheet data) ───────────

  for (const materialId of seededMaterialIds) {
    // Check if this material ID appears anywhere in batch sheet template JSONB
    // (ingredients, packaging columns) or submission section3 JSONB.
    // We cast to text and do a substring search — safe and fast for a small set.
    const [templateHit] = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM batch_sheet_templates
      WHERE ingredients::text LIKE ${"%" + materialId + "%"}
         OR packaging::text   LIKE ${"%" + materialId + "%"}
    `;
    const [submissionHit] = await prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*) AS cnt
      FROM batch_sheet_submissions
      WHERE section3::text LIKE ${"%" + materialId + "%"}
    `;

    const inUse =
      (templateHit?.cnt ?? 0n) > 0n || (submissionHit?.cnt ?? 0n) > 0n;

    if (inUse) {
      counts.materialsSkipped++;
      console.warn(`  ⚠ Material id=${materialId} is referenced in batch sheet data — skipped.`);
      continue;
    }

    try {
      await prisma.material.delete({ where: { id: materialId } });
      counts.materialsDeleted++;
    } catch (err) {
      const msg = `Material id=${materialId}: ${err instanceof Error ? err.message : String(err)}`;
      counts.errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }
  console.log(`  ✓ Deleted ${counts.materialsDeleted} materials (${counts.materialsSkipped} skipped — in use).`);

  // ── 5. Delete suppliers (if no uploaded documents) ───────────────────────

  for (const supplier of seededSuppliers) {
    const docCount = await prisma.supplierDocument.count({
      where: { supplierId: supplier.id },
    });

    if (docCount > 0) {
      counts.suppliersSkipped++;
      console.warn(`  ⚠ Supplier "${supplier.name}" has ${docCount} document(s) — skipped.`);
      continue;
    }

    try {
      await prisma.supplier.delete({ where: { id: supplier.id } });
      counts.suppliersDeleted++;
      console.log(`  ✓ Supplier deleted: ${supplier.name}`);
    } catch (err) {
      const msg = `Supplier "${supplier.name}": ${err instanceof Error ? err.message : String(err)}`;
      counts.errors.push(msg);
      console.error(`  ✗ ${msg}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n=== UNDO SEED SUMMARY ===");
  console.log(`Supplier-material links deleted: ${counts.linksDeleted}`);
  console.log(`Materials deleted:               ${counts.materialsDeleted}`);
  console.log(`Materials skipped (in use):      ${counts.materialsSkipped}`);
  console.log(`Suppliers deleted:               ${counts.suppliersDeleted}`);
  console.log(`Suppliers skipped (has docs):    ${counts.suppliersSkipped}`);

  console.log("\n=== ERRORS ===");
  if (counts.errors.length === 0) {
    console.log("None");
  } else {
    counts.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
