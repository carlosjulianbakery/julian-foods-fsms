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

  const [fsmsProducts, recentShipments, syncLog] = await Promise.all([
    prisma.product.findMany({ select: { id: true, name: true, presentations: true } }),

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

  // Build presentation lookup from FSMS products
  const presMap = new Map<string, { productName: string; presentationName: string; upc: string; unit: string }>();
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string; primary_unit_name?: string }>) ?? []) {
      presMap.set(pr.id, {
        productName: p.name,
        presentationName: pr.name,
        upc: pr.upc ?? "",
        unit: pr.primary_unit_name ?? "units",
      });
    }
  }

  // Group shipment history by presentation and accumulate totals
  const historyByPres = new Map<string, Array<{ month: string; shipped: number }>>();
  const totalByPres = new Map<string, number>();
  for (const row of recentShipments) {
    if (!row.fsmsPresentationId) continue;
    const n = Number(row.totalShipped);
    const arr = historyByPres.get(row.fsmsPresentationId) ?? [];
    arr.push({ month: row.month, shipped: n });
    historyByPres.set(row.fsmsPresentationId, arr);
    totalByPres.set(row.fsmsPresentationId, (totalByPres.get(row.fsmsPresentationId) ?? 0) + n);
  }

  // Build runway rows from presentations that have shipment activity
  const runwayRows = Array.from(historyByPres.entries())
    .map(([presId, history]) => {
      const info = presMap.get(presId);
      if (!info) return null;
      const totalShipped90 = totalByPres.get(presId) ?? 0;
      const avgMonthly = totalShipped90 / 3; // 90-day window → monthly rate
      return {
        fsmsPresentationId: presId,
        productName: info.productName,
        presentationName: info.presentationName,
        upc: info.upc,
        unit: info.unit,
        totalShipped: totalShipped90,
        avgMonthlyShipped: Math.round(avgMonthly),
        shipmentHistory: history.sort((a, b) => a.month.localeCompare(b.month)),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.totalShipped - a.totalShipped);

  return NextResponse.json({
    inventory: runwayRows,
    lastSync: syncLog,
    generatedAt: new Date().toISOString(),
  });
}
