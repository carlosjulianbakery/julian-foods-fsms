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
  const lotFilter      = searchParams.get("lot")      ?? "";
  const dateFrom       = searchParams.get("date_from") ?? "";
  const dateTo         = searchParams.get("date_to")   ?? "";
  const typeFilter     = searchParams.get("type")      ?? "";
  const performedBy    = searchParams.get("performed_by") ?? "";

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      // Filter by current material name (via relation) so renamed materials still match
      ...(materialFilter ? { material: { name: { contains: materialFilter, mode: "insensitive" } } } : {}),
      ...(lotFilter      ? { lotNumber: { contains: lotFilter, mode: "insensitive" } } : {}),
      ...(dateFrom       ? { performedAt: { gte: new Date(dateFrom) } } : {}),
      ...(dateTo         ? { performedAt: { lte: new Date(dateTo + "T23:59:59") } } : {}),
      ...(typeFilter     ? { movementType: typeFilter } : {}),
      ...(performedBy    ? { performedBy: { name: { contains: performedBy, mode: "insensitive" } } } : {}),
    },
    include: {
      performedBy: { select: { name: true } },
      material:    { select: { name: true } },
    },
    orderBy: { performedAt: "desc" },
    take: 500,
  });

  // Override stored materialName snapshot with the current name from the materials table
  const rows = movements.map((m) => ({
    ...m,
    materialName: m.material?.name ?? m.materialName,
    material: undefined,
  }));

  return NextResponse.json(rows);
}
