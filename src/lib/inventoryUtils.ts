import { prisma } from "@/lib/prisma";
import { convertUnit, aggregateInStandardUnit } from "@/lib/unitConversion";

const COUNTABLE_STATUSES = ["active", "low_stock", "conditional"];

/**
 * Recalculates whether a material is below its minimum stock level.
 *
 * Each lot is converted to the material's standard unit (materials.unit)
 * before summing, so mixed-unit lots are handled correctly.
 * The minimum threshold is also converted to standard unit before comparison.
 *
 * Updates lot statuses to "low_stock" or "active" accordingly.
 * Does NOT touch expired, depleted, quarantined, or recalled lots.
 * Does NOT touch conditional lots (only includes them in the total).
 */
export async function checkMaterialStockLevel(materialId: string): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { minimumStockQuantity: true, minimumStockUnit: true, unit: true, name: true },
  });
  if (!material || material.minimumStockQuantity == null) return;

  const lots = await prisma.inventoryLot.findMany({
    where: { materialId, status: { in: COUNTABLE_STATUSES } },
    select: { id: true, quantityRemaining: true, unit: true, status: true },
  });

  if (lots.length === 0) return;

  // Use the material's registry standard unit as the aggregation pivot.
  // Fall back to the first lot's unit if no standard unit is set.
  const standardUnit =
    material.unit && material.unit.trim() !== ""
      ? material.unit.trim()
      : lots[0].unit;

  // Aggregate all lots in standard unit, handling mixed-unit lots correctly
  const aggregated = aggregateInStandardUnit(
    lots.map((l) => ({ quantity: l.quantityRemaining, unit: l.unit })),
    standardUnit
  );

  if (!aggregated.possible) {
    console.warn(
      `[stock-check] Cannot aggregate lots for "${material.name}" (${materialId}): ` +
        `unit family mismatches for [${aggregated.mismatches.join(", ")}]. Skipping.`
    );
    return;
  }

  // Convert the minimum threshold to standard unit
  const minUnit =
    material.minimumStockUnit && material.minimumStockUnit.trim() !== ""
      ? material.minimumStockUnit.trim()
      : standardUnit;

  let minimumInStandard: number;
  if (minUnit.toLowerCase() === standardUnit.toLowerCase()) {
    minimumInStandard = material.minimumStockQuantity;
  } else {
    const conv = convertUnit(material.minimumStockQuantity, minUnit, standardUnit);
    if (!conv.possible) {
      console.warn(
        `[stock-check] Cannot convert minimum unit "${minUnit}" to standard unit "${standardUnit}" ` +
          `for "${material.name}" (${materialId}). Skipping.`
      );
      return;
    }
    minimumInStandard = conv.result;
  }

  const isBelowMinimum = aggregated.total < minimumInStandard;
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
