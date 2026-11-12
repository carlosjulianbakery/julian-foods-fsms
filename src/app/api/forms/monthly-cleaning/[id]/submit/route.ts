import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import { toPacificDateStr } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

  let taskId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    taskId = (body as Record<string, unknown>).taskId as string ?? null;
  } catch { /* body optional */ }

  try {
    const existing = await prisma.monthlyCleaningDraft.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status !== "draft") return NextResponse.json({ error: "Already submitted" }, { status: 409 });

    const updated = await prisma.monthlyCleaningDraft.update({
      where: { id: params.id },
      data: { status: "submitted", submittedAt: new Date(), submittedBy: userId },
    });

    try {
      await completeRuleInstanceForSubmission({
        formKey: "monthly_cleaning",
        submissionId: updated.id,
        userId,
        submissionDate: toPacificDateStr(updated.submittedAt ?? new Date()),
        taskId,
        prismaClient: prisma,
      });
    } catch (e) {
      console.error("[rule-instance-complete] monthly_cleaning:", e);
    }

    return NextResponse.json({ success: true, submittedAt: updated.submittedAt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/forms/monthly-cleaning/[id]/submit]", msg);
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }
}
