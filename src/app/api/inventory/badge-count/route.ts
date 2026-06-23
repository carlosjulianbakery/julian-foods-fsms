import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);

  // Count distinct materials below minimum stock (total across all active/low_stock/conditional lots)
  type CountRow = { count: bigint };
  const [lowStockResult] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM (
      SELECT m.id
      FROM inventory_lots l
      JOIN materials m ON l."materialId" = m.id
      WHERE l.status IN ('active', 'low_stock', 'conditional')
        AND m."minimumStockQuantity" IS NOT NULL
      GROUP BY m.id, m."minimumStockQuantity"
      HAVING SUM(l."quantityRemaining") < m."minimumStockQuantity"
    ) sub
  `;

  const lotsExpiringSoon = await prisma.inventoryLot.count({
    where: {
      status: { in: ["active", "low_stock", "conditional"] },
      expirationDate: { gte: today, lte: in60 },
    },
  });

  const lotsExpired = await prisma.inventoryLot.count({
    where: { status: "expired", quantityRemaining: { gt: 0 } },
  });

  const materialsLowStock = Number(lowStockResult.count);

  return NextResponse.json({
    materialsLowStock,
    lotsExpiringSoon,
    lotsExpired,
    total: materialsLowStock + lotsExpiringSoon + lotsExpired,
  });
}
