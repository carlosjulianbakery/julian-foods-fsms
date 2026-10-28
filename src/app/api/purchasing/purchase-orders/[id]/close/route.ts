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

  const body = await req.json().catch(() => ({}));
  const note: string | undefined = body.note?.trim() || undefined;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.status !== "partial") {
    return NextResponse.json({ error: "Purchase order is not in partial status" }, { status: 400 });
  }

  const now = new Date();
  const closedBy = session.user.name ?? session.user.email ?? session.user.id;

  const [updated] = await prisma.$transaction([
    prisma.purchaseOrder.update({
      where: { id: params.id },
      data: {
        status: "closed",
        closedAt: now,
        closedBy,
        closeNote: note ?? null,
        updatedAt: now,
      },
    }),
    prisma.purchaseOrderItem.updateMany({
      where: { purchaseOrderId: params.id, isFullyReceived: false },
      data: { isFullyReceived: true },
    }),
  ]);

  return NextResponse.json({ purchaseOrder: updated });
}
