import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient, Prisma } from "@/generated/prisma";

const prisma = new PrismaClient();
export const dynamic = "force-dynamic";

function matchStatus(matched: number, total: number): "all_matched" | "partial" | "none_matched" | "no_items" {
  if (total === 0) return "no_items";
  if (matched === total) return "all_matched";
  if (matched === 0) return "none_matched";
  return "partial";
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("store_id");
  const matchStatusFilter = searchParams.get("match_status");
  const fromDate = searchParams.get("from_date");
  const toDate = searchParams.get("to_date");
  const includeVoided = searchParams.get("include_voided") === "true";
  const search = searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("page_size") ?? "50", 10)));

  // Build where clause
  const where: Prisma.ShipstationShipmentWhereInput = {};
  if (!includeVoided) where.voided = false;
  if (storeId) where.storeId = parseInt(storeId, 10);
  if (fromDate) where.shipDate = { ...((where.shipDate as Prisma.DateTimeFilter) ?? {}), gte: new Date(fromDate) };
  if (toDate) where.shipDate = { ...((where.shipDate as Prisma.DateTimeFilter) ?? {}), lte: new Date(toDate) };
  if (search) {
    where.OR = [
      { shipstationOrderNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Fetch all FSMS presentations for enrichment
  const fsmsProducts = await prisma.product.findMany({ select: { id: true, name: true, presentations: true } });
  const fsmsProductMap = new Map<string, string>();
  const fsmsPresentationMap = new Map<string, string>();
  for (const p of fsmsProducts) {
    fsmsProductMap.set(p.id, p.name);
    const pres = (p.presentations as Array<{ id: string; name: string }>) ?? [];
    for (const pr of pres) fsmsPresentationMap.set(pr.id, pr.name);
  }

  // Fetch matching shipments with items
  const allMatchingShipments = await prisma.shipstationShipment.findMany({
    where,
    include: { items: true },
    orderBy: { shipDate: "desc" },
  });

  // Compute match status per shipment and filter
  const enriched = allMatchingShipments.map((ship) => {
    const totalItems = ship.items.length;
    const matchedItems = ship.items.filter((i) => i.fsmsPresentationId !== null).length;
    const status = matchStatus(matchedItems, totalItems);
    return { ship, totalItems, matchedItems, status };
  });

  const filtered = matchStatusFilter
    ? enriched.filter((e) => e.status === matchStatusFilter)
    : enriched;

  // Summary (over all matching, before match-status filter)
  const allVoided = allMatchingShipments.filter((s) => s.voided).length;
  const summaryItems = enriched.map((e) => e.status);
  const summary = {
    totalShipments: allMatchingShipments.filter((s) => !s.voided).length,
    totalItems: enriched.reduce((acc, e) => acc + e.totalItems, 0),
    allMatched: summaryItems.filter((s) => s === "all_matched").length,
    partial: summaryItems.filter((s) => s === "partial").length,
    noneMatched: summaryItems.filter((s) => s === "none_matched").length,
    noItems: summaryItems.filter((s) => s === "no_items").length,
    voided: allVoided,
  };

  // Paginate
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  const shipments = slice.map(({ ship, status }) => ({
    id: ship.id,
    shipstationShipmentId: ship.shipstationShipmentId,
    shipstationOrderNumber: ship.shipstationOrderNumber,
    shipstationOrderId: ship.shipstationOrderId,
    storeId: ship.storeId,
    storeName: ship.storeName,
    customerName: ship.customerName,
    orderDate: ship.orderDate.toISOString(),
    shipDate: ship.shipDate.toISOString(),
    voided: ship.voided,
    voidDate: ship.voidDate?.toISOString() ?? null,
    matchStatus: status,
    items: ship.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      shipstationProductId: item.shipstationProductId,
      upc: item.upc,
      quantityShipped: item.quantityShipped,
      isBundleComponent: item.isBundleComponent,
      bundleProductName: item.bundleProductName,
      fsmsPresentationId: item.fsmsPresentationId,
      fsmsProductId: item.fsmsProductId,
      fsmsBatchSheetId: item.fsmsBatchSheetId,
      fsmsMatchStatus: item.fsmsMatchStatus,
      fsmsPresentationName: item.fsmsPresentationId ? (fsmsPresentationMap.get(item.fsmsPresentationId) ?? null) : null,
      fsmsProductName: item.fsmsProductId ? (fsmsProductMap.get(item.fsmsProductId) ?? null) : null,
    })),
  }));

  return NextResponse.json({ shipments, total, page, pageSize, totalPages, summary });
}
