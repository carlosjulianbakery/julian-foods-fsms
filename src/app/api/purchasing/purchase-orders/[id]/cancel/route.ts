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

  const po = await prisma.purchaseOrder.findUnique({ where: { id: params.id } });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: { status: "cancelled", updatedAt: new Date() },
  });

  return NextResponse.json({ purchaseOrder: updated });
}
