import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { VERIFICATION_FACILITY, VERIFICATION_FORM_KEY, buildSnapshot, splitStored, submitProblems, valuesForLiveList } from "@/lib/verification-624";
import { canUseVerification, loadLiveEquipment, loadListVersion } from "@/lib/verification-624-server";

export const dynamic = "force-dynamic";

// POST /api/verification-624/[id]/submit
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { taskId?: string | null };

  const record = await prisma.verification624Record.findUnique({ where: { id: params.id } });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (record.status !== "draft") return NextResponse.json({ error: "This period was already submitted.", code: "already_submitted" }, { status: 409 });

  const equipment = await loadLiveEquipment(prisma);
  const stored = splitStored(record.items);
  const values = valuesForLiveList(equipment, stored.entries);
  const problems = submitProblems(equipment, values, record.initials);
  if (problems.length > 0) return NextResponse.json({ error: "The form is not complete.", problems }, { status: 422 });

  // Full copy of names, locations, readings and results: later list edits never change this record
  const snapshot = buildSnapshot(equipment, values);
  const now = new Date();
  const taskId = body.taskId ?? record.linkedInstanceId ?? null;
  const saved = await prisma.verification624Record.updateMany({
    where: { id: params.id, status: "draft", updatedAt: record.updatedAt },
    data: {
      status: "submitted",
      items: [...snapshot.items, ...(stored.header ? [stored.header] : [])] as never,
      okCount: snapshot.okCount,
      failCount: snapshot.failCount,
      notInUseCount: snapshot.notInUseCount,
      listVersion: await loadListVersion(prisma),
      conductedBy: session.user.name?.trim() || session.user.email?.split("@")[0] || "",
      submittedAt: now,
      submittedById: session.user.id,
      linkedInstanceId: taskId,
      updatedAt: now,
    },
  });
  if (saved.count !== 1) return NextResponse.json({ error: "The form changed while submitting — please review and submit again.", code: "conflict" }, { status: 409 });

  let completedInstanceId: string | null = null;
  try {
    completedInstanceId = await completeRuleInstanceForSubmission({
      formKey: VERIFICATION_FORM_KEY,
      facilityName: VERIFICATION_FACILITY,
      submissionId: params.id,
      userId: session.user.id,
      // The period's due date (15th or last day) picks that period's task when no task id came along
      submissionDate: record.periodEnd.toISOString().slice(0, 10),
      taskId,
      prismaClient: prisma as never,
    });
  } catch (e) {
    console.error("[verification-624 submit] task completion error:", e);
  }

  return NextResponse.json({ success: true, submittedAt: now.toISOString(), completedInstanceId });
}
