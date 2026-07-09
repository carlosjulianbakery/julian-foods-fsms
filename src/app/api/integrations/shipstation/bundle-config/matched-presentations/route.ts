import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

// Returns all SS products with configStatus=single_matched for the bundle component dropdown.
// Also returns all FSMS presentations (with UPCs) so the UPC lookup can work client-side.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [matchedProducts, fsmsProducts] = await Promise.all([
    prisma.shipstationProduct.findMany({
      where: { configStatus: "single_matched", fsmsPresentationId: { not: null } },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({ select: { id: true, name: true, presentations: true } }),
  ]);

  const presentationMap = new Map<string, { name: string; productName: string; productId: string }>();
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string }>) ?? []) {
      presentationMap.set(pr.id, { name: pr.name, productName: p.name, productId: p.id });
    }
  }

  // Build flat list of presentations with UPCs (for UPC lookup in single config)
  const allPresentations: Array<{
    fsmsPresentationId: string;
    fsmsProductId: string;
    presentationName: string;
    productName: string;
    upc: string;
  }> = [];
  for (const p of fsmsProducts) {
    for (const pr of (p.presentations as Array<{ id: string; name: string; upc?: string }>) ?? []) {
      if (pr.upc) {
        allPresentations.push({
          fsmsPresentationId: pr.id,
          fsmsProductId: p.id,
          presentationName: pr.name,
          productName: p.name,
          upc: pr.upc,
        });
      }
    }
  }

  const components = matchedProducts.map((sp) => {
    const info = sp.fsmsPresentationId ? presentationMap.get(sp.fsmsPresentationId) : null;
    return {
      id: sp.id,
      shipstationProductId: sp.shipstationProductId,
      name: sp.name,
      sku: sp.sku,
      upc: sp.upc,
      fsmsPresentationId: sp.fsmsPresentationId,
      fsmsProductId: sp.fsmsProductId,
      presentationName: info?.name ?? null,
      productName: info?.productName ?? null,
      displayLabel: info
        ? `${info.name} — ${info.productName}${sp.upc ? ` (UPC: ${sp.upc})` : ""}`
        : sp.name,
    };
  });

  return NextResponse.json({ components, allPresentations });
}
