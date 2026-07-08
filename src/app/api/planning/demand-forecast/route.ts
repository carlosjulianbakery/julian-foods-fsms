import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [inventory, recentShipments, syncLog] = await Promise.all([
    prisma.finishedGoodsInventory.findMany({
      orderBy: [{ productName: "asc" }, { presentationName: "asc" }],
    }),

    // Last 90 days of shipments grouped by presentation + month
    prisma.$queryRaw<
      Array<{
        fsmsPresentationId: string;
        month: string;
        totalShipped: bigint;
      }>
    >`
      SELECT ssi."fsmsPresentationId",
             TO_CHAR(ss."shipDate", 'YYYY-MM') AS month,
             SUM(ssi."quantityShipped")::bigint AS "totalShipped"
      FROM shipstation_shipment_items ssi
      JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
      WHERE ss.voided = false
        AND ssi."fsmsPresentationId" IS NOT NULL
        AND ss."shipDate" >= NOW() - INTERVAL '90 days'
      GROUP BY ssi."fsmsPresentationId", TO_CHAR(ss."shipDate", 'YYYY-MM')
      ORDER BY ssi."fsmsPresentationId", month
    `,

    prisma.shipstationSyncLog.findFirst({
      where: { status: "success" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, dateRangeFrom: true, dateRangeTo: true, shipmentsFetched: true },
    }),
  ]);

  // Group shipment history by presentation
  const historyByPres = new Map<string, Array<{ month: string; shipped: number }>>();
  for (const row of recentShipments) {
    if (!row.fsmsPresentationId) continue;
    const arr = historyByPres.get(row.fsmsPresentationId) ?? [];
    arr.push({ month: row.month, shipped: Number(row.totalShipped) });
    historyByPres.set(row.fsmsPresentationId, arr);
  }

  // Build inventory runway table
  const runwayRows = inventory.map((inv) => {
    const history = historyByPres.get(inv.fsmsPresentationId) ?? [];
    const totalShipped90 = history.reduce((s, h) => s + h.shipped, 0);
    const avgMonthly = history.length > 0 ? totalShipped90 / 3 : 0; // 90-day avg → monthly
    const runwayMonths = avgMonthly > 0 ? inv.onHand / avgMonthly : null;

    return {
      fsmsPresentationId: inv.fsmsPresentationId,
      productName: inv.productName,
      presentationName: inv.presentationName,
      upc: inv.upc,
      unit: inv.unit,
      onHand: inv.onHand,
      totalProduced: inv.totalProduced,
      totalShipped: inv.totalShipped,
      avgMonthlyShipped: Math.round(avgMonthly),
      runwayMonths: runwayMonths !== null ? Math.round(runwayMonths * 10) / 10 : null,
      shipmentHistory: history,
    };
  });

  return NextResponse.json({
    inventory: runwayRows,
    lastSync: syncLog,
    generatedAt: new Date().toISOString(),
  });
}
