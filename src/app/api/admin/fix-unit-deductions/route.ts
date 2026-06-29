/**
 * ADMIN-ONLY audit tool for the unit-conversion deduction bug.
 *
 * GET  /api/admin/fix-unit-deductions  — dry run: shows every incorrect deduction
 * POST /api/admin/fix-unit-deductions  — applies in_correction movements to fix them
 *
 * A deduction is considered incorrect when:
 *   - The batch sheet ingredient's unit ≠ the inventory lot's unit (after normalisation)
 *   - AND the units are in the same family (so conversion is possible)
 *   - AND the deducted qty differs from the correctly-converted qty by ≥ 0.0001
 *
 * Corrections are applied in a single Prisma transaction (all or nothing).
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertUnit } from "@/lib/unitConversion";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IncorrectDeduction {
  movementId:       string;
  submissionId:     string;
  batchLot:         string | null;
  materialName:     string;
  lotNumber:        string;
  inventoryLotId:   string;
  batchUnit:        string;
  lotUnit:          string;
  rawQtyInBatch:    number;
  incorrectDeduct:  number; // what was actually deducted (positive)
  correctDeduct:    number; // what should have been deducted (positive)
  overDeducted:     number; // incorrectDeduct - correctDeduct (positive = over, negative = under)
  currentQtyRemaining: number;
  correctedQtyRemaining: number;
}

// ─── Core audit logic ─────────────────────────────────────────────────────────

async function auditDeductions(): Promise<{
  totalMovements: number;
  incorrectDeductions: IncorrectDeduction[];
}> {
  // All out_batch_sheet movements
  const movements = await prisma.inventoryMovement.findMany({
    where: { movementType: "out_batch_sheet" },
    select: {
      id:             true,
      quantity:       true,
      unit:           true,
      inventoryLotId: true,
      referenceId:    true,
    },
    orderBy: { performedAt: "desc" },
  });

  // Build a set of already-corrected lot+submission pairs so we don't re-flag them
  const corrections = await prisma.inventoryMovement.findMany({
    where: { movementType: "in_correction" },
    select: { inventoryLotId: true, referenceId: true },
  });
  const correctedKeys = new Set(corrections.map((c) => `${c.referenceId}|${c.inventoryLotId}`));

  // Collect the lot info and current state for all touched lots up front
  const lotIds = Array.from(new Set(movements.map((m) => m.inventoryLotId)));
  const lots = await prisma.inventoryLot.findMany({
    where: { id: { in: lotIds } },
    select: { id: true, unit: true, lotNumber: true, materialId: true, materialName: true, quantityRemaining: true },
  });
  const lotMap = new Map(lots.map((l) => [l.id, l]));

  // Group movements by submission (referenceId)
  const bySubmission = new Map<string, typeof movements>();
  for (const m of movements) {
    const list = bySubmission.get(m.referenceId) ?? [];
    list.push(m);
    bySubmission.set(m.referenceId, list);
  }

  const incorrectDeductions: IncorrectDeduction[] = [];

  for (const [submissionId, movs] of Array.from(bySubmission.entries())) {
    const sub = await prisma.batchSheetSubmission.findUnique({
      where: { id: submissionId },
      select: { productionLot: true, section3: true },
    });
    if (!sub?.section3) continue;

    const s3 = sub.section3 as Record<string, unknown>;
    const ingredients = (s3.ingredients as Array<{
      unit?: string;
      name?: string;
      lots?: Array<{ inventory_lot_id?: string | null; lot_id?: string | null; qty_used_from_this_lot?: number; qty_used?: number }>;
      inventory_lots?: Array<{ inventory_lot_id?: string | null; lot_id?: string | null; qty_used_from_this_lot?: number; qty_used?: number }>;
    }>) ?? [];

    for (const m of movs) {
      // Skip if a correction has already been applied for this lot+submission
      if (correctedKeys.has(`${submissionId}|${m.inventoryLotId}`)) continue;

      const lot = lotMap.get(m.inventoryLotId);
      if (!lot) continue;
      const lotUnit = lot.unit;

      // Find which ingredient in section3 maps to this movement's lot
      for (const ing of ingredients) {
        const batchUnit = ing.unit;
        if (!batchUnit) continue;

        // Already same unit (after normalisation) — no bug here
        const batchNorm = batchUnit.trim().toLowerCase();
        const lotNorm   = lotUnit.trim().toLowerCase();
        if (batchNorm === lotNorm) continue;

        const allLotEntries = [...(ing.lots ?? []), ...(ing.inventory_lots ?? [])];
        const matchingEntry = allLotEntries.find(
          (le) => (le.inventory_lot_id ?? le.lot_id) === m.inventoryLotId
        );
        if (!matchingEntry) continue;

        const rawQty = matchingEntry.qty_used_from_this_lot ?? matchingEntry.qty_used ?? 0;
        if (!rawQty) continue;

        const conv = convertUnit(rawQty, batchUnit, lotUnit);
        if (!conv.possible) continue; // incompatible unit families — skip (can't correct automatically)

        const incorrectDeduct = Math.abs(m.quantity);
        const correctDeduct   = conv.result;
        const diff            = incorrectDeduct - correctDeduct;

        if (Math.abs(diff) < 0.0001) continue; // negligible difference

        incorrectDeductions.push({
          movementId:            m.id,
          submissionId,
          batchLot:              sub.productionLot,
          materialName:          lot.materialName,
          lotNumber:             lot.lotNumber,
          inventoryLotId:        lot.id,
          batchUnit,
          lotUnit,
          rawQtyInBatch:         rawQty,
          incorrectDeduct,
          correctDeduct,
          overDeducted:          diff, // positive → over-deducted, negative → under-deducted
          currentQtyRemaining:   lot.quantityRemaining,
          correctedQtyRemaining: lot.quantityRemaining + diff,
        });
        break; // one match per movement
      }
    }
  }

  return { totalMovements: movements.length, incorrectDeductions };
}

// ─── GET — dry run ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role } = session.user as { role: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const { totalMovements, incorrectDeductions } = await auditDeductions();
    const totalOverDeducted = incorrectDeductions.reduce((s, d) => s + d.overDeducted, 0);

    const summary = incorrectDeductions.map((d) => ({
      material:              d.materialName,
      lotNumber:             d.lotNumber,
      batchLot:              d.batchLot,
      batchUnit:             d.batchUnit,
      lotUnit:               d.lotUnit,
      rawQtyInBatch:         d.rawQtyInBatch,
      incorrectDeduct:       d.incorrectDeduct,
      correctDeduct:         +d.correctDeduct.toFixed(4),
      overDeducted:          +d.overDeducted.toFixed(4),
      currentQtyRemaining:   +d.currentQtyRemaining.toFixed(4),
      correctedQtyRemaining: +d.correctedQtyRemaining.toFixed(4),
    }));

    return NextResponse.json({
      message: `Dry run — no changes made. POST to apply corrections.`,
      totalOutBatchSheetMovements: totalMovements,
      incorrectDeductionsFound:    incorrectDeductions.length,
      totalOverDeducted:           +totalOverDeducted.toFixed(4),
      deductions: summary,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/fix-unit-deductions]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// ─── POST — apply corrections ─────────────────────────────────────────────────

export async function POST(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role, id: adminId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const { incorrectDeductions } = await auditDeductions();
    if (incorrectDeductions.length === 0) {
      return NextResponse.json({ message: "No incorrect deductions found — nothing to correct.", corrected: 0 });
    }

    const correctionDate = new Date().toISOString().split("T")[0];
    const refNumber = `UNIT-CORRECTION-${correctionDate}`;
    const corrected: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const d of incorrectDeductions) {
        // Re-read the lot inside the transaction to get the live qty
        const lot = await tx.inventoryLot.findUnique({
          where: { id: d.inventoryLotId },
          select: { quantityRemaining: true, expirationDate: true, isConditional: true },
        });
        if (!lot) continue;

        const adjustment      = d.overDeducted; // positive = add back, negative = remove more
        const qtyBefore       = lot.quantityRemaining;
        const qtyAfter        = Math.max(0, qtyBefore + adjustment);

        const newStatus =
          qtyAfter <= 0               ? "depleted"
          : lot.expirationDate && lot.expirationDate < new Date() ? "expired"
          : lot.isConditional          ? "conditional"
          : "active";

        const lotForMat = await tx.inventoryLot.findUnique({
          where:  { id: d.inventoryLotId },
          select: { materialId: true },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryLotId:  d.inventoryLotId,
            materialId:      lotForMat?.materialId ?? d.inventoryLotId,
            materialName:    d.materialName,
            lotNumber:       d.lotNumber,
            movementType:    "in_correction",
            quantity:        adjustment,
            unit:            d.lotUnit,
            referenceType:   "correction",
            referenceId:     d.submissionId,
            referenceNumber: refNumber,
            quantityBefore:  qtyBefore,
            quantityAfter:   qtyAfter,
            performedById:   adminId,
            notes:
              `Unit mismatch correction: deducted ${d.incorrectDeduct} ${d.lotUnit} ` +
              `instead of ${d.correctDeduct.toFixed(4)} ${d.lotUnit} ` +
              `(batch recorded ${d.rawQtyInBatch} ${d.batchUnit}) ` +
              `from batch ${d.batchLot ?? d.submissionId}`,
          },
        });

        await tx.inventoryLot.update({
          where: { id: d.inventoryLotId },
          data:  { quantityRemaining: qtyAfter, status: newStatus },
        });

        corrected.push(`${d.materialName} lot ${d.lotNumber}: +${adjustment.toFixed(4)} ${d.lotUnit}`);
      }
    });

    // (stock level alerts refreshed on next inventory check)

    return NextResponse.json({
      message:   `Applied ${corrected.length} unit-conversion corrections.`,
      corrected: corrected.length,
      details:   corrected,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/fix-unit-deductions]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
