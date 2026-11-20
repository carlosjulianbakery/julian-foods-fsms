import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { FACILITIES_FACILITY, FACILITIES_FORM_KEY, buildSnapshot, splitStored, submitProblems, valuesForLiveList } from "@/lib/facilities-checklist-624";
import { canUseFacilities, facilitiesTaskById, findTaskForPeriod, loadLiveItems, loadListVersion, type PeriodTask } from "@/lib/facilities-checklist-624-server";

export const dynamic = "force-dynamic";

// POST /api/facilities-checklist-624/[id]/submit
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseFacilities(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { taskId?: string | null };

  const record = await prisma.facilitiesChecklistRecord.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "draft") return NextResponse.json({ error: "This week was already submitted.", code: "already_submitted" }, { status: 409 });

  const items = await loadLiveItems(prisma);
  const stored = splitStored(record.items);
  const values = valuesForLiveList(items, stored.entries);
  const problems = submitProblems(items, values, record.initials);
  if (problems.length > 0) return NextResponse.json({ error: "The form is not complete.", problems }, { status: 422 });

  /*
   * Which task this submission completes. The task is due on a weekday inside the week (Thursday),
   * so it is never found by "due date = the form's date": it is the task the form was opened from, or
   * the one already linked to the record — each only if its due date is inside THIS record's week —
   * or else the rule's instance due inside the week. No task in the week = nothing is completed.
   */
  const week = { start: record.periodStart.toISOString().slice(0, 10), end: record.periodEnd.toISOString().slice(0, 10) };
  const inWeek = (t: PeriodTask | null): PeriodTask | null => (t && t.dueDate >= week.start && t.dueDate <= week.end ? t : null);
  const task =
    inWeek(await facilitiesTaskById(prisma, body.taskId)) ??
    inWeek(await facilitiesTaskById(prisma, record.linkedInstanceId)) ??
    (await findTaskForPeriod(prisma, week));

  // Full copy of group, name, description, result, corrective action, note and time: later list edits never change this record
  const snapshot = buildSnapshot(items, values);
  const now = new Date();
  const saved = await prisma.facilitiesChecklistRecord.updateMany({
    where: { id: params.id, status: "draft", updatedAt: record.updatedAt },
    data: {
      status: "submitted",
      items: [...snapshot.items, ...(stored.header ? [stored.header] : [])] as never,
      okCount: snapshot.okCount,
      failCount: snapshot.failCount,
      listVersion: await loadListVersion(prisma),
      conductedBy: session.user.name?.trim() || session.user.email?.split("@")[0] || "",
      submittedAt: now,
      submittedById: session.user.id,
      linkedInstanceId: task?.id ?? null,
      updatedAt: now,
    },
  });
  if (saved.count !== 1) return NextResponse.json({ error: "The form changed while submitting — please review and submit again.", code: "conflict" }, { status: 409 });

  let completedInstanceId: string | null = null;
  if (task) {
    try {
      completedInstanceId = await completeRuleInstanceForSubmission({
        formKey: FACILITIES_FORM_KEY,
        facilityName: FACILITIES_FACILITY,
        submissionId: params.id,
        userId: session.user.id,
        // Lateness is worked out from today against the task's due date: after Thursday it completes as late
        submissionDate: getPacificToday(),
        taskId: task.id,
        prismaClient: prisma as never,
      });
    } catch (e) {
      console.error("[facilities-checklist-624 submit] task completion error:", e);
    }
  }

  return NextResponse.json({ success: true, submittedAt: now.toISOString(), completedInstanceId });
}
