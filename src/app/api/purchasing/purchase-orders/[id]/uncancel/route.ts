import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.status !== "cancelled") {
    return NextResponse.json({ error: "Purchase order is not cancelled" }, { status: 400 });
  }

  const anyReceived = po.items.some((item) => (item.qtyReceived ?? 0) > 0);
  const restoredStatus = anyReceived ? "partial" : "ordered";

  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: { status: restoredStatus, updatedAt: new Date() },
  });

  return NextResponse.json({ purchaseOrder: updated });
}
