import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type IngredientReversal = {
  movementId: string;
  inventoryLotId: string;
  materialId: string;
  lotNumber: string;
  materialName: string;
  quantityToRestore: number;
  unit: string;
  currentQty: number;
};

export type WipReversal = {
  lotId: string;
  materialId: string;
  lotNumber: string;
  materialName: string;
  quantityToRemove: number;
  unit: string;
  action: "void" | "reduce";
};

export type DeletePreviewResult =
  | {
      canDelete: true;
      ingredientReversals: IngredientReversal[];
      wipReversals: WipReversal[];
    }
  | {
      canDelete: false;
      reason: "wip_lot_used_after";
      message: string;
      affectedLots: { lotNumber: string; materialName: string; subsequentMovements: number }[];
    };

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sub = await prisma.batchSheetSubmission.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const result = await buildDeletePreview(params.id);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function buildDeletePreview(batchSheetId: string): Promise<DeletePreviewResult> {
  const submission = await prisma.batchSheetSubmission.findUnique({
    where: { id: batchSheetId },
    select: { id: true, templateName: true, submittedAt: true, productionDate: true },
  });
  if (!submission) throw new Error("Batch sheet not found");

  // All deduction movements from this batch sheet (ingredients + packaging)
  const outMovements = await prisma.inventoryMovement.findMany({
    where: {
      referenceId: batchSheetId,
      referenceType: "batch_sheet",
      movementType: "out_batch_sheet",
    },
    include: {
      inventoryLot: { select: { id: true, quantityRemaining: true } },
    },
    orderBy: { performedAt: "asc" },
  });

  const ingredientReversals: IngredientReversal[] = outMovements.map((m) => ({
    movementId: m.id,
    inventoryLotId: m.inventoryLotId,
    materialId: m.materialId,
    lotNumber: m.lotNumber,
    materialName: m.materialName,
    quantityToRestore: Math.abs(m.quantity),
    unit: m.unit,
    currentQty: m.inventoryLot?.quantityRemaining ?? 0,
  }));

  // WIP lot created by this batch sheet (in_receiving movement)
  const wipMovement = await prisma.inventoryMovement.findFirst({
    where: {
      referenceId: batchSheetId,
      referenceType: "batch_sheet",
      movementType: "in_receiving",
    },
    select: {
      inventoryLotId: true,
      materialId: true,
      quantity: true,
      unit: true,
      materialName: true,
      lotNumber: true,
    },
  });

  if (!wipMovement) {
    return { canDelete: true, ingredientReversals, wipReversals: [] };
  }

  // Safety: check for subsequent movements on the WIP lot from other operations
  const subsequentMovements = await prisma.inventoryMovement.findMany({
    where: {
      inventoryLotId: wipMovement.inventoryLotId,
      referenceId: { not: batchSheetId },
      performedAt: { gt: submission.submittedAt },
    },
    select: { id: true },
  });

  const wipLot = await prisma.inventoryLot.findUnique({
    where: { id: wipMovement.inventoryLotId },
    select: { lotNumber: true, materialName: true, quantityRemaining: true },
  });

  if (subsequentMovements.length > 0) {
    const lotNumber = wipLot?.lotNumber ?? wipMovement.lotNumber;
    const materialName = wipLot?.materialName ?? wipMovement.materialName;
    return {
      canDelete: false,
      reason: "wip_lot_used_after",
      message: `Cannot delete this batch sheet — the WIP lot ${lotNumber} created by this batch was subsequently used in ${subsequentMovements.length} later operation(s). Deleting would cause negative WIP inventory. Please correct via cycle count instead.`,
      affectedLots: [{
        lotNumber,
        materialName,
        subsequentMovements: subsequentMovements.length,
      }],
    };
  }

  const wipReversals: WipReversal[] = [{
    lotId: wipMovement.inventoryLotId,
    materialId: wipMovement.materialId,
    lotNumber: wipLot?.lotNumber ?? wipMovement.lotNumber,
    materialName: wipLot?.materialName ?? wipMovement.materialName,
    quantityToRemove: wipLot?.quantityRemaining ?? Math.abs(wipMovement.quantity),
    unit: wipMovement.unit,
    action: "void",
  }];

  return { canDelete: true, ingredientReversals, wipReversals };
}
