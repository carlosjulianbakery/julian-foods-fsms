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

  const [ssProducts, ssComponents, bundleConfigs, fsmsProducts, shippedByProduct] = await Promise.all([
    prisma.shipstationProduct.findMany({ orderBy: { name: "asc" } }),
    prisma.shipstationBundleComponent.findMany({
      include: { componentProduct: { select: { id: true, name: true, upc: true, fsmsPresentationId: true, fsmsProductId: true } } },
    }),
    prisma.shipstationBundleConfig.findMany(),
    prisma.product.findMany({ select: { id: true, name: true, presentations: true } }),
    prisma.$queryRaw<Array<{ shipstationProductId: string; totalShipped: bigint }>>`
      SELECT ssi."shipstationProductId", SUM(ssi."quantityShipped")::bigint AS "totalShipped"
      FROM shipstation_shipment_items ssi
      JOIN shipstation_shipments ss ON ss.id = ssi."shipmentId"
      WHERE ss.voided = false AND ssi."shipstationProductId" IS NOT NULL
      GROUP BY ssi."shipstationProductId"
    `,
  ]);

  // Build FSMS lookup maps
  const fsmsProductMap = new Map<string, string>();
  const fsmsPresentationMap = new Map<string, string>();
  for (const p of fsmsProducts) {
    fsmsProductMap.set(p.id, p.name);
    const pres = (p.presentations as Array<{ id: string; name: string }>) ?? [];
    for (const pr of pres) fsmsPresentationMap.set(pr.id, pr.name);
  }

  // Build shipped totals map
  const shippedByDbId = new Map<string, number>();
  for (const row of shippedByProduct) {
    shippedByDbId.set(row.shipstationProductId, Number(row.totalShipped));
  }

  // Raw SS bundle components (from aliases during sync), keyed by bundleProductId
  const componentsByBundle = new Map<string, typeof ssComponents>();
  for (const comp of ssComponents) {
    const arr = componentsByBundle.get(comp.bundleProductId) ?? [];
    arr.push(comp);
    componentsByBundle.set(comp.bundleProductId, arr);
  }

  // Admin-configured bundle mappings (from Bundle Config page), keyed by bundleProductId
  const bundleConfigsByProduct = new Map<string, typeof bundleConfigs>();
  for (const bc of bundleConfigs) {
    const arr = bundleConfigsByProduct.get(bc.bundleProductId) ?? [];
    arr.push(bc);
    bundleConfigsByProduct.set(bc.bundleProductId, arr);
  }

  const products = ssProducts.map((sp) => ({
    id: sp.id,
    shipstationProductId: sp.shipstationProductId,
    name: sp.name,
    sku: sp.sku,
    upc: sp.upc,
    isBundle: sp.isBundle,
    isActive: sp.isActive,
    configStatus: sp.configStatus ?? "unmatched",
    ignoredReason: sp.ignoredReason ?? null,
    fsmsPresentationId: sp.fsmsPresentationId,
    fsmsProductId: sp.fsmsProductId,
    fsmsProductName: sp.fsmsProductId ? (fsmsProductMap.get(sp.fsmsProductId) ?? null) : null,
    fsmsPresentationName: sp.fsmsPresentationId ? (fsmsPresentationMap.get(sp.fsmsPresentationId) ?? null) : null,
    totalShipped: shippedByDbId.get(sp.id) ?? 0,
    // Raw SS bundle components (from aliases during sync)
    components: (componentsByBundle.get(sp.id) ?? []).map((c) => ({
      id: c.id,
      componentProductId: c.componentProductId,
      componentName: c.componentProduct.name,
      componentUpc: c.componentProduct.upc,
      quantityPerBundle: c.quantityPerBundle,
      fsmsPresentationId: c.fsmsPresentationId,
      fsmsProductId: c.fsmsProductId,
      fsmsPresentationName: c.fsmsPresentationId ? (fsmsPresentationMap.get(c.fsmsPresentationId) ?? null) : null,
      fsmsProductName: c.fsmsProductId ? (fsmsProductMap.get(c.fsmsProductId) ?? null) : null,
    })),
    // Admin-configured bundle components (from Bundle Config page)
    bundleComponents: (bundleConfigsByProduct.get(sp.id) ?? []).map((bc) => ({
      componentProductId: bc.componentProductId,
      fsmsPresentationId: bc.fsmsPresentationId,
      fsmsProductId: bc.fsmsProductId,
      quantityPerBundle: bc.quantityPerBundle,
      presentationName: bc.fsmsPresentationId ? (fsmsPresentationMap.get(bc.fsmsPresentationId) ?? null) : null,
      productName: bc.fsmsProductId ? (fsmsProductMap.get(bc.fsmsProductId) ?? null) : null,
    })),
  }));

  return NextResponse.json(products);
}
