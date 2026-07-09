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

  // Shipment counts per SS product (last 90 days, non-voided)
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const shipmentCounts = await prisma.$queryRaw<Array<{ shipstationProductId: string; count: bigint }>>`
    SELECT ssi."shipstationProductId", COUNT(DISTINCT ssi."shipmentId")::bigint AS count
    FROM shipstation_shipment_items ssi
    JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
    WHERE ss.voided = false
      AND ss."shipDate" >= ${cutoff}
      AND ssi."shipstationProductId" IS NOT NULL
    GROUP BY ssi."shipstationProductId"
  `;
  const countMap = new Map<string, number>();
  for (const row of shipmentCounts) countMap.set(row.shipstationProductId, Number(row.count));

  const products = await prisma.shipstationProduct.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      bundleConfigs: {
        include: { componentProduct: { select: { id: true, name: true, upc: true, fsmsPresentationId: true, fsmsProductId: true } } },
      },
    },
  });

  // Enrich with FSMS presentation names
  const fsmsProducts = await prisma.product.findMany({ select: { id: true, name: true, presentations: true } });
  const presentationMap = new Map<string, { name: string; productName: string }>();
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string }>) ?? []) {
      presentationMap.set(pr.id, { name: pr.name, productName: p.name });
    }
  }

  const enriched = products.map((p) => ({
    id: p.id,
    shipstationProductId: p.shipstationProductId,
    name: p.name,
    sku: p.sku,
    upc: p.upc,
    isBundle: p.isBundle,
    isActive: p.isActive,
    configStatus: p.configStatus,
    ignoredReason: p.ignoredReason,
    fsmsPresentationId: p.fsmsPresentationId,
    fsmsProductId: p.fsmsProductId,
    fsmsPresentationName: p.fsmsPresentationId ? (presentationMap.get(p.fsmsPresentationId)?.name ?? null) : null,
    fsmsProductName: p.fsmsPresentationId ? (presentationMap.get(p.fsmsPresentationId)?.productName ?? null) : null,
    shipmentsLast90Days: countMap.get(p.id) ?? 0,
    bundleConfigs: p.bundleConfigs.map((bc) => ({
      id: bc.id,
      componentProductId: bc.componentProductId,
      componentName: bc.componentProduct.name,
      componentUpc: bc.componentProduct.upc,
      fsmsPresentationId: bc.fsmsPresentationId,
      fsmsProductId: bc.fsmsProductId,
      fsmsPresentationName: presentationMap.get(bc.fsmsPresentationId)?.name ?? null,
      fsmsProductName: presentationMap.get(bc.fsmsPresentationId)?.productName ?? null,
      quantityPerBundle: bc.quantityPerBundle,
    })),
  }));

  // Sort by shipments last 90 days desc
  enriched.sort((a, b) => b.shipmentsLast90Days - a.shipmentsLast90Days);

  const summary = {
    total: products.length,
    unmatched: products.filter((p) => p.configStatus === "unmatched").length,
    singleMatched: products.filter((p) => p.configStatus === "single_matched").length,
    bundle: products.filter((p) => p.configStatus === "bundle").length,
    ignored: products.filter((p) => p.configStatus === "ignored").length,
  };

  return NextResponse.json({ products: enriched, summary });
}
