import { prisma } from "@/lib/prisma";
import { convertUnit, aggregateInStandardUnit } from "@/lib/unitConversion";

export const EXPIRING_SOON_DAYS = 60;

const COUNTABLE_STATUSES = ["active", "low_stock", "conditional", "expiring_soon"];

// ─── Shared status calculation ─────────────────────────────────────────────────

/**
 * Single source of truth for lot status.
 *
 * Priority (highest wins):
 *   recalled / quarantined  → immutable manual states, always preserved
 *   depleted                → quantityRemaining <= 0
 *   expired                 → expirationDate in the past
 *   conditional             → lot.isConditional && quantity > 0
 *   expiring_soon           → expirationDate within EXPIRING_SOON_DAYS
 *   low_stock               → material total below minimum threshold
 *   active                  → everything else
 *
 * Note: "expiring_soon" is a display-only state; it is NOT stored in the DB.
 * When persisting, treat a result of "expiring_soon" as "active".
 */
export function calculateLotStatus(params: {
  quantityRemaining: number;
  storedStatus: string;
  expirationDate: Date | null;
  isConditional: boolean;
  isMaterialBelowMin: boolean;
}): string {
  const { quantityRemaining, storedStatus, expirationDate, isConditional, isMaterialBelowMin } = params;

  if (storedStatus === "recalled" || storedStatus === "quarantined") return storedStatus;
  if (quantityRemaining <= 0) return "depleted";

  if (expirationDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expirationDate < today) return "expired";
  }

  if (isConditional) return "conditional";

  if (expirationDate) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + EXPIRING_SOON_DAYS);
    cutoff.setHours(23, 59, 59, 999);
    if (expirationDate <= cutoff) return "expiring_soon";
  }

  if (isMaterialBelowMin) return "low_stock";
  return "active";
}

/**
 * Determines whether a material's total usable stock is below its configured minimum.
 * Lots with status recalled/quarantined/expired/depleted are excluded from the total.
 */
export function isMaterialBelowMinimum(
  lots: Array<{ quantityRemaining: number; unit: string; status: string }>,
  material: { minimumStockQuantity: number | null; minimumStockUnit: string | null; unit: string | null }
): boolean {
  if (material.minimumStockQuantity == null) return false;

  const countable = lots.filter((l) => COUNTABLE_STATUSES.includes(l.status) && l.quantityRemaining > 0);

  const standardUnit =
    material.unit && material.unit.trim() !== "" ? material.unit.trim() : countable[0]?.unit ?? "";
  if (!standardUnit) return false;

  const aggregated = aggregateInStandardUnit(
    countable.map((l) => ({ quantity: l.quantityRemaining, unit: l.unit })),
    standardUnit
  );
  if (!aggregated.possible) return false;

  const minUnit =
    material.minimumStockUnit && material.minimumStockUnit.trim() !== ""
      ? material.minimumStockUnit.trim()
      : standardUnit;

  let minimumInStandard: number;
  if (minUnit.toLowerCase() === standardUnit.toLowerCase()) {
    minimumInStandard = material.minimumStockQuantity;
  } else {
    const conv = convertUnit(material.minimumStockQuantity, minUnit, standardUnit);
    if (!conv.possible) return false;
    minimumInStandard = conv.result;
  }

  return aggregated.total < minimumInStandard;
}

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
  if (!material) return;

  const lots = await prisma.inventoryLot.findMany({
    where: { materialId, status: { notIn: ["recalled", "quarantined", "expired"] } },
    select: { id: true, quantityRemaining: true, unit: true, status: true, expirationDate: true, isConditional: true },
  });
  if (lots.length === 0) return;

  // Fix any lots whose quantityRemaining dropped to 0 but are still marked active/low_stock
  const depleted = lots.filter((l) => l.quantityRemaining <= 0 && l.status !== "depleted");
  if (depleted.length > 0) {
    await prisma.inventoryLot.updateMany({
      where: { id: { in: depleted.map((l) => l.id) } },
      data: { status: "depleted" },
    });
    // Remove from consideration for low_stock calc
    for (const l of depleted) l.status = "depleted";
  }

  if (material.minimumStockQuantity == null) return;

  // Re-use isMaterialBelowMinimum for the low_stock determination
  const belowMin = isMaterialBelowMinimum(lots, material);
  const targetStatus = belowMin ? "low_stock" : "active";

  // Only flip active ↔ low_stock on non-conditional, non-depleted lots
  const toUpdate = lots.filter(
    (l) => l.quantityRemaining > 0 && l.status !== "conditional" && l.status !== targetStatus
  );

  if (toUpdate.length > 0) {
    await prisma.inventoryLot.updateMany({
      where: { id: { in: toUpdate.map((l) => l.id) } },
      data: { status: targetStatus },
    });
  }
}
