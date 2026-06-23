import { prisma } from "@/lib/prisma";

const COUNTABLE_STATUSES = ["active", "low_stock", "conditional"];

/**
 * Recalculates whether a material is below its minimum stock level by
 * summing quantity_remaining across all active/low_stock/conditional lots.
 * Updates lot statuses to "low_stock" or "active" accordingly.
 * Does NOT touch expired, depleted, quarantined, or recalled lots.
 * Does NOT touch conditional lots (only includes them in the total).
 */
export async function checkMaterialStockLevel(materialId: string): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { minimumStockQuantity: true, minimumStockUnit: true, name: true },
  });
  if (!material || material.minimumStockQuantity == null) return;

  const lots = await prisma.inventoryLot.findMany({
    where: { materialId, status: { in: COUNTABLE_STATUSES } },
    select: { id: true, quantityRemaining: true, unit: true, status: true },
  });

  if (lots.length === 0) return;

  // Unit mismatch check — skip comparison if units are inconsistent
  const lotUnit = lots[0].unit;
  const hasUnitMismatch =
    lots.some((l) => l.unit !== lotUnit) ||
    (material.minimumStockUnit != null &&
      material.minimumStockUnit !== "" &&
      material.minimumStockUnit !== lotUnit);

  if (hasUnitMismatch) {
    console.warn(
      `[stock-check] Unit mismatch for "${material.name}" (${materialId}): ` +
        `minimum set in "${material.minimumStockUnit}" but lots tracked with varying units. Skipping low-stock check.`
    );
    return;
  }

  const totalRemaining = lots.reduce((sum, l) => sum + l.quantityRemaining, 0);
  const isBelowMinimum = totalRemaining < material.minimumStockQuantity;
  const targetStatus = isBelowMinimum ? "low_stock" : "active";

  // Only flip active ↔ low_stock; leave conditional lots alone
  const toUpdate = lots.filter(
    (l) => l.status !== "conditional" && l.status !== targetStatus
  );

  if (toUpdate.length > 0) {
    await prisma.inventoryLot.updateMany({
      where: { id: { in: toUpdate.map((l) => l.id) } },
      data: { status: targetStatus },
    });
  }
}
