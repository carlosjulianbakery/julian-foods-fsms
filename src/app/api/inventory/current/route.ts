import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialFilter = searchParams.get("material") ?? "";
  const supplierFilter = searchParams.get("supplier") ?? "";
  const statusFilter   = searchParams.getAll("status");
  const lotFilter      = searchParams.get("lot") ?? "";
  const expFrom        = searchParams.get("exp_from") ?? "";
  const expTo          = searchParams.get("exp_to")   ?? "";

  // Update expiration status for all lots before returning
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.inventoryLot.updateMany({
    where: {
      expirationDate: { lt: today },
      status: { notIn: ["expired", "recalled"] },
    },
    data: { status: "expired" },
  });

  const lots = await prisma.inventoryLot.findMany({
    where: {
      ...(materialFilter ? { materialName: { contains: materialFilter, mode: "insensitive" } } : {}),
      ...(supplierFilter ? { supplierName: { contains: supplierFilter, mode: "insensitive" } } : {}),
      ...(statusFilter.length > 0 ? { status: { in: statusFilter } } : {}),
      ...(lotFilter ? { lotNumber: { contains: lotFilter, mode: "insensitive" } } : {}),
      ...(expFrom ? { expirationDate: { gte: new Date(expFrom) } } : {}),
      ...(expTo   ? { expirationDate: { lte: new Date(expTo + "T23:59:59") } } : {}),
    },
    include: {
      material: { select: { minimumStockQuantity: true, minimumStockUnit: true } },
      initialStockEntry: {
        select: {
          enteredAt: true,
          enteredBy: { select: { name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { receivedDate: "desc" }],
  });

  // Sort by status priority
  const statusOrder: Record<string, number> = {
    expired: 0, quarantined: 1, recalled: 2, low_stock: 3,
    conditional: 4, active: 5, depleted: 6,
  };
  lots.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

  return NextResponse.json(lots);
}
