import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/purchasing/purchase-orders/search
// ?q=text&status=sent,partial  (default: sent,partial)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const statusParam = searchParams.get("status") ?? "sent,partial";
  const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (!q) return NextResponse.json({ purchaseOrders: [] });

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      poNumber: { contains: q, mode: "insensitive" },
      status: { in: statuses },
    },
    include: {
      items: {
        where: { isFullyReceived: false },
        include: {
          material: {
            select: { id: true, coaRequired: true, isTemperatureSensitive: true, hasSpecialRisk: true },
          },
        },
        orderBy: { materialName: "asc" },
      },
    },
    orderBy: { poNumber: "asc" },
    take: 10,
  });

  // Shape the response — flatten material flags onto item
  const result = pos.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    status: po.status,
    estimatedDeliveryDate: po.estimatedDeliveryDate?.toISOString() ?? null,
    outstandingItemsCount: po.items.length,
    items: po.items.map((it) => ({
      id: it.id,
      materialId: it.materialId,
      materialName: it.materialName,
      qtyOrdered: it.qtyOrdered,
      qtyReceived: it.qtyReceived,
      qtyRemaining: it.qtyRemaining,
      unit: it.unit,
      isFullyReceived: it.isFullyReceived,
      coaRequired: it.material?.coaRequired ?? false,
      isTemperatureSensitive: it.material?.isTemperatureSensitive ?? false,
      hasSpecialRisk: it.material?.hasSpecialRisk ?? false,
    })),
  }));

  return NextResponse.json({ purchaseOrders: result });
}
