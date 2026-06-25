import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertUnit } from "@/lib/unitConversion";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  // Mark newly-expired lots first
  await prisma.inventoryLot.updateMany({
    where: {
      expirationDate: { lt: today },
      status: { notIn: ["expired", "recalled"] },
    },
    data: { status: "expired" },
  });

  // Fetch all materials with a minimum stock level configured
  const materials = await prisma.material.findMany({
    where: { minimumStockQuantity: { not: null } },
    select: { id: true, name: true, minimumStockQuantity: true, minimumStockUnit: true },
  });

  const materialIds = materials.map((m) => m.id);

  // Fetch active lots for those materials
  const lots = await prisma.inventoryLot.findMany({
    where: {
      materialId: { in: materialIds },
      status: { in: ["active", "low_stock", "conditional"] },
    },
    select: { materialId: true, quantityRemaining: true, unit: true },
  });

  // Aggregate lot totals per material (assumes lots share the same unit)
  const stockByMaterial = new Map<string, { qty: number; unit: string }>();
  for (const lot of lots) {
    const existing = stockByMaterial.get(lot.materialId);
    if (existing) {
      existing.qty += lot.quantityRemaining;
    } else {
      stockByMaterial.set(lot.materialId, { qty: lot.quantityRemaining, unit: lot.unit });
    }
  }

  const lowStockMaterials: {
    materialId: string;
    materialName: string;
    totalRemaining: number;
    minimumQuantity: number;
    minimumUnit: string | null;
    unit: string;
    shortage: number;
  }[] = [];

  const unitMismatchMaterials: {
    materialId: string;
    materialName: string;
    totalRemaining: number;
    inventoryUnit: string;
    minimumQuantity: number;
    minimumUnit: string;
    reason: string;
  }[] = [];

  for (const material of materials) {
    const stock = stockByMaterial.get(material.id);
    if (!stock) continue;

    const minQty = Number(material.minimumStockQuantity!);
    const minUnit =
      material.minimumStockUnit && material.minimumStockUnit !== ""
        ? material.minimumStockUnit
        : stock.unit;

    if (stock.unit.trim().toLowerCase() === minUnit.trim().toLowerCase()) {
      if (stock.qty < minQty) {
        lowStockMaterials.push({
          materialId: material.id,
          materialName: material.name,
          totalRemaining: stock.qty,
          minimumQuantity: minQty,
          minimumUnit: minUnit,
          unit: stock.unit,
          shortage: minQty - stock.qty,
        });
      }
    } else {
      const conv = convertUnit(stock.qty, stock.unit, minUnit);
      if (conv.possible) {
        const converted = conv.result;
        if (converted < minQty) {
          lowStockMaterials.push({
            materialId: material.id,
            materialName: material.name,
            totalRemaining: converted,
            minimumQuantity: minQty,
            minimumUnit: minUnit,
            unit: minUnit,
            shortage: minQty - converted,
          });
        }
      } else {
        unitMismatchMaterials.push({
          materialId: material.id,
          materialName: material.name,
          totalRemaining: stock.qty,
          inventoryUnit: stock.unit,
          minimumQuantity: minQty,
          minimumUnit: minUnit,
          reason: conv.reason ?? "Unit family mismatch",
        });
      }
    }
  }

  // Sort low stock by severity (most critical first)
  lowStockMaterials.sort(
    (a, b) => a.totalRemaining / a.minimumQuantity - b.totalRemaining / b.minimumQuantity
  );

  // Expired lots (with remaining quantity)
  const expiredLots = await prisma.inventoryLot.findMany({
    where: { status: "expired", quantityRemaining: { gt: 0 } },
    select: {
      id: true, materialName: true, lotNumber: true,
      quantityRemaining: true, unit: true, expirationDate: true,
    },
    orderBy: { expirationDate: "asc" },
  });

  // Expiring-soon lots (active lots with expiry in next 60 days)
  const expiringSoonLots = await prisma.inventoryLot.findMany({
    where: {
      status: { in: ["active", "low_stock", "conditional"] },
      expirationDate: { gte: today, lte: in60 },
    },
    select: {
      id: true, materialName: true, lotNumber: true,
      quantityRemaining: true, unit: true, expirationDate: true,
    },
    orderBy: { expirationDate: "asc" },
  });

  return NextResponse.json({
    lowStock: lowStockMaterials,
    unitMismatch: unitMismatchMaterials,
    expired: expiredLots.map((l) => ({
      id: l.id,
      materialName: l.materialName,
      lotNumber: l.lotNumber,
      quantityRemaining: l.quantityRemaining,
      unit: l.unit,
      expirationDate: l.expirationDate ? l.expirationDate.toISOString().split("T")[0] : null,
    })),
    expiringSoon: expiringSoonLots.map((l) => ({
      id: l.id,
      materialName: l.materialName,
      lotNumber: l.lotNumber,
      quantityRemaining: l.quantityRemaining,
      unit: l.unit,
      expirationDate: l.expirationDate ? l.expirationDate.toISOString().split("T")[0] : null,
    })),
  });
}
