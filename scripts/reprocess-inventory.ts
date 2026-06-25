/**
 * One-time retroactive inventory deduction script.
 * Run: npx tsx scripts/reprocess-inventory.ts
 *
 * Finds all finished batch sheet submissions that have no inventory_movements,
 * then deducts ingredient and packaging lots from inventory and creates movements.
 *
 * Safety: checks for duplicate movements per lot before inserting.
 */

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const FINISHED_STATUSES = ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"];

// ─── Types mirroring section3 JSONB structure ────────────────────────────────

type IngLotEntry = {
  lot_id?: string | null;
  inventory_lot_id?: string | null;
  qty_used?: number;
  qty_used_from_this_lot?: number;
  unit?: string;
};

type IngEntry = {
  use_inventory?: boolean;
  lots?: IngLotEntry[];
  inventory_lots?: IngLotEntry[];
};

type PkgLotEntry = {
  inventory_lot_id?: string | null;
  qty_used?: number | null;
  unit?: string | null;
};

type PkgMatEntry = { lots?: PkgLotEntry[] };
type PkgPresEntry = { selected?: boolean; materials?: PkgMatEntry[] };

type Section3 = {
  ingredients?: IngEntry[];
  presentations?: PkgPresEntry[];
};

// ─── Per-submission deduction ─────────────────────────────────────────────────

async function processSubmission(sub: {
  id: string;
  templateName: string;
  productionLot: string | null;
  productionDate: Date;
  status: string;
  submittedById: string;
  section3: unknown;
}): Promise<{ ingredientsDeducted: number; packagingDeducted: number; movementsCreated: number }> {
  const s3 = sub.section3 as Section3 | null;
  const refNumber = sub.productionLot ?? sub.id.slice(0, 8).toUpperCase();
  let ingredientsDeducted = 0;
  let packagingDeducted = 0;
  let movementsCreated = 0;

  // ── Collect all lots to deduct ───────────────────────────────────────────────
  type DeductJob = { lotId: string; qtyUsed: number; unit?: string; kind: "ingredient" | "packaging" };
  const jobs: DeductJob[] = [];

  // Ingredients
  const ingredients = s3?.ingredients ?? [];
  for (const ing of ingredients) {
    const rawEntries = ing.lots?.length
      ? ing.lots
      : ing.use_inventory
      ? (ing.inventory_lots ?? [])
      : [];
    for (const lotEntry of rawEntries) {
      const lotId = lotEntry.inventory_lot_id ?? lotEntry.lot_id ?? null;
      const qtyUsed = lotEntry.qty_used_from_this_lot ?? lotEntry.qty_used ?? 0;
      if (!lotId || !qtyUsed) continue;
      jobs.push({ lotId, qtyUsed, unit: lotEntry.unit, kind: "ingredient" });
    }
  }

  // Packaging
  const presentations = s3?.presentations ?? [];
  for (const pres of presentations) {
    if (!pres.selected) continue;
    for (const mat of pres.materials ?? []) {
      for (const lotEntry of mat.lots ?? []) {
        const lotId = lotEntry.inventory_lot_id ?? null;
        const qtyUsed = lotEntry.qty_used ?? 0;
        if (!lotId || !qtyUsed) continue;
        jobs.push({ lotId, qtyUsed, unit: lotEntry.unit ?? undefined, kind: "packaging" });
      }
    }
  }

  if (jobs.length === 0) {
    console.log("    (no inventory lots to deduct)");
    return { ingredientsDeducted: 0, packagingDeducted: 0, movementsCreated: 0 };
  }

  // ── Run each job ─────────────────────────────────────────────────────────────
  for (const job of jobs) {
    // Safety: check for duplicate movement
    const existing = await prisma.inventoryMovement.findFirst({
      where: {
        referenceType:  "batch_sheet",
        referenceId:    sub.id,
        inventoryLotId: job.lotId,
      },
    });
    if (existing) {
      console.log(`    ⚠ Already processed lot ${job.lotId} — skipping duplicate`);
      continue;
    }

    const lot = await prisma.inventoryLot.findUnique({ where: { id: job.lotId } });
    if (!lot) {
      console.log(`    ⚠ Lot ${job.lotId} not found in DB — skipping`);
      continue;
    }

    const qtyBefore = lot.quantityRemaining;
    let newQty = qtyBefore - job.qtyUsed;
    if (newQty < 0) {
      console.log(
        `    ⚠ Lot ${lot.lotNumber} for ${lot.materialName} would go negative ` +
        `(${qtyBefore} - ${job.qtyUsed} = ${newQty.toFixed(4)}) — set to 0. Manual review needed.`
      );
      newQty = 0;
    }

    const newStatus =
      newQty <= 0
        ? "depleted"
        : lot.expirationDate && lot.expirationDate < new Date()
        ? "expired"
        : lot.isConditional
        ? "conditional"
        : "active";

    await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          inventoryLotId:  lot.id,
          materialId:      lot.materialId,
          materialName:    lot.materialName,
          lotNumber:       lot.lotNumber,
          movementType:    "out_batch_sheet",
          quantity:        -Math.abs(job.qtyUsed),
          unit:            job.unit || lot.unit,
          referenceType:   "batch_sheet",
          referenceId:     sub.id,
          referenceNumber: refNumber,
          quantityBefore:  qtyBefore,
          quantityAfter:   newQty,
          performedById:   sub.submittedById,
        },
      }),
      prisma.inventoryLot.update({
        where: { id: lot.id },
        data:  { quantityRemaining: newQty, status: newStatus },
      }),
    ]);

    movementsCreated++;
    if (job.kind === "ingredient") ingredientsDeducted++;
    else packagingDeducted++;
  }

  return { ingredientsDeducted, packagingDeducted, movementsCreated };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════");
  console.log(" Retroactive Inventory Deduction");
  console.log("═══════════════════════════════════════\n");

  // Find all finished submissions with no inventory_movements
  const allFinished = await prisma.batchSheetSubmission.findMany({
    where: { status: { in: FINISHED_STATUSES as ("COMPLETE" | "PASS" | "PASS_WITH_ISSUES" | "FAIL")[] } },
    select: {
      id: true, templateName: true, productionLot: true, productionDate: true,
      status: true, submittedById: true, section3: true,
    },
    orderBy: { submittedAt: "asc" },
  });

  const unprocessed: typeof allFinished = [];
  for (const sub of allFinished) {
    const count = await prisma.inventoryMovement.count({
      where: { referenceType: "batch_sheet", referenceId: sub.id },
    });
    if (count === 0) unprocessed.push(sub);
  }

  console.log(`Found ${unprocessed.length} submissions to reprocess (of ${allFinished.length} finished).\n`);

  if (unprocessed.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let totalIngredients = 0;
  let totalPackaging = 0;
  let totalMovements = 0;
  let totalErrors = 0;

  for (const sub of unprocessed) {
    const dateStr = sub.productionDate.toISOString().slice(0, 10);
    console.log(`Processing ${sub.templateName} ${sub.productionLot ?? "(no lot)"} (${dateStr}) [${sub.status}]...`);
    try {
      const { ingredientsDeducted, packagingDeducted, movementsCreated } =
        await processSubmission(sub);
      console.log(`  ✓ Ingredients: ${ingredientsDeducted} lots deducted`);
      console.log(`  ✓ Packaging:   ${packagingDeducted} lots deducted`);
      console.log(`  ✓ Movements created: ${movementsCreated}`);
      totalIngredients += ingredientsDeducted;
      totalPackaging += packagingDeducted;
      totalMovements += movementsCreated;
    } catch (err) {
      console.error(`  ✗ ERROR:`, err instanceof Error ? err.message : err);
      totalErrors++;
    }
    console.log();
  }

  console.log("═══════════════════════════════════════");
  console.log(" Summary");
  console.log("═══════════════════════════════════════");
  console.log(`Submissions processed:  ${unprocessed.length}`);
  console.log(`Ingredient lots:        ${totalIngredients}`);
  console.log(`Packaging lots:         ${totalPackaging}`);
  console.log(`Total movements created:${totalMovements}`);
  if (totalErrors > 0) console.log(`Errors:                 ${totalErrors}`);

  // ── Verification queries ─────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log(" Verification");
  console.log("═══════════════════════════════════════");

  const movementSummary = await prisma.inventoryMovement.groupBy({
    by: ["movementType"],
    where: { movementType: "out_batch_sheet" },
    _count: { id: true },
  });
  const distinctSubs = await prisma.inventoryMovement.findMany({
    where: { movementType: "out_batch_sheet" },
    select: { referenceId: true },
    distinct: ["referenceId"],
  });
  console.log(`\nQuery 1 — out_batch_sheet movements in DB:`);
  for (const row of movementSummary) {
    console.log(`  movement_type=${row.movementType}  count=${row._count.id}  submissions_processed=${distinctSubs.length}`);
  }

  const sample = await prisma.$queryRaw<Array<{
    lot: string; material: string; lot_number: string;
    quantity: number; qty_before: number; qty_after: number; performed_at: Date;
  }>>`
    SELECT
      im."referenceNumber" AS lot,
      m.name               AS material,
      il."lotNumber"       AS lot_number,
      im.quantity,
      im."quantityBefore"  AS qty_before,
      im."quantityAfter"   AS qty_after,
      im."performedAt"     AS performed_at
    FROM inventory_movements im
    JOIN inventory_lots il ON im."inventoryLotId" = il.id
    JOIN materials m       ON il."materialId" = m.id
    WHERE im."movementType" = 'out_batch_sheet'
    ORDER BY im."performedAt" DESC
    LIMIT 20
  `;

  console.log("\nQuery 2 — Most recent 20 out_batch_sheet movements:");
  console.log(`${"Lot".padEnd(20)} ${"Material".padEnd(35)} ${"Lot#".padEnd(15)} ${"Qty".padStart(8)} ${"Before".padStart(9)} ${"After".padStart(9)}`);
  console.log("─".repeat(100));
  for (const row of sample) {
    console.log(
      `${(row.lot ?? "").padEnd(20)} ` +
      `${row.material.padEnd(35)} ` +
      `${row.lot_number.padEnd(15)} ` +
      `${String(row.quantity.toFixed(2)).padStart(8)} ` +
      `${String(row.qty_before.toFixed(2)).padStart(9)} ` +
      `${String(row.qty_after.toFixed(2)).padStart(9)}`
    );
  }

  const lotsWithDeductions = await prisma.$queryRaw<Array<{
    material: string; lot_number: string;
    qty_received: number; qty_remaining: number; status: string;
  }>>`
    SELECT
      m.name        AS material,
      il."lotNumber" AS lot_number,
      il."quantityReceived"  AS qty_received,
      il."quantityRemaining" AS qty_remaining,
      il.status
    FROM inventory_lots il
    JOIN materials m ON il."materialId" = m.id
    WHERE EXISTS (
      SELECT 1 FROM inventory_movements im
      WHERE im."inventoryLotId" = il.id
        AND im."movementType" = 'out_batch_sheet'
    )
    ORDER BY m.name, il."lotNumber"
  `;

  console.log("\nQuery 3 — Inventory lots with batch-sheet deductions:");
  console.log(`${"Material".padEnd(35)} ${"Lot#".padEnd(15)} ${"Received".padStart(10)} ${"Remaining".padStart(10)} ${"Status".padEnd(12)}`);
  console.log("─".repeat(85));
  for (const row of lotsWithDeductions) {
    console.log(
      `${row.material.padEnd(35)} ` +
      `${row.lot_number.padEnd(15)} ` +
      `${String(row.qty_received.toFixed(2)).padStart(10)} ` +
      `${String(row.qty_remaining.toFixed(2)).padStart(10)} ` +
      `${row.status}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
