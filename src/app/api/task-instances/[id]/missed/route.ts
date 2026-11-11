import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const role = session.user.role;

  const instance = await prisma.ruleInstance.findUnique({
    where: { id: params.id },
    include: { rule: { select: { ownerId: true } } },
  });

  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only effective owner or admin can mark as missed
  const isEffectiveOwner =
    instance.ownerUserId !== null
      ? instance.ownerUserId === userId
      : instance.rule.ownerId === userId;

  if (role !== "ADMIN" && !isEffectiveOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (instance.status !== "OVERDUE") {
    return NextResponse.json(
      { error: "Only OVERDUE instances can be marked as missed" },
      { status: 400 }
    );
  }

  const body = await req.json() as { reason?: string };
  const reason = (body.reason ?? "").trim();
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "Reason must be at least 10 characters" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.ruleInstance.update({
      where: { id: params.id },
      data: {
        status: "MISSED",
        missedReason: reason,
        markedMissedById: userId,
        markedMissedAt: new Date(),
      },
    }),
    prisma.taskInstanceAudit.create({
      data: {
        instanceId: params.id,
        action: "missed",
        userId,
        note: reason,
      },
    }),
  ]);

  return NextResponse.json({ id: params.id, status: "MISSED" });
}
