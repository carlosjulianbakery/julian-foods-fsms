import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { FOREIGN_MATTER_FACILITY, FOREIGN_MATTER_FORM_KEY, buildSnapshot, splitStored, submitProblems, valuesForLiveList } from "@/lib/foreign-matter-624";
import { canUseForeignMatter, foreignMatterTaskById, findTaskForPeriod, loadLiveItems, loadListVersion, type PeriodTask } from "@/lib/foreign-matter-624-server";

export const dynamic = "force-dynamic";

// POST /api/foreign-matter-624/[id]/submit
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseForeignMatter(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { taskId?: string | null };

  const record = await prisma.foreignMatterRecord.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "draft") return NextResponse.json({ error: "This period was already submitted.", code: "already_submitted" }, { status: 409 });

  const items = await loadLiveItems(prisma);
  const stored = splitStored(record.items);
  const values = valuesForLiveList(items, stored.entries);
  const problems = submitProblems(items, values, record.initials);
  if (problems.length > 0) return NextResponse.json({ error: "The form is not complete.", problems }, { status: 422 });

  /*
   * Which task this submission completes: the one the form was opened from, or the one already linked
   * to the record — each only if it is due on THIS record's last day — or else the rule's instance due
   * that day. No task for the period = nothing is completed (never another period's task).
   */
  const periodEnd = record.periodEnd.toISOString().slice(0, 10);
  const ofPeriod = (t: PeriodTask | null): PeriodTask | null => (t && t.dueDate === periodEnd ? t : null);
  const task =
    ofPeriod(await foreignMatterTaskById(prisma, body.taskId)) ??
    ofPeriod(await foreignMatterTaskById(prisma, record.linkedInstanceId)) ??
    (await findTaskForPeriod(prisma, { end: periodEnd }));

  // Full copy of section, area, name, expected quantity, result, comment, found quantity and time:
  // later list edits never change this record
  const snapshot = buildSnapshot(items, values);
  const now = new Date();
  const saved = await prisma.foreignMatterRecord.updateMany({
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
        formKey: FOREIGN_MATTER_FORM_KEY,
        facilityName: FOREIGN_MATTER_FACILITY,
        submissionId: params.id,
        userId: session.user.id,
        // Lateness is worked out from today against the task's due date (the period's last day)
        submissionDate: getPacificToday(),
        taskId: task.id,
        prismaClient: prisma as never,
      });
    } catch (e) {
      console.error("[foreign-matter-624 submit] task completion error:", e);
    }
  }

  return NextResponse.json({ success: true, submittedAt: now.toISOString(), completedInstanceId });
}
