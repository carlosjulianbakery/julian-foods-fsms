import { prisma } from "@/lib/prisma";
import { convertUnit } from "@/lib/unitConversion";

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

  const lotUnit = lots[0].unit;
  const minUnit = material.minimumStockUnit && material.minimumStockUnit !== ""
    ? material.minimumStockUnit
    : lotUnit;

  // Aggregate lot total (assumes all lots for a material share the same unit)
  const rawTotal = lots.reduce((sum, l) => sum + l.quantityRemaining, 0);

  let totalRemaining: number;
  if (lotUnit.trim().toLowerCase() === minUnit.trim().toLowerCase()) {
    totalRemaining = rawTotal;
  } else {
    const conv = convertUnit(rawTotal, lotUnit, minUnit);
    if (!conv.possible) {
      console.warn(
        `[stock-check] Unit conversion not possible for "${material.name}" (${materialId}): ` +
          `lots tracked in "${lotUnit}" but minimum set in "${minUnit}". Skipping low-stock check.`
      );
      return;
    }
    totalRemaining = conv.result;
  }

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
