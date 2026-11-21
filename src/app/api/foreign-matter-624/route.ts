import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { FOREIGN_MATTER_FACILITY, parsePeriod, periodForDate } from "@/lib/foreign-matter-624";
import { canUseForeignMatter, findTaskForPeriod, foreignMatterTaskById, loadLiveItems, loadListVersion } from "@/lib/foreign-matter-624-server";

export const dynamic = "force-dynamic";

// GET /api/foreign-matter-624 — the record list (this is the log)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.foreignMatterRecord.findMany({
    where: { facility: FOREIGN_MATTER_FACILITY },
    orderBy: { periodStart: "desc" },
    take: 72,
    select: {
      id: true, period: true, periodStart: true, periodEnd: true, status: true, conductedBy: true, initials: true,
      okCount: true, failCount: true, submittedAt: true, updatedAt: true,
      submittedBy: { select: { name: true } },
    },
  });
  return NextResponse.json(records);
}

/**
 * POST /api/foreign-matter-624 — get or create the draft of a period.
 * Which period: the one named in `period`; otherwise the period of the task the form was opened from
 * (its own period, also when that task is overdue); otherwise the current Pacific half-month.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { period?: string; taskId?: string | null };
  const today = getPacificToday();
  const current = periodForDate(today);
  const openedFrom = await foreignMatterTaskById(prisma, body.taskId);
  const period = body.period ? parsePeriod(body.period) : openedFrom ? periodForDate(openedFrom.dueDate) : current;
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  // A period that has not started yet has no form
  if (period.start > today) return NextResponse.json({ error: "That period has not started yet." }, { status: 400 });

  // The task of this period: the one the form was opened from if it is this period's, else the one due on its last day
  const task = openedFrom && periodForDate(openedFrom.dueDate).key === period.key ? openedFrom : await findTaskForPeriod(prisma, period);

  const where = { facility_period: { facility: FOREIGN_MATTER_FACILITY, period: period.key } };
  let record = await prisma.foreignMatterRecord.findUnique({ where });
  if (!record) {
    try {
      record = await prisma.foreignMatterRecord.create({
        data: {
          facility: FOREIGN_MATTER_FACILITY,
          period: period.key,
          periodStart: new Date(`${period.start}T00:00:00Z`),
          periodEnd: new Date(`${period.end}T00:00:00Z`),
          status: "draft",
          items: [],
          listVersion: await loadListVersion(prisma),
          createdById: session.user.id,
          linkedInstanceId: task?.id ?? null,
        },
      });
    } catch (e) {
      // Another request created it first
      if ((e as { code?: string }).code !== "P2002") throw e;
      record = await prisma.foreignMatterRecord.findUnique({ where });
    }
  }
  if (!record) return NextResponse.json({ error: "Could not open the form" }, { status: 500 });

  return NextResponse.json({
    record,
    items: record.status === "draft" ? await loadLiveItems(prisma) : [],
    listVersion: await loadListVersion(prisma),
    task: task ? { id: task.id, dueDate: task.dueDate } : null,
    isCurrentPeriod: period.key === current.key,
  });
}
