import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["DUE_TODAY", "IN_PROGRESS", "OVERDUE"] as const;

/**
 * POST /api/task-instances/mark-in-progress
 *
 * Fallback endpoint for when a form opens without a ?taskId=.
 * Uses the same best-match resolution as completeRuleInstanceForSubmission:
 *  1. Exact dueDate == today wins
 *  2. Oldest OVERDUE
 *  3. Oldest open
 * Never downgrades DONE / SKIPPED / MISSED instances.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const formKey = typeof body?.formKey === "string" ? body.formKey : null;
  const facilityName = typeof body?.facilityName === "string" ? body.facilityName : null;
  if (!formKey || !facilityName) {
    return NextResponse.json({ error: "Missing formKey or facilityName" }, { status: 400 });
  }

  const today = getPacificToday();

  const candidates = await prisma.ruleInstance.findMany({
    where: {
      status: { in: [...OPEN_STATUSES, "UPCOMING"] },
      rule: { formKey, facility: { name: facilityName } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  if (candidates.length === 0) {
    return NextResponse.json({ notFound: true }, { status: 404 });
  }

  // A form that knows which period it is for sends that period's due date, so the right task is marked
  const wantedDue = typeof body?.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null;
  if (wantedDue) {
    const forPeriod = candidates.find((i) => i.dueDate.toISOString().slice(0, 10) === wantedDue);
    if (!forPeriod) return NextResponse.json({ notFound: true }, { status: 404 });
    candidates.splice(0, candidates.length, forPeriod);
  }

  const exact = candidates.find((i) => i.dueDate.toISOString().slice(0, 10) === (wantedDue ?? today));
  const openCandidates = candidates.filter((i) => (OPEN_STATUSES as readonly string[]).includes(i.status));
  const target = exact ?? openCandidates.find((i) => i.status === "OVERDUE") ?? openCandidates[0] ?? candidates[0];

  if (!target) return NextResponse.json({ notFound: true }, { status: 404 });

  // Idempotent — never downgrade
  if (["DONE", "SKIPPED", "MISSED", "IN_PROGRESS"].includes(target.status)) {
    return NextResponse.json({ id: target.id, status: target.status });
  }

  const updated = await prisma.ruleInstance.update({
    where: { id: target.id },
    data: { status: "IN_PROGRESS" },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
