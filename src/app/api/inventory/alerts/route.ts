import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  // Per-material low stock: aggregate total across active/low_stock/conditional lots
  type LowStockRow = {
    materialId: string;
    materialName: string;
    minimumStockQuantity: number;
    minimumStockUnit: string | null;
    totalRemaining: number;
    unit: string;
  };

  const lowStockMaterials = await prisma.$queryRaw<LowStockRow[]>`
    SELECT
      m.id                        AS "materialId",
      m.name                      AS "materialName",
      m."minimumStockQuantity"    AS "minimumStockQuantity",
      m."minimumStockUnit"        AS "minimumStockUnit",
      SUM(l."quantityRemaining")  AS "totalRemaining",
      MIN(l.unit)                 AS "unit"
    FROM inventory_lots l
    JOIN materials m ON l."materialId" = m.id
    WHERE l.status IN ('active', 'low_stock', 'conditional')
      AND m."minimumStockQuantity" IS NOT NULL
    GROUP BY m.id, m.name, m."minimumStockQuantity", m."minimumStockUnit"
    HAVING SUM(l."quantityRemaining") < m."minimumStockQuantity"
    ORDER BY (SUM(l."quantityRemaining") / m."minimumStockQuantity") ASC
  `;

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
    lowStock: lowStockMaterials.map((m) => ({
      materialId: m.materialId,
      materialName: m.materialName,
      totalRemaining: Number(m.totalRemaining),
      minimumQuantity: Number(m.minimumStockQuantity),
      minimumUnit: m.minimumStockUnit ?? null,
      unit: m.unit,
      shortage: Number(m.minimumStockQuantity) - Number(m.totalRemaining),
    })),
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
