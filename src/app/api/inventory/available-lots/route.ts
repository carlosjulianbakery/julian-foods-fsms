import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("material_id") ?? "";
  if (!materialId) return NextResponse.json([]);

  const lots = await prisma.inventoryLot.findMany({
    where: {
      materialId,
      status: { in: ["active", "low_stock", "conditional"] },
      quantityRemaining: { gt: 0 },
    },
    orderBy: [
      { expirationDate: "asc" },
      { receivedDate: "asc" },
    ],
  });

  return NextResponse.json(lots);
}
