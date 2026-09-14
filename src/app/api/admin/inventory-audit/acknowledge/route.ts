import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  return { error: null, session };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const acks = await prisma.inventoryAuditAcknowledgment.findMany({
    orderBy: { acknowledgedAt: "desc" },
    include: {
      acknowledgedBy: { select: { name: true } },
      material: { select: { name: true } },
    },
  });

  return NextResponse.json(acks);
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const userId = (session!.user as { id: string }).id;
  const body = await req.json() as {
    lotNumber: string;
    materialId: string;
    note: string;
    discrepancyType: string;
    discrepancyGap: number;
  };

  const { lotNumber, materialId, note, discrepancyType, discrepancyGap } = body;

  if (!lotNumber || !materialId || !note || note.trim().length < 10) {
    return NextResponse.json({ error: "lotNumber, materialId, and note (min 10 chars) are required" }, { status: 400 });
  }
  if (discrepancyType !== "OVER" && discrepancyType !== "UNDER") {
    return NextResponse.json({ error: "discrepancyType must be OVER or UNDER" }, { status: 400 });
  }

  // Check if already acknowledged for this lot+material+type with matching gap
  const existing = await prisma.inventoryAuditAcknowledgment.findFirst({
    where: { lotNumber, materialId, discrepancyType },
  });
  if (existing) {
    const gap = Number(existing.discrepancyGap);
    if (Math.abs(gap - Math.abs(discrepancyGap)) <= 0.1) {
      return NextResponse.json({ error: "This discrepancy is already acknowledged" }, { status: 409 });
    }
    // Gap changed significantly — delete old ack and create fresh
    await prisma.inventoryAuditAcknowledgment.delete({ where: { id: existing.id } });
  }

  const ack = await prisma.inventoryAuditAcknowledgment.create({
    data: {
      lotNumber,
      materialId,
      acknowledgedById: userId,
      note: note.trim(),
      discrepancyType,
      discrepancyGap: Math.abs(discrepancyGap),
    },
    include: {
      acknowledgedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(ack, { status: 201 });
}
