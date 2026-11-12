import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const note: string = (body.note ?? "").trim();
  if (note.length < 10) {
    return NextResponse.json({ error: "Note must be at least 10 characters" }, { status: 400 });
  }

  const userId = session.user.id;
  const role = session.user.role;

  const instance = await prisma.ruleInstance.findUnique({
    where: { id: params.id },
    include: { rule: { select: { ownerId: true, formKey: true } } },
  });

  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (instance.rule.formKey !== "manual") {
    return NextResponse.json({ error: "Only manual tasks can be completed via this endpoint" }, { status: 400 });
  }

  const isEffectiveOwner =
    instance.ownerUserId !== null
      ? instance.ownerUserId === userId
      : instance.rule.ownerId === userId;
  if (role !== "ADMIN" && !isEffectiveOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["UPCOMING", "DUE_TODAY", "OVERDUE", "IN_PROGRESS"].includes(instance.status)) {
    return NextResponse.json({ error: "Instance cannot be completed in its current state" }, { status: 400 });
  }

  const now = new Date();
  const today = getPacificToday();
  const dueStr = instance.dueDate.toISOString().slice(0, 10);
  const completedLate = dueStr < today;
  const daysLate = completedLate
    ? Math.floor(
        (new Date(today + "T12:00:00Z").getTime() - new Date(dueStr + "T12:00:00Z").getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  const effectiveOwner = instance.ownerUserId ?? instance.rule.ownerId;

  await prisma.ruleInstance.update({
    where: { id: params.id },
    data: {
      status: "DONE",
      doneAt: now,
      doneById: userId,
      completedLate,
      daysLate,
      ownerUserId: effectiveOwner,
    },
  });

  await prisma.taskInstanceAudit.create({
    data: {
      instanceId: params.id,
      action: "COMPLETED",
      userId,
      note,
    },
  });

  return NextResponse.json({ ok: true });
}
