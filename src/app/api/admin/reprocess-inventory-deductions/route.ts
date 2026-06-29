/**
 * ADMIN-ONLY emergency tool.
 * Finds batch sheet submissions that completed but have no inventory_movement records,
 * then re-runs the deduction logic for each one.
 *
 * Safe to run multiple times — the query only targets submissions with zero movements.
 * GET  /api/admin/reprocess-inventory-deductions        — preview (dry run)
 * POST /api/admin/reprocess-inventory-deductions        — actually reprocess
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";
import { processInventoryDeductions, processNfcPackagingFIFO } from "@/app/api/batch-sheet/route";
import type { BatchSheetStatus } from "@/generated/prisma";

const FINISHED_STATUSES = ["COMPLETE", "PASS", "PASS_WITH_ISSUES", "FAIL"] as BatchSheetStatus[];

async function findUnprocessedSubmissions() {
  // Find submissions in a finished state that have no inventory_movement records.
  const submissions = await prisma.batchSheetSubmission.findMany({
    where: {
      status: { in: FINISHED_STATUSES },
    },
    select: {
      id:            true,
      templateName:  true,
      productionLot: true,
      productionDate: true,
      status:        true,
      submittedAt:   true,
      submittedById: true,
      section3:      true,
    },
    orderBy: { submittedAt: "desc" },
  });

  // Filter client-side: only submissions with no movements
  const unprocessed: typeof submissions = [];
  for (const sub of submissions) {
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceType: "batch_sheet", referenceId: sub.id },
    });
    if (movementCount === 0) {
      unprocessed.push(sub);
    }
  }
  return unprocessed;
}

// GET — dry-run preview (no writes)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role } = session.user as { role: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const unprocessed = await findUnprocessedSubmissions();
    return NextResponse.json({
      message: "Dry run — no changes made. POST to this endpoint to reprocess.",
      count: unprocessed.length,
      submissions: unprocessed.map((s) => ({
        id:             s.id,
        templateName:   s.templateName,
        productionLot:  s.productionLot,
        productionDate: s.productionDate,
        status:         s.status,
        submittedAt:    s.submittedAt,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/reprocess-inventory-deductions]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST — actually reprocess
export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role, id: adminId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const unprocessed = await findUnprocessedSubmissions();
    console.log(`[reprocess-inventory-deductions] ${unprocessed.length} submissions to reprocess`);

    const results: Array<{
      id:              string;
      templateName:    string;
      productionLot:   string | null;
      status:          string;
      ingredientsDeducted: number;
      packagingDeducted:   number;
      movementsCreated:    number;
      error:           string | null;
    }> = [];

    const allAffectedMaterialIds = new Set<string>();

    for (const sub of unprocessed) {
      const movementsBefore = await prisma.inventoryMovement.count({
        where: { referenceType: "batch_sheet", referenceId: sub.id },
      });

      let error: string | null = null;
      try {
        const affected = await prisma.$transaction((tx) =>
          processInventoryDeductions(
            tx,
            sub.section3,
            sub.id,
            sub.productionLot,
            adminId
          )
        );
        affected.forEach((matId) => allAffectedMaterialIds.add(matId));
      } catch (txErr) {
        error = txErr instanceof Error ? txErr.message : String(txErr);
        console.error(`[reprocess] submission ${sub.id} failed:`, txErr);
      }

      const movementsAfter = await prisma.inventoryMovement.count({
        where: { referenceType: "batch_sheet", referenceId: sub.id },
      });
      const created = movementsAfter - movementsBefore;

      // Count breakdown by type
      const newMovements = await prisma.inventoryMovement.findMany({
        where: { referenceType: "batch_sheet", referenceId: sub.id },
        select: { materialId: true },
        skip: movementsBefore,
        take: created,
      });

      results.push({
        id:              sub.id,
        templateName:    sub.templateName,
        productionLot:   sub.productionLot,
        status:          sub.status,
        ingredientsDeducted: 0, // breakdown not tracked separately — total is movementsCreated
        packagingDeducted:   0,
        movementsCreated:    created,
        error,
      });

      console.log(
        `[reprocess] ${sub.productionLot ?? sub.id}: ${created} movements created` +
        (error ? ` — ERROR: ${error}` : "")
      );
    }

    // Check stock levels for all affected materials
    if (allAffectedMaterialIds.size > 0) {
      await Promise.all(
        Array.from(allAffectedMaterialIds).map((id) => checkMaterialStockLevel(id))
      );
    }

    // Retroactive NFC FIFO pass — runs for ALL finished submissions.
    // deductNfcFIFO is idempotent: it skips materials that already have a FIFO movement.
    // This covers submissions that had ingredient/food-contact movements but no NFC deduction.
    const allFinished = await prisma.batchSheetSubmission.findMany({
      where:   { status: { in: FINISHED_STATUSES } },
      select:  { id: true, productionLot: true, submittedById: true, section3: true },
      orderBy: { submittedAt: "desc" },
    });

    let nfcMovementsCreated = 0;
    let nfcErrored = 0;

    for (const sub of allFinished) {
      try {
        const nfcBefore = await prisma.inventoryMovement.count({
          where: { referenceType: "batch_sheet", referenceId: sub.id, notes: { contains: "FIFO" } },
        });
        const affected = await prisma.$transaction((tx) =>
          processNfcPackagingFIFO(tx, sub.section3, sub.id, sub.productionLot, adminId)
        );
        affected.forEach((matId) => allAffectedMaterialIds.add(matId));
        const nfcAfter = await prisma.inventoryMovement.count({
          where: { referenceType: "batch_sheet", referenceId: sub.id, notes: { contains: "FIFO" } },
        });
        nfcMovementsCreated += nfcAfter - nfcBefore;
      } catch (txErr) {
        nfcErrored++;
        console.error(`[reprocess NFC FIFO] submission ${sub.id} failed:`, txErr);
      }
    }

    console.log(`[reprocess NFC FIFO] ${nfcMovementsCreated} new movements created across ${allFinished.length} submissions`);

    const totalMovements = results.reduce((s, r) => s + r.movementsCreated, 0);
    const errored = results.filter((r) => r.error !== null).length;

    return NextResponse.json({
      message:           `Reprocessed ${results.length} zero-movement submissions (${totalMovements} movements). ` +
                         `NFC FIFO retroactive: ${nfcMovementsCreated} movements created across ${allFinished.length} submissions.` +
                         (errored + nfcErrored > 0 ? ` ${errored + nfcErrored} errors — check server logs.` : ""),
      processed:         results.length,
      total_movements:   totalMovements,
      nfc_fifo_movements: nfcMovementsCreated,
      errored,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/reprocess-inventory-deductions]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
