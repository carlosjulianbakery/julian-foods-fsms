import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { FACILITIES_FACILITY, parsePeriod, periodForDate } from "@/lib/facilities-checklist-624";
import { canUseFacilities, facilitiesTaskById, findTaskForPeriod, loadLiveItems, loadListVersion } from "@/lib/facilities-checklist-624-server";

export const dynamic = "force-dynamic";

// GET /api/facilities-checklist-624 — the record list (this is the log)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.facilitiesChecklistRecord.findMany({
    where: { facility: FACILITIES_FACILITY },
    orderBy: { periodStart: "desc" },
    take: 104,
    select: {
      id: true, period: true, periodStart: true, periodEnd: true, status: true, conductedBy: true, initials: true,
      okCount: true, failCount: true, submittedAt: true, updatedAt: true,
      submittedBy: { select: { name: true } },
    },
  });
  return NextResponse.json(records);
}

/**
 * POST /api/facilities-checklist-624 — get or create the draft of a week.
 * Which week: the one named in `period`; otherwise the week of the task the form was opened from
 * (its own week, also when that task is overdue); otherwise the current Pacific week.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { period?: string; taskId?: string | null };
  const current = periodForDate(getPacificToday());
  const openedFrom = await facilitiesTaskById(prisma, body.taskId);
  const period = body.period ? parsePeriod(body.period) : openedFrom ? periodForDate(openedFrom.dueDate) : current;
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  // A week that has not started yet has no form
  if (period.start > getPacificToday()) return NextResponse.json({ error: "That week has not started yet." }, { status: 400 });

  // The task of this week: the one the form was opened from if it is in this week, else found by due date
  const task = openedFrom && periodForDate(openedFrom.dueDate).key === period.key ? openedFrom : await findTaskForPeriod(prisma, period);

  const where = { facility_period: { facility: FACILITIES_FACILITY, period: period.key } };
  let record = await prisma.facilitiesChecklistRecord.findUnique({ where });
  if (!record) {
    try {
      record = await prisma.facilitiesChecklistRecord.create({
        data: {
          facility: FACILITIES_FACILITY,
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
      record = await prisma.facilitiesChecklistRecord.findUnique({ where });
    }
  }
  if (!record) return NextResponse.json({ error: "Could not open the form" }, { status: 500 });

  return NextResponse.json({
    record,
    items: record.status === "draft" ? await loadLiveItems(prisma) : [],
    listVersion: await loadListVersion(prisma),
    // Lets the page mark the right task in progress: the week's task and its due date (a Thursday, not the week's last day)
    task: task ? { id: task.id, dueDate: task.dueDate } : null,
    isCurrentWeek: period.key === current.key,
  });
}
