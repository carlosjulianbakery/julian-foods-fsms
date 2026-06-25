import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertUnit, aggregateInStandardUnit } from "@/lib/unitConversion";

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

  // Fetch all materials that have a minimum stock level configured
  const materials = await prisma.material.findMany({
    where: { minimumStockQuantity: { not: null } },
    select: {
      id: true,
      name: true,
      minimumStockQuantity: true,
      minimumStockUnit: true,
      unit: true, // standard unit from registry
    },
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

  // Group lots by materialId — each lot may use its own unit
  const lotsByMaterial = new Map<string, Array<{ quantityRemaining: number; unit: string }>>();
  for (const lot of lots) {
    const arr = lotsByMaterial.get(lot.materialId) ?? [];
    arr.push(lot);
    lotsByMaterial.set(lot.materialId, arr);
  }

  const lowStockMaterials: {
    materialId: string;
    materialName: string;
    totalRemaining: number;
    minimumQuantity: number;
    minimumUnit: string | null;
    unit: string;
    shortage: number;
    minimumWasConverted: boolean;
    minimumOriginalQty: number;
    minimumOriginalUnit: string;
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
    const matLots = lotsByMaterial.get(material.id);
    if (!matLots || matLots.length === 0) continue;

    // Registry standard unit as aggregation pivot; fall back to first lot's unit
    const standardUnit =
      material.unit && material.unit.trim() !== ""
        ? material.unit.trim()
        : matLots[0].unit;

    // Aggregate all lots converting each to standard unit
    const aggregated = aggregateInStandardUnit(
      matLots.map((l) => ({ quantity: l.quantityRemaining, unit: l.unit })),
      standardUnit
    );

    if (!aggregated.possible) {
      unitMismatchMaterials.push({
        materialId: material.id,
        materialName: material.name,
        totalRemaining: matLots[0].quantityRemaining,
        inventoryUnit: matLots.map((l) => l.unit).join(", "),
        minimumQuantity: Number(material.minimumStockQuantity!),
        minimumUnit: material.minimumStockUnit ?? standardUnit,
        reason: `Inventory lot units cannot be aggregated (${aggregated.mismatches.join(", ")} incompatible with ${standardUnit})`,
      });
      continue;
    }

    const minQty = Number(material.minimumStockQuantity!);
    const minUnit =
      material.minimumStockUnit && material.minimumStockUnit.trim() !== ""
        ? material.minimumStockUnit.trim()
        : standardUnit;

    // Convert minimum threshold to standard unit
    const minSameAsStandard = minUnit.toLowerCase() === standardUnit.toLowerCase();
    let minimumInStandard: number;

    if (minSameAsStandard) {
      minimumInStandard = minQty;
    } else {
      const conv = convertUnit(minQty, minUnit, standardUnit);
      if (!conv.possible) {
        unitMismatchMaterials.push({
          materialId: material.id,
          materialName: material.name,
          totalRemaining: aggregated.total,
          inventoryUnit: standardUnit,
          minimumQuantity: minQty,
          minimumUnit: minUnit,
          reason:
            conv.reason ??
            `Cannot convert minimum unit "${minUnit}" to standard unit "${standardUnit}"`,
        });
        continue;
      }
      minimumInStandard = conv.result;
    }

    if (aggregated.total < minimumInStandard) {
      lowStockMaterials.push({
        materialId: material.id,
        materialName: material.name,
        totalRemaining: aggregated.total,
        minimumQuantity: minimumInStandard,
        minimumUnit: standardUnit,
        unit: standardUnit,
        shortage: minimumInStandard - aggregated.total,
        minimumWasConverted: !minSameAsStandard,
        minimumOriginalQty: minQty,
        minimumOriginalUnit: minUnit,
      });
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
