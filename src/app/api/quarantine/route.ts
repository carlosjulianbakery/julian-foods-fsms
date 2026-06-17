import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   ?? "";
  const material = searchParams.get("material") ?? "";
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo   = searchParams.get("date_to")   ?? "";

  const records = await prisma.quarantineRecord.findMany({
    where: {
      ...(status   ? { status } : {}),
      ...(material ? { materialName: { contains: material, mode: "insensitive" } } : {}),
      ...(dateFrom ? { createdAt: { gte: new Date(dateFrom) } } : {}),
      ...(dateTo   ? { createdAt: { lte: new Date(dateTo + "T23:59:59") } } : {}),
    },
    include: {
      receivingRecord: { select: { recordNumber: true, date: true } },
      resolvedBy: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(records);
}
