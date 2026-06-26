/**
 * migrate-v31: Retroactively fix stale lot statuses.
 *
 * Before this migration, the stored status column could fall out of sync when:
 *   - checkMaterialStockLevel wasn't called after receiving/initial-stock-entry
 *   - lots were depleted to 0 but status wasn't updated
 *   - checkMaterialStockLevel didn't handle the depleted→active rollback scenario
 */

import { PrismaClient } from "../src/generated/prisma";
import { calculateLotStatus, isMaterialBelowMinimum } from "../src/lib/inventoryUtils";

const prisma = new PrismaClient();

async function main() {
  // Fetch all lots that aren't in a manual/immutable state
  const lots = await prisma.inventoryLot.findMany({
    where: { status: { notIn: ["recalled", "quarantined"] } },
    select: {
      id: true, materialId: true, materialName: true, lotNumber: true,
      quantityRemaining: true, unit: true, status: true,
      expirationDate: true, isConditional: true,
      material: {
        select: { minimumStockQuantity: true, minimumStockUnit: true, unit: true },
      },
    },
  });

  // Group by material
  const byMaterial = new Map<string, typeof lots>();
  for (const lot of lots) {
    const arr = byMaterial.get(lot.materialId) ?? [];
    arr.push(lot);
    byMaterial.set(lot.materialId, arr);
  }

  let fixed = 0;
  const total = lots.length;

  for (const matLots of Array.from(byMaterial.values())) {
    const mat = matLots[0].material;
    const belowMin = isMaterialBelowMinimum(
      matLots.map((l: typeof lots[0]) => ({ quantityRemaining: l.quantityRemaining, unit: l.unit, status: l.status })),
      mat
    );

    for (const lot of matLots) {
      const computed = calculateLotStatus({
        quantityRemaining: lot.quantityRemaining,
        storedStatus:      lot.status,
        expirationDate:    lot.expirationDate,
        isConditional:     lot.isConditional,
        isMaterialBelowMin: belowMin,
      });

      // expiring_soon is display-only — store as "active" in DB
      const dbStatus = computed === "expiring_soon" ? "active" : computed;

      if (dbStatus !== lot.status) {
        await prisma.inventoryLot.update({
          where: { id: lot.id },
          data: { status: dbStatus },
        });
        console.log(`  Fixed ${lot.lotNumber} (${lot.materialName}): ${lot.status} → ${dbStatus}`);
        fixed++;
      }
    }
  }

  console.log(`\nDone. ${fixed} lots fixed out of ${total} total.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
