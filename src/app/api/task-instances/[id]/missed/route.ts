import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

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
    include: {
      rule: {
        select: {
          ownerId: true,
          title: true,
          facility: { select: { name: true } },
        },
      },
    },
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

  // Notify all admins (except the person who marked it) — non-blocking
  try {
    const [marker, admins] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } }),
    ]);
    const markerName = marker?.name ?? "Someone";
    const dueDateStr = instance.dueDate
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        }).format(instance.dueDate)
      : "unknown date";
    const facilityName = instance.rule.facility.name;
    const taskTitle = instance.rule.title;

    await Promise.all(
      admins
        .filter((a) => a.id !== userId)
        .map((a) =>
          notifyUser({
            userId: a.id,
            type: "TASK_MISSED",
            instanceId: params.id,
            title: `"${taskTitle}" marked as missed by ${markerName}`,
            body: `Facility: ${facilityName} | Due: ${dueDateStr}${reason ? ` | Reason: ${reason}` : ""}`,
            dedupeKey: `TASK_MISSED:${params.id}:${a.id}`,
          })
        )
    );
  } catch (e) {
    console.error("[missed] notification error:", e);
  }

  return NextResponse.json({ id: params.id, status: "MISSED" });
}
