import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

  // ── Fetch distribution velocity ──────────────────────────────────────────────
  let distVelocity: Array<{
    fsms_presentation_id: string;
    fsms_presentation_name: string;
    units_last_30_days: number;
    units_last_90_days: number;
    weekly_avg: number;
    completed_pos_count: number;
  }> = [];
  let distUnavailable = false;

  try {
    const base = process.env.NEXTAUTH_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
    const dr = await fetch(`${base}/api/distribution/data`, {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (dr.ok) {
      const dd = await dr.json() as { demand_velocity: typeof distVelocity };
      distVelocity = dd.demand_velocity ?? [];
    } else {
      distUnavailable = true;
    }
  } catch {
    distUnavailable = true;
  }

  const distVelByPresId = new Map(distVelocity.map((v) => [v.fsms_presentation_id, v]));

  // Merge distribution velocity into runway rows
  const mergedRows = runwayRows.map((row) => {
    const dv = distVelByPresId.get(row.fsmsPresentationId);
    return {
      ...row,
      distWeeklyAvg: dv ? dv.weekly_avg : 0,
      distUnits30: dv ? dv.units_last_30_days : 0,
      distUnits90: dv ? dv.units_last_90_days : 0,
      distCompletedPOs: dv ? dv.completed_pos_count : 0,
    };
  });

  // Also add any distribution-only presentations not in SS shipments
  for (const dv of distVelocity) {
    if (!mergedRows.find((r) => r.fsmsPresentationId === dv.fsms_presentation_id)) {
      const presInfo = presMap.get(dv.fsms_presentation_id);
      if (presInfo) {
        mergedRows.push({
          fsmsPresentationId: dv.fsms_presentation_id,
          productName: presInfo.productName,
          presentationName: presInfo.presentationName,
          upc: presInfo.upc,
          unit: presInfo.unit,
          totalShipped: 0,
          avgMonthlyShipped: 0,
          shipmentHistory: [],
          distWeeklyAvg: dv.weekly_avg,
          distUnits30: dv.units_last_30_days,
          distUnits90: dv.units_last_90_days,
          distCompletedPOs: dv.completed_pos_count,
        });
      }
    }
  }

  return NextResponse.json({
    inventory: mergedRows,
    lastSync: syncLog,
    generatedAt: new Date().toISOString(),
    distributionUnavailable: distUnavailable,
  });
}
