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

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { materialType: true },
  });
  const isWip = material?.materialType === "wip";

  // WIP lots include depleted so supervisors can reference prior batches for traceability.
  const lots = await prisma.inventoryLot.findMany({
    where: {
      materialId,
      status: isWip
        ? { in: ["active", "low_stock", "conditional", "depleted"] }
        : { in: ["active", "low_stock", "conditional"] },
      ...(isWip ? {} : { quantityRemaining: { gt: 0 } }),
    },
    orderBy: [
      { receivedDate: "desc" },
      { expirationDate: "asc" },
    ],
  });

  return NextResponse.json(lots);
}
