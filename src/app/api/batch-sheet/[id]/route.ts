import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeletePreview } from "./delete-preview/route";

export const dynamic = "force-dynamic";

function computeLotStatus(
  lot: { expirationDate: Date | null; isConditional: boolean },
  newQty: number
): string {
  if (newQty <= 0) return "depleted";
  if (lot.expirationDate && lot.expirationDate < new Date()) return "expired";
  if (lot.isConditional) return "conditional";
  return "active";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const isAdmin = (session.user as { role?: string })?.role === "ADMIN";

    const submission = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true, ccpSettings: true } },
      },
    });

    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isAdmin) {
      const { adminNotes: _an, adminNotesUpdatedByName: _nb, adminNotesUpdatedAt: _nat, ...rest } = submission;
      return NextResponse.json(rest);
    }

    return NextResponse.json(submission);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role, id: adminId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const existing = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      select: { id: true, templateName: true, productionDate: true, submittedAt: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Run safety check — also builds the list of reversals to apply
    const preview = await buildDeletePreview(params.id);

    if (!preview.canDelete) {
      return NextResponse.json(
        {
          error: "cannot_delete",
          reason: preview.reason,
          message: preview.message,
          affectedLots: preview.affectedLots,
        },
        { status: 409 }
      );
    }

    const productLabel = existing.templateName ?? "batch sheet";
    const dateLabel = (existing.productionDate ?? existing.submittedAt).toLocaleDateString("en-US", {
      month: "2-digit", day: "2-digit", year: "numeric", timeZone: "America/Los_Angeles",
    });
    const reversalNote = `Reversal of batch sheet deletion — ${productLabel} batch on ${dateLabel}`;
    const refNum = params.id.slice(0, 8).toUpperCase();

    type ReversalResult = {
      lotNumber: string;
      materialName: string;
      quantityReversed: number;
      unit: string;
      newLotStatus: string;
    };
    type WipResult = { lotNumber: string; action: "void" | "reduce" };

    const reversalsCreated: ReversalResult[] = [];
    const wipReversed: WipResult[] = [];

    await prisma.$transaction(async (tx) => {
      // Restore stock for each ingredient/packaging deduction
      for (const r of preview.ingredientReversals) {
        const lot = await tx.inventoryLot.findUnique({
          where: { id: r.inventoryLotId },
          select: { id: true, quantityRemaining: true, expirationDate: true, isConditional: true },
        });
        if (!lot) continue;

        const newQty = lot.quantityRemaining + r.quantityToRestore;
        const newStatus = computeLotStatus(lot, newQty);

        await tx.inventoryMovement.create({
          data: {
            inventoryLotId:  lot.id,
            materialId:      r.materialId,
            materialName:    r.materialName,
            lotNumber:       r.lotNumber,
            movementType:    "in_batch_sheet_reversal",
            quantity:        r.quantityToRestore,
            unit:            r.unit,
            referenceType:   "batch_sheet_deletion",
            referenceId:     params.id,
            referenceNumber: refNum,
            quantityBefore:  lot.quantityRemaining,
            quantityAfter:   newQty,
            performedById:   adminId,
            notes:           reversalNote,
          },
        });

        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { quantityRemaining: newQty, status: newStatus },
        });

        reversalsCreated.push({
          lotNumber: r.lotNumber,
          materialName: r.materialName,
          quantityReversed: r.quantityToRestore,
          unit: r.unit,
          newLotStatus: newStatus,
        });
      }

      // Void WIP lots created by this batch sheet
      for (const wip of preview.wipReversals) {
        const wipLot = await tx.inventoryLot.findUnique({
          where: { id: wip.lotId },
          select: { id: true, quantityRemaining: true },
        });
        if (!wipLot) continue;

        await tx.inventoryMovement.create({
          data: {
            inventoryLotId:  wipLot.id,
            materialId:      wip.materialId,
            materialName:    wip.materialName,
            lotNumber:       wip.lotNumber,
            movementType:    "out_batch_sheet_reversal",
            quantity:        -Math.abs(wipLot.quantityRemaining),
            unit:            wip.unit,
            referenceType:   "batch_sheet_deletion",
            referenceId:     params.id,
            referenceNumber: refNum,
            quantityBefore:  wipLot.quantityRemaining,
            quantityAfter:   0,
            performedById:   adminId,
            notes:           `WIP lot voided — ${reversalNote}`,
          },
        });

        await tx.inventoryLot.update({
          where: { id: wipLot.id },
          data: { quantityRemaining: 0, status: "depleted" },
        });

        wipReversed.push({ lotNumber: wip.lotNumber, action: wip.action });
      }

      // Delete the batch sheet — last step so everything else commits first
      await tx.batchSheetSubmission.delete({ where: { id: params.id } });
    });

    const totalReversals = reversalsCreated.length;
    console.log(
      `[DELETE /api/batch-sheet/${params.id}] Deleted by admin. ${totalReversals} inventory reversal(s) created.`
    );

    return NextResponse.json({
      deleted: true,
      batchSheetId: params.id,
      reversalsCreated,
      wipReversed,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/batch-sheet/${params.id}] Error:`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
