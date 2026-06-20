import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entry = await prisma.initialStockEntry.findUnique({
    where: { id: params.id },
    include: {
      inventoryLot: {
        select: {
          id: true,
          movements: {
            select: { movementType: true },
            where: {
              movementType: {
                in: ["out_batch_sheet", "out_cycle_count_correction", "in_cycle_count_correction"],
              },
            },
          },
        },
      },
    },
  });

  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const blockedMovements = entry.inventoryLot.movements;
  if (blockedMovements.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete: this lot has been used in batch sheets or cycle counts." },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryMovement.deleteMany({ where: { inventoryLotId: entry.inventoryLotId } });
    await tx.initialStockEntry.delete({ where: { id: params.id } });
    await tx.inventoryLot.delete({ where: { id: entry.inventoryLotId } });
  });

  return NextResponse.json({ ok: true });
}
