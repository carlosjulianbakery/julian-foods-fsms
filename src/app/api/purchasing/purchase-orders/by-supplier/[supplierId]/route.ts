import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/purchasing/purchase-orders/by-supplier/[supplierId] — open POs for a supplier
export async function GET(req: NextRequest, { params }: { params: { supplierId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERVISOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      supplierId: params.supplierId,
      status: { in: ["sent", "partial"] },
    },
    include: { items: true },
    orderBy: { sentDate: "asc" },
  });

  return NextResponse.json({ purchaseOrders: pos });
}
