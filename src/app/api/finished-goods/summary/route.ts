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

  const [rows, lastSync] = await Promise.all([
    prisma.finishedGoodsInventory.findMany({ select: { totalProduced: true, totalShipped: true, onHand: true } }),
    prisma.shipstationSyncLog.findFirst({
      where: { status: "success" },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, shipmentsNew: true, itemsMatched: true, itemsUnmatched: true },
    }),
  ]);

  const totalProduced = rows.reduce((s, r) => s + r.totalProduced, 0);
  const totalShipped = rows.reduce((s, r) => s + r.totalShipped, 0);
  const totalOnHand = rows.reduce((s, r) => s + r.onHand, 0);
  const skuCount = rows.length;

  return NextResponse.json({ totalProduced, totalShipped, totalOnHand, skuCount, lastSync });
}
