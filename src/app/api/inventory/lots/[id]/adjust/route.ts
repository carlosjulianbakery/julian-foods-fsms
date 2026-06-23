import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { adjustmentQty, notes } = await req.json();
  if (typeof adjustmentQty !== "number") {
    return NextResponse.json({ error: "adjustmentQty is required" }, { status: 400 });
  }

  const lot = await prisma.inventoryLot.findUnique({
    where: { id: params.id },
    select: { id: true, materialId: true, materialName: true, lotNumber: true, quantityRemaining: true, unit: true, expirationDate: true, isConditional: true, status: true },
  });
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });

  const newQty = Math.max(0, lot.quantityRemaining + adjustmentQty);
  const userId = (session.user as { id: string }).id;

  const movementType = adjustmentQty >= 0
    ? "in_manual_adjustment"  // note: spec uses "in_cycle_count_correction" style names — keeping consistent
    : "out_manual_adjustment";

  await prisma.inventoryMovement.create({
    data: {
      inventoryLotId: lot.id,
      materialId: lot.materialId,
      materialName: lot.materialName,
      lotNumber: lot.lotNumber,
      movementType: adjustmentQty >= 0 ? "in_cycle_count_correction" : "out_manual_adjustment",
      quantity: adjustmentQty,
      unit: lot.unit,
      referenceType: "manual_adjustment",
      referenceId: lot.id,
      referenceNumber: `ADJ-${lot.lotNumber}`,
      quantityBefore: lot.quantityRemaining,
      quantityAfter: newQty,
      performedById: userId,
      notes: notes ?? null,
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newStatus: string;
  if (lot.expirationDate && lot.expirationDate < today) {
    newStatus = "expired";
  } else if (newQty <= 0) {
    newStatus = "depleted";
  } else if (lot.isConditional) {
    newStatus = "conditional";
  } else {
    newStatus = "active";
  }

  const updated = await prisma.inventoryLot.update({
    where: { id: params.id },
    data: { quantityRemaining: newQty, status: newStatus, updatedAt: new Date() },
  });

  // Check total stock level for this material after the adjustment
  await checkMaterialStockLevel(lot.materialId);

  return NextResponse.json(updated);
}
