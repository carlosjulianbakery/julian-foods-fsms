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

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const instance = await prisma.ruleInstance.findUnique({ where: { id: params.id } });
  if (!instance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = getPacificToday();
  const dueDateStr = instance.dueDate.toISOString().slice(0, 10);

  let reopenedStatus: "OVERDUE" | "DUE_TODAY" | "UPCOMING";
  if (dueDateStr < today) reopenedStatus = "OVERDUE";
  else if (dueDateStr === today) reopenedStatus = "DUE_TODAY";
  else reopenedStatus = "UPCOMING";

  const body = await req.json() as { note?: string };
  const note = (body.note ?? "").trim() || `Reopened by admin to ${reopenedStatus}`;

  await prisma.$transaction([
    prisma.ruleInstance.update({
      where: { id: params.id },
      data: {
        status: reopenedStatus,
        doneAt: null,
        doneById: null,
        skippedAt: null,
        skippedById: null,
        skipReason: null,
        completedLate: false,
        daysLate: null,
        completedBySubmissionId: null,
        missedReason: null,
        markedMissedById: null,
        markedMissedAt: null,
      },
    }),
    prisma.taskInstanceAudit.create({
      data: {
        instanceId: params.id,
        action: "reopened",
        userId: session.user.id,
        note,
      },
    }),
  ]);

  return NextResponse.json({ id: params.id, status: reopenedStatus });
}
