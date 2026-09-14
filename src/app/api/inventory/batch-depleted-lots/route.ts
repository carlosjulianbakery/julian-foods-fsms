import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find lots that:
  // 1. Are NOT depleted and still show qty > 0 in the system
  // 2. Have at least one out_batch_sheet movement where quantityAfter <= 0
  //    (meaning a batch sheet thought it fully depleted the lot)
  const lots = await prisma.inventoryLot.findMany({
    where: {
      status: { not: "depleted" },
      quantityRemaining: { gt: 0 },
      movements: {
        some: {
          movementType: "out_batch_sheet",
          quantityAfter: { lte: 0 },
        },
      },
    },
    select: {
      id: true,
      lotNumber: true,
      materialId: true,
      materialName: true,
      quantityRemaining: true,
      unit: true,
      movements: {
        where: {
          movementType: "out_batch_sheet",
          quantityAfter: { lte: 0 },
        },
        orderBy: { performedAt: "desc" },
        take: 1,
        select: {
          referenceId: true,
          performedAt: true,
          performedBy: { select: { name: true } },
        },
      },
    },
  });

  if (lots.length === 0) return NextResponse.json([]);

  // Fetch batch sheet details for the most recent depleting movement per lot
  const batchSheetIds = lots
    .map((l) => l.movements[0]?.referenceId)
    .filter((id): id is string => Boolean(id));

  const batchSheets = await prisma.batchSheetSubmission.findMany({
    where: { id: { in: batchSheetIds } },
    select: {
      id: true,
      templateName: true,
      productionDate: true,
      submittedBy: { select: { name: true } },
    },
  });

  const bsMap = new Map(batchSheets.map((bs) => [bs.id, bs]));

  // Build response sorted by most-recent batch sheet date descending
  const results = lots
    .map((lot) => {
      const mv = lot.movements[0];
      if (!mv) return null;
      const bs = bsMap.get(mv.referenceId);
      const bsDate = bs?.productionDate
        ? new Date(bs.productionDate).toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            timeZone: "America/Los_Angeles",
          })
        : null;
      return {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        materialId: lot.materialId,
        materialName: lot.materialName,
        systemQuantityRemaining: lot.quantityRemaining,
        systemUnit: lot.unit,
        depletedInBatchSheet: {
          batchSheetId: mv.referenceId,
          batchSheetDate: bsDate ?? "",
          productProduced: bs?.templateName ?? "Unknown product",
          submittedBy: mv.performedBy.name,
          _sortDate: bs?.productionDate ?? mv.performedAt,
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const da = new Date(a.depletedInBatchSheet._sortDate).getTime();
      const db = new Date(b.depletedInBatchSheet._sortDate).getTime();
      return db - da;
    })
    .map(({ depletedInBatchSheet: { _sortDate: _, ...rest }, ...lot }) => ({
      ...lot,
      depletedInBatchSheet: rest,
    }));

  return NextResponse.json(results);
}
