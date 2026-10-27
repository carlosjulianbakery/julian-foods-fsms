import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const record = await prisma.receivingRecord.findUnique({
    where: { id: params.id },
    include: {
      receivedBy: { select: { name: true } },
      inventoryLot: true,
      quarantineRecord: true,
    },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(record);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check if lot has been used in batch sheets
  const record = await prisma.receivingRecord.findUnique({
    where: { id: params.id },
    include: { inventoryLot: { include: { movements: true } }, quarantineRecord: true },
  });

  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Block deletion if the lot has OUT movements (batch sheet usage)
  const hasUsage = record.inventoryLot?.movements.some((m) => m.quantity < 0);
  if (hasUsage) {
    return NextResponse.json(
      { error: "Cannot delete: this lot has been used in batch sheets." },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // 1. Delete per-delivery obligations first (prevents FK violation for coaRequired/hasSpecialRisk materials)
    await tx.perDeliveryObligation.deleteMany({ where: { receivingRecordId: params.id } });

    // 2. Delete inventory movement and lot
    if (record.inventoryLot) {
      await tx.inventoryMovement.deleteMany({ where: { inventoryLotId: record.inventoryLot.id } });
      await tx.inventoryLot.delete({ where: { id: record.inventoryLot.id } });
    }

    // 3. Delete quarantine record
    if (record.quarantineRecord) {
      await tx.quarantineRecord.delete({ where: { id: record.quarantineRecord.id } });
    }

    // 4. Delete the receiving record
    await tx.receivingRecord.delete({ where: { id: params.id } });

    // 5. Reverse PO item quantities if linked
    if (record.poId && record.materialId) {
      const poItem = await tx.purchaseOrderItem.findFirst({
        where: { poId: record.poId, materialId: record.materialId },
      });
      if (poItem) {
        const newQtyReceived = Math.max(0, poItem.qtyReceived - record.quantityReceived);
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: {
            qtyReceived: newQtyReceived,
            qtyRemaining: poItem.qtyOrdered - newQtyReceived,
            isFullyReceived: newQtyReceived >= poItem.qtyOrdered,
          },
        });
      }

      // 6. Re-evaluate PO status
      const allItems = await tx.purchaseOrderItem.findMany({ where: { poId: record.poId } });
      const allReceived = allItems.every((it) => it.isFullyReceived);
      const anyReceived = allItems.some((it) => it.qtyReceived > 0);
      await tx.purchaseOrder.update({
        where: { id: record.poId },
        data: { status: allReceived ? "received" : anyReceived ? "partial" : "ordered" },
      });
    }
  });

  return NextResponse.json({ success: true });
}
