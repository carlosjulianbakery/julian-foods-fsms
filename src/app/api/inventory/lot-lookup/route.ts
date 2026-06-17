import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json([]);

  const lots = await prisma.inventoryLot.findMany({
    where: { lotNumber: { contains: q, mode: "insensitive" } },
    include: {
      movements: {
        include: { performedBy: { select: { name: true } } },
        orderBy: { performedAt: "desc" },
      },
      receivingRecord: { select: { recordNumber: true } },
    },
    orderBy: { receivedDate: "desc" },
    take: 20,
  });

  // For each lot, also find batch sheets that used this lot
  const result = await Promise.all(lots.map(async (lot) => {
    const batchSheetIds = lot.movements
      .filter((m) => m.referenceType === "batch_sheet")
      .map((m) => m.referenceId);

    const batchSheets = batchSheetIds.length > 0
      ? await prisma.batchSheetSubmission.findMany({
          where: { id: { in: batchSheetIds } },
          select: { id: true, productionDate: true, templateName: true, productionLot: true, status: true },
        })
      : [];

    return { ...lot, batchSheets };
  }));

  return NextResponse.json(result);
}
