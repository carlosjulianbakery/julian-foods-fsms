import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { toPacificDateStr, lastDayOfMonth } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";

type LineRecord = {
  key: string;
  state: string;
  reason: string | null;
  lineDate: string | null;
  lineInitials: string | null;
  [key: string]: unknown;
};

// POST /api/monthly-cleaning-624/[id]/submit  — SUPERVISOR + ADMIN
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let taskId: string | null = null;
  try {
    const body = await req.json().catch(() => ({})) as { taskId?: string };
    taskId = body.taskId ?? null;
  } catch { /* body optional */ }

  try {
    const record = await prisma.monthlyClean624Record.findUnique({ where: { id: params.id } });
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (record.status !== "draft")
      return NextResponse.json({ error: "Already submitted", code: "already_submitted" }, { status: 409 });

    // Server-side: verify all 19 lines are answered
    const lines = record.lines as LineRecord[];
    const untouched = lines.filter((l) => l.state === "UNTOUCHED");
    if (untouched.length > 0)
      return NextResponse.json({ error: `${untouched.length} line(s) still unanswered` }, { status: 422 });

    const missingReason = lines.filter((l) => l.state === "NOT_DONE" && !l.reason?.trim());
    if (missingReason.length > 0)
      return NextResponse.json({ error: `${missingReason.length} NOT_DONE line(s) missing reason` }, { status: 422 });

    const conductedBy = session.user.name?.trim() || session.user.email?.split("@")[0] || "";
    const now = new Date();

    const updated = await prisma.monthlyClean624Record.update({
      where: { id: params.id },
      data: {
        status: "submitted",
        conductedBy,
        submittedAt: now,
        submittedById: session.user.id,
        linkedInstanceId: taskId ?? record.linkedInstanceId,
      },
    });

    let completedInstanceId: string | null = null;
    try {
      // Match the instance due on the last day of this record's month
      const submissionDate = toPacificDateStr(now);
      const lastDay = lastDayOfMonth(record.month);
      completedInstanceId = await completeRuleInstanceForSubmission({
        formKey:        "monthly_cleaning_624",
        facilityName:   "624",
        submissionId:   updated.id,
        userId:         session.user.id,
        submissionDate: lastDay,       // match the month-end instance
        taskId:         taskId ?? record.linkedInstanceId ?? null,
        prismaClient:   prisma as never,
      });
      void submissionDate;
    } catch (e) {
      console.error("[monthly-cleaning-624 submit] task completion error:", e);
    }

    return NextResponse.json({
      success: true,
      submittedAt: updated.submittedAt,
      completedInstanceId,
    });
  } catch (err) {
    const prismaCode = (err as { code?: string }).code;
    const msg = err instanceof Error ? err.message : String(err);
    const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (prismaCode === "P2021" || prismaCode === "P2022" || msg.includes("does not exist")) {
      const prismaMeta = (err as { meta?: { table?: string; column?: string } }).meta;
      const subject = prismaCode === "P2022" && prismaMeta?.column
        ? `column ${prismaMeta.column}`
        : `table ${prismaMeta?.table ?? "monthly_clean_624_records"}`;
      return NextResponse.json(
        { error: "db_setup_error", detail: `db_setup_error · ${prismaCode ?? "unknown"} · ${subject} · ref ${refId}` },
        { status: 503 }
      );
    }
    console.error(`[monthly-cleaning-624 POST/:id/submit] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}
