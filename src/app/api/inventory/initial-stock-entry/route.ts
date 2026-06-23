import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function updateLotStatus(lotId: string) {
  const lot = await prisma.inventoryLot.findUnique({
    where: { id: lotId },
    include: { material: { select: { minimumStockQuantity: true } } },
  });
  if (!lot) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let status = lot.status;
  if (lot.expirationDate && lot.expirationDate < today) {
    status = "expired";
  } else if (lot.quantityRemaining <= 0) {
    status = "depleted";
  } else if (lot.isConditional) {
    status = "conditional";
  } else if (lot.material.minimumStockQuantity != null && lot.quantityRemaining < lot.material.minimumStockQuantity) {
    status = "low_stock";
  } else {
    status = "active";
  }
  if (status !== lot.status) {
    await prisma.inventoryLot.update({ where: { id: lotId }, data: { status } });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo   = searchParams.get("date_to")   ?? "";
  const material = searchParams.get("material")  ?? "";

  const entries = await prisma.initialStockEntry.findMany({
    where: {
      ...(dateFrom ? { enteredAt: { gte: new Date(dateFrom) } } : {}),
      ...(dateTo   ? { enteredAt: { lte: new Date(dateTo + "T23:59:59") } } : {}),
      ...(material ? { materialName: { contains: material, mode: "insensitive" } } : {}),
    },
    include: {
      enteredBy: { select: { name: true } },
      inventoryLot: {
        select: {
          id: true, status: true, quantityRemaining: true, lotNumber: true,
          movements: {
            select: { movementType: true },
            where: { movementType: { in: ["out_batch_sheet", "out_cycle_count_correction", "in_cycle_count_correction"] } },
            take: 1,
          },
        },
      },
    },
    orderBy: { enteredAt: "desc" },
  });

  return NextResponse.json(entries);
}

interface EntryInput {
  materialId: string;
  supplierId?: string;
  supplierName?: string;
  brandId?: string;
  brandName?: string;
  lotNumber?: string;
  quantity: number;
  unit: string;
  expirationDate?: string;
  dateReceived?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const body = await req.json() as { entries: EntryInput[] };
  const { entries } = body;

  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries array is required" }, { status: 400 });
  }

  const created: string[] = [];
  const lotIds: string[] = [];

  for (const entry of entries) {
    if (!entry.materialId || !entry.quantity || !entry.unit) {
      return NextResponse.json({ error: "materialId, quantity, and unit are required per entry" }, { status: 400 });
    }

    const material = await prisma.material.findUnique({ where: { id: entry.materialId } });
    if (!material) return NextResponse.json({ error: `Material ${entry.materialId} not found` }, { status: 400 });

    let supplierName = entry.supplierName ?? "";
    if (!supplierName && entry.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: entry.supplierId } });
      supplierName = supplier?.name ?? "";
    }

    // Generate lot number fallback
    const seqCount = await prisma.inventoryLot.count({ where: { materialId: entry.materialId } });
    const lotNumber = entry.lotNumber?.trim() || `INITIAL-${entry.materialId.slice(-6).toUpperCase()}-${String(seqCount + 1).padStart(3, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({
        data: {
          materialId: entry.materialId,
          materialName: material.name,
          supplierId: entry.supplierId ?? null,
          supplierName,
          brandId: entry.brandId ?? null,
          brandName: entry.brandName ?? null,
          lotNumber,
          quantityReceived: entry.quantity,
          quantityRemaining: entry.quantity,
          unit: entry.unit,
          receivedDate: entry.dateReceived ? new Date(entry.dateReceived + "T00:00:00Z") : new Date(),
          expirationDate: entry.expirationDate ? new Date(entry.expirationDate + "T00:00:00Z") : null,
          status: "active",
          isConditional: false,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryLotId: lot.id,
          materialId: entry.materialId,
          materialName: material.name,
          lotNumber,
          movementType: "in_initial_stock",
          quantity: entry.quantity,
          unit: entry.unit,
          referenceType: "initial_stock_entry",
          referenceId: lot.id,
          referenceNumber: `INIT-${lotNumber}`,
          quantityBefore: 0,
          quantityAfter: entry.quantity,
          performedById: userId,
        },
      });

      const stockEntry = await tx.initialStockEntry.create({
        data: {
          materialId: entry.materialId,
          materialName: material.name,
          supplierId: entry.supplierId ?? null,
          supplierName,
          brandId: entry.brandId ?? null,
          brandName: entry.brandName ?? null,
          lotNumber,
          quantity: entry.quantity,
          unit: entry.unit,
          expirationDate: entry.expirationDate ? new Date(entry.expirationDate + "T00:00:00Z") : null,
          dateReceived: entry.dateReceived ? new Date(entry.dateReceived + "T00:00:00Z") : null,
          notes: entry.notes ?? null,
          inventoryLotId: lot.id,
          enteredById: userId,
        },
      });

      return { entryId: stockEntry.id, lotId: lot.id };
    });

    created.push(result.entryId);
    lotIds.push(result.lotId);
  }

  // Check lot statuses outside transactions
  await Promise.all(lotIds.map((id) => updateLotStatus(id)));

  return NextResponse.json({ created: created.length, lots: lotIds.length }, { status: 201 });
}
