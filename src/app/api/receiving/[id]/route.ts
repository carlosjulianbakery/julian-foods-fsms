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

  // Delete related records
  if (record.inventoryLot) {
    await prisma.inventoryMovement.deleteMany({ where: { inventoryLotId: record.inventoryLot.id } });
    await prisma.inventoryLot.delete({ where: { id: record.inventoryLot.id } });
  }
  if (record.quarantineRecord) {
    await prisma.quarantineRecord.delete({ where: { id: record.quarantineRecord.id } });
  }
  await prisma.receivingRecord.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
