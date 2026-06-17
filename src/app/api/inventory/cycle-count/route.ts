import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const counts = await prisma.cycleCount.findMany({
    include: { performedBy: { select: { name: true } } },
    orderBy: { performedAt: "desc" },
    take: 100,
  });

  return NextResponse.json(counts);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { inventoryLotId, quantityCounted, reason, reasonOther, notes } = body as {
    inventoryLotId: string;
    quantityCounted: number;
    reason?: string;
    reasonOther?: string;
    notes?: string;
  };

  const lot = await prisma.inventoryLot.findUnique({
    where: { id: inventoryLotId },
    include: { material: { select: { minimumStockQuantity: true } } },
  });
  if (!lot) return NextResponse.json({ error: "Lot not found" }, { status: 404 });

  const variance = quantityCounted - lot.quantityRemaining;
  const userId = (session.user as { id: string }).id;

  const cycleCount = await prisma.cycleCount.create({
    data: {
      countDate: new Date(),
      materialId: lot.materialId,
      materialName: lot.materialName,
      inventoryLotId,
      lotNumber: lot.lotNumber,
      quantityExpected: lot.quantityRemaining,
      quantityCounted,
      variance,
      unit: lot.unit,
      reason: reason ?? null,
      reasonOther: reasonOther ?? null,
      performedById: userId,
      notes: notes ?? null,
    },
  });

  // Create inventory movement for the correction
  if (variance !== 0) {
    const movementType = variance > 0
      ? "in_cycle_count_correction"
      : "out_cycle_count_correction";

    await prisma.inventoryMovement.create({
      data: {
        inventoryLotId,
        materialId: lot.materialId,
        materialName: lot.materialName,
        lotNumber: lot.lotNumber,
        movementType,
        quantity: variance,
        unit: lot.unit,
        referenceType: "cycle_count",
        referenceId: cycleCount.id,
        referenceNumber: `CC-${cycleCount.id.slice(0, 8).toUpperCase()}`,
        quantityBefore: lot.quantityRemaining,
        quantityAfter: quantityCounted,
        performedById: userId,
        notes,
      },
    });
  }

  // Update lot quantity
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newStatus = lot.status;
  if (lot.expirationDate && lot.expirationDate < today) {
    newStatus = "expired";
  } else if (quantityCounted <= 0) {
    newStatus = "depleted";
  } else if (lot.isConditional) {
    newStatus = "conditional";
  } else if (
    lot.material.minimumStockQuantity != null &&
    quantityCounted < lot.material.minimumStockQuantity
  ) {
    newStatus = "low_stock";
  } else {
    newStatus = "active";
  }

  await prisma.inventoryLot.update({
    where: { id: inventoryLotId },
    data: { quantityRemaining: quantityCounted, status: newStatus, updatedAt: new Date() },
  });

  return NextResponse.json({ cycleCount, variance }, { status: 201 });
}
