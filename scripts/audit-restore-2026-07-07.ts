/**
 * Restores 6 inventory lots to their correct balances after bad AUDIT-CORRECTION
 * movements were applied on 2026-07-07T22:05.
 *
 * Root cause: the audit formula filtered correction movements to AUDIT-CORRECTION
 * only, so lots already fixed by UNIT-CORRECTION/FLOOR-CORRECTION were re-flagged
 * and double-corrected. Additionally, the POST handler stored the raw discrepancy
 * as the movement quantity even when quantityAfter was clamped, violating the
 * before + qty = after invariant.
 *
 * Restore targets = quantityBefore of the bad AUDIT-CORRECTION-2026-07-07 movement
 * for each lot (i.e., the correct pre-bad-correction balance).
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const ADMIN_ID = "cmpepw1u800006o65ewxhpyhw"; // Carlos Gomory
const REF = "AUDIT-CORRECTION-RESTORE-2026-07-07";
const TOLERANCE = 0.001;

const RESTORES = [
  {
    id: "cmqu2vp5a000ul2fd7i4rebva",
    lotNumber: "210124-FG",
    materialName: "Organic Black Pepper",
    unit: "lb",
    expectedWrong: 55.0,
    target: 54.7509,
  },
  {
    id: "cmqu2xelj0011l2fdwdnwm0jg",
    lotNumber: "11221999000385",
    materialName: "Organic Cinnamon",
    unit: "lb",
    expectedWrong: 25.0,
    target: 324.0276,
  },
  {
    id: "cmqu2jq3a000r3g2jreqv9qvu",
    lotNumber: "BB10/14/2027",
    materialName: "Organic Garlic Powder",
    unit: "lb",
    expectedWrong: 25.0,
    target: 24.4378,
  },
  {
    id: "cmqu2ld64000y3g2je1o6q44r",
    lotNumber: "2001496",
    materialName: "Organic Paprika",
    unit: "lb",
    expectedWrong: 20.0,
    target: 19.7244,
  },
  {
    id: "cmqu2pefh0002l2fdt6dquy02",
    lotNumber: "1ADB 0055625692",
    materialName: "Sea Salt",
    unit: "lb",
    expectedWrong: 25.0,
    target: 14.8808,
  },
  {
    id: "cmqu1pu85000292d9izarx593",
    lotNumber: "AIFSBF02401-9",
    materialName: "Soluble Dextrin Fiber",
    unit: "kg",
    expectedWrong: 1400.0,
    target: 1363.4741,
  },
];

function computeStatus(
  lot: { expirationDate: Date | null; isConditional: boolean },
  qty: number
): string {
  if (qty <= 0) return "depleted";
  if (lot.expirationDate && lot.expirationDate < new Date()) return "expired";
  if (lot.isConditional) return "conditional";
  return "active";
}

async function main() {
  console.log("=== AUDIT RESTORE 2026-07-07 ===\n");

  // Pre-flight: fetch current state of all lots
  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: RESTORES.map((r) => r.id) } },
    select: {
      id: true, materialId: true, materialName: true, lotNumber: true,
      unit: true, quantityRemaining: true, expirationDate: true, isConditional: true,
    },
  });
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  console.log("Pre-flight state:");
  for (const r of RESTORES) {
    const lot = lotMap.get(r.id);
    if (!lot) { console.log(`  ❌ NOT FOUND: ${r.lotNumber}`); continue; }
    const diff = Math.abs(lot.quantityRemaining - r.expectedWrong);
    const ok = diff <= TOLERANCE ? "✓" : `⚠️  (expected wrong=${r.expectedWrong}, got=${lot.quantityRemaining})`;
    console.log(`  ${ok} ${r.materialName} | ${r.lotNumber} | current=${lot.quantityRemaining} ${r.unit}`);
  }

  console.log("\nApplying restorations in single transaction...");

  await prisma.$transaction(async (tx) => {
    for (const r of RESTORES) {
      const lot = lotMap.get(r.id);
      if (!lot) throw new Error(`Lot not found: ${r.id} (${r.lotNumber})`);

      const qtyBefore = lot.quantityRemaining;
      const adj = r.target - qtyBefore;
      if (Math.abs(adj) < TOLERANCE) {
        console.log(`  ⏭  ${r.materialName}: already at target (${qtyBefore} ${r.unit})`);
        continue;
      }

      const movementType = adj > 0 ? "in_correction" : "out_correction";
      const newQty = r.target;

      await tx.inventoryMovement.create({
        data: {
          inventoryLotId: r.id,
          materialId: lot.materialId,
          materialName: lot.materialName,
          lotNumber: lot.lotNumber,
          movementType,
          quantity: adj,
          unit: r.unit,
          referenceType: "audit",
          referenceId: `audit-restore-2026-07-07`,
          referenceNumber: REF,
          quantityBefore: qtyBefore,
          quantityAfter: newQty,
          performedById: ADMIN_ID,
          notes: `Restoring correct inventory level after audit feedback loop and incorrect correction amounts on 2026-07-07. All previous AUDIT-CORRECTION movements for this lot were incorrect. Delta: ${adj > 0 ? "+" : ""}${adj.toFixed(4)} ${r.unit} (${qtyBefore.toFixed(4)} → ${newQty.toFixed(4)}).`,
        },
      });

      await tx.inventoryLot.update({
        where: { id: r.id },
        data: {
          quantityRemaining: newQty,
          status: computeStatus(lot, newQty),
        },
      });

      console.log(
        `  ✅ ${r.materialName} | ${r.lotNumber}: ${qtyBefore.toFixed(4)} → ${newQty.toFixed(4)} ${r.unit} (${adj > 0 ? "+" : ""}${adj.toFixed(4)})`
      );
    }
  });

  console.log("\nVerifying post-restore state:");
  const after = await prisma.inventoryLot.findMany({
    where: { id: { in: RESTORES.map((r) => r.id) } },
    select: { id: true, lotNumber: true, materialName: true, quantityRemaining: true, unit: true },
  });
  for (const r of RESTORES) {
    const lot = after.find((l) => l.id === r.id);
    if (!lot) continue;
    const ok = Math.abs(lot.quantityRemaining - r.target) <= TOLERANCE ? "✓" : "❌";
    console.log(`  ${ok} ${r.materialName} | ${r.lotNumber}: ${lot.quantityRemaining} ${r.unit} (target=${r.target})`);
  }

  console.log("\nDone. Run GET /api/admin/inventory-audit to verify clean.");
}

main()
  .catch((e) => { console.error("FATAL:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
