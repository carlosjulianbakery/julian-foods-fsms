/**
 * migrate-v30: Retroactively create inventory lots for existing WIP batch sheet submissions.
 *
 * Before this migration, WIP batch sheet submissions never created inventory lots.
 * Now they do (via createWipInventoryLot in /api/batch-sheet/route.ts).
 * This migration backfills those lots for all existing WIP submissions.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // Fetch all WIP materials with their source product
  const wipMaterials = await prisma.material.findMany({
    where: { materialType: "wip", sourceProductId: { not: null } },
    select: { id: true, name: true, unit: true, sourceProductId: true },
  });
  console.log(`Found ${wipMaterials.length} WIP materials`);

  for (const mat of wipMaterials) {
    if (!mat.sourceProductId) continue;

    // Find all finished submissions for this WIP product
    const submissions = await prisma.batchSheetSubmission.findMany({
      where: {
        productId: mat.sourceProductId,
        status: { in: ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"] },
        productionLot: { not: null },
      },
      orderBy: { submittedAt: "asc" },
      select: { id: true, productionLot: true, productionDate: true, section3: true, submittedById: true },
    });

    console.log(`  ${mat.name}: ${submissions.length} submissions`);

    for (const s of submissions) {
      if (!s.productionLot) continue;

      // Idempotency: skip if lot already exists
      const existing = await prisma.inventoryLot.findFirst({
        where: { materialId: mat.id, lotNumber: s.productionLot },
        select: { id: true },
      });
      if (existing) {
        console.log(`    ${s.productionLot}: already exists — skipping`);
        continue;
      }

      // Calculate output quantity from section3 ingredients
      const section3 = s.section3 as {
        ingredients?: Array<{ lots?: Array<{ qty_used_from_this_lot?: number }> }>;
      } | null;
      let totalQty = 0;
      for (const ing of section3?.ingredients ?? []) {
        for (const lot of ing.lots ?? []) totalQty += lot.qty_used_from_this_lot ?? 0;
      }

      const lot = await prisma.inventoryLot.create({
        data: {
          materialId:        mat.id,
          materialName:      mat.name,
          supplierName:      "Julian Bakery",
          supplierId:        null,
          lotNumber:         s.productionLot,
          quantityReceived:  totalQty,
          quantityRemaining: totalQty,
          unit:              mat.unit ?? "lb",
          receivedDate:      s.productionDate,
          status:            totalQty > 0 ? "active" : "depleted",
        },
      });

      await prisma.inventoryMovement.create({
        data: {
          inventoryLotId:  lot.id,
          materialId:      mat.id,
          materialName:    mat.name,
          lotNumber:       lot.lotNumber,
          movementType:    "in_receiving",
          quantity:        totalQty,
          unit:            lot.unit,
          referenceType:   "batch_sheet",
          referenceId:     s.id,
          referenceNumber: s.productionLot,
          quantityBefore:  0,
          quantityAfter:   totalQty,
          performedById:   s.submittedById,
        },
      });

      console.log(`    ${s.productionLot}: created lot (${totalQty} ${mat.unit ?? "lb"})`);
    }
  }

  console.log("\nDone.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
