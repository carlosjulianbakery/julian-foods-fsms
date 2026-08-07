import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/batch-sheet/[id]/depletion
// Admin-only. Returns the set of lot numbers that reached quantityAfter = 0
// as a direct result of this batch sheet's inventory movements.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string })?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        referenceType: "batch_sheet",
        referenceId: params.id,
        quantityAfter: 0,
      },
      select: {
        lotNumber: true,
        inventoryLotId: true,
      },
    });

    // Return a deduplicated set of depleted lot numbers and lot IDs
    const depletedLotNumbers = new Set(movements.map((m) => m.lotNumber));
    const depletedLotIds = new Set(movements.map((m) => m.inventoryLotId));

    return NextResponse.json({
      depletedLotNumbers: Array.from(depletedLotNumbers),
      depletedLotIds: Array.from(depletedLotIds),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet/[id]/depletion]", msg);
    return NextResponse.json({ error: "Failed to load depletion data" }, { status: 500 });
  }
}
