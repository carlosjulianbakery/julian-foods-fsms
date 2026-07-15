import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkMaterialStockLevel } from "@/lib/inventoryUtils";

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
  console.log("[cycle-count POST] body keys:", Object.keys(body), "notes value:", JSON.stringify(body.notes));
  const {
    inventoryLotId,
    quantityCountedOriginal,
    quantityCountedOriginalUnit,
    reason,
    reasonOther,
    notes,
  } = body as {
    inventoryLotId: string;
    quantityCountedOriginal?: number;
    quantityCountedOriginalUnit?: string;
    reason?: string;
    reasonOther?: string;
    notes?: string;
  };
  // 0 is a valid physical count — use explicit null check, not truthiness
  const quantityCounted: number | undefined = body.quantityCounted;
  if (quantityCounted === undefined || quantityCounted === null) {
    return NextResponse.json({ error: "quantityCounted is required" }, { status: 400 });
  }

  const lot = await prisma.inventoryLot.findUnique({
    where: { id: inventoryLotId },
    select: { id: true, materialId: true, materialName: true, lotNumber: true, quantityRemaining: true, unit: true, expirationDate: true, isConditional: true, status: true },
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
      quantityCountedOriginal: quantityCountedOriginal ?? null,
      quantityCountedOriginalUnit: quantityCountedOriginalUnit ?? null,
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

    const baseRef = `CC-${cycleCount.id.slice(0, 8).toUpperCase()}`;
    const refNumber = quantityCounted === 0
      ? `Cycle Count — Physical count: 0 (lot depleted)`
      : baseRef;

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
        referenceNumber: refNumber,
        quantityBefore: lot.quantityRemaining,
        quantityAfter: quantityCounted,
        performedById: userId,
        notes: notes ?? null,
      },
    });
  }

  // Update lot quantity
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newStatus: string;
  if (lot.expirationDate && lot.expirationDate < today) {
    newStatus = "expired";
  } else if (quantityCounted <= 0) {
    newStatus = "depleted";
  } else if (lot.isConditional) {
    newStatus = "conditional";
  } else {
    newStatus = "active";
  }

  await prisma.inventoryLot.update({
    where: { id: inventoryLotId },
    data: { quantityRemaining: quantityCounted, status: newStatus, updatedAt: new Date() },
  });

  // Check total stock level for this material after the count adjustment
  await checkMaterialStockLevel(lot.materialId);

  return NextResponse.json({ cycleCount, variance }, { status: 201 });
}
