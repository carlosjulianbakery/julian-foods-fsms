import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { lotNumber, materialId, note } = body as { lotNumber: string; materialId: string; note: string };

  if (!lotNumber || !materialId) {
    return NextResponse.json({ error: "lotNumber and materialId are required" }, { status: 400 });
  }
  if (!note || note.trim().length < 10) {
    return NextResponse.json({ error: "Note must be at least 10 characters" }, { status: 400 });
  }

  // Check for existing acknowledgment for this lot
  const existing = await prisma.inventoryAuditAcknowledgment.findFirst({
    where: { lotNumber, materialId, sourceType: "batch_depletion_alert" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This discrepancy is already acknowledged" },
      { status: 409 }
    );
  }

  const ack = await prisma.inventoryAuditAcknowledgment.create({
    data: {
      lotNumber,
      materialId,
      acknowledgedById: userId,
      note: note.trim(),
      discrepancyType: "N/A",
      discrepancyGap: 0,
      sourceType: "batch_depletion_alert",
    },
    include: { acknowledgedBy: { select: { name: true } } },
  });

  return NextResponse.json(ack, { status: 201 });
}
