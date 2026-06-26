import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST — create acknowledgment
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = (session.user as { id: string }).id;
  const body = await req.json() as {
    materialId: string;
    alertType: string;
    note?: string;
    expiresInDays?: number;
  };

  const { materialId, alertType, note, expiresInDays = 7 } = body;
  if (!materialId || !alertType) {
    return NextResponse.json({ error: "materialId and alertType are required" }, { status: 400 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.min(Math.max(expiresInDays, 1), 30));

  // Remove any existing active ack for this material first (replace semantics)
  await prisma.stockAlertAcknowledgment.updateMany({
    where: { materialId, isResolved: false },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  const ack = await prisma.stockAlertAcknowledgment.create({
    data: {
      materialId,
      alertType,
      acknowledgedById: userId,
      note: note?.trim() || null,
      expiresAt,
    },
    include: { acknowledgedBy: { select: { name: true } } },
  });

  return NextResponse.json({ id: ack.id, expiresAt: ack.expiresAt?.toISOString() }, { status: 201 });
}

// PATCH — reopen (mark resolved so it stops suppressing the alert)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string }).role ?? "";
  if (role !== "SUPERVISOR" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { id: string };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.stockAlertAcknowledgment.update({
    where: { id: body.id },
    data: { isResolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
