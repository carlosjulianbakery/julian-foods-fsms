import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const LOT_ID = "cmqr6g9y7002gwluggwi4nyz2";
  const ADJUSTMENT = -709.42874816;
  const REF = "AUDIT-CORRECTION-FINAL-2026-07-07";

  const lot = await prisma.inventoryLot.findUnique({
    where: { id: LOT_ID },
    select: {
      id: true,
      materialId: true,
      materialName: true,
      lotNumber: true,
      unit: true,
      quantityRemaining: true,
      quantityReceived: true,
      expirationDate: true,
      isConditional: true,
    },
  });

  if (!lot) {
    console.error("Lot not found:", LOT_ID);
    process.exit(1);
  }

  console.log("Lot before:", {
    lotNumber: lot.lotNumber,
    materialName: lot.materialName,
    quantityRemaining: lot.quantityRemaining,
  });

  const newQty = Math.max(0, lot.quantityRemaining + ADJUSTMENT);

  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.create({
      data: {
        inventoryLotId: lot.id,
        materialId: lot.materialId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        movementType: "out_correction",
        quantity: ADJUSTMENT,
        unit: lot.unit,
        referenceType: "audit",
        referenceId: "audit-2026-07-07",
        referenceNumber: REF,
        quantityBefore: lot.quantityRemaining,
        quantityAfter: newQty,
        performedById: "system",
        notes:
          "Final correction after audit feedback loop — previous corrections over-applied due to formula bug now fixed.",
      },
    });

    const status =
      newQty <= 0
        ? "depleted"
        : lot.expirationDate && lot.expirationDate < new Date()
        ? "expired"
        : lot.isConditional
        ? "conditional"
        : "active";

    await tx.inventoryLot.update({
      where: { id: lot.id },
      data: { quantityRemaining: newQty, status },
    });
  });

  const updated = await prisma.inventoryLot.findUnique({
    where: { id: LOT_ID },
    select: { quantityRemaining: true, status: true },
  });

  console.log("Lot after:", updated);
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
