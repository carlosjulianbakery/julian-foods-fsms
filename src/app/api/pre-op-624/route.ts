import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import type { RowSnapshot } from "@/components/forms624/types";
import { FRIDGE_MAX_F, FREEZER_MAX_F, ATP_MAX_RLU } from "@/components/forms624/types";

export const dynamic = "force-dynamic";

// GET  /api/pre-op-624  — list inspections (SUPERVISOR + ADMIN)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from     = searchParams.get("from");
  const to       = searchParams.get("to");
  const hasNotOk = searchParams.get("hasNotOk");

  const inspections = await prisma.preOp624Inspection.findMany({
    where: {
      ...(from ? { date: { gte: new Date(from) } } : {}),
      ...(to   ? { date: { lte: new Date(to + "T23:59:59Z") } } : {}),
      ...(hasNotOk === "true" ? { hasNotOk: true } : hasNotOk === "false" ? { hasNotOk: false } : {}),
    },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      id: true,
      date: true,
      conductedBy: true,
      rows: true,
      hasNotOk: true,
      overallOk: true,
      submittedAt: true,
      linkedInstanceId: true,
      submittedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(
    inspections.map((i) => ({
      ...i,
      date: i.date.toISOString().slice(0, 10),
    }))
  );
}

// POST /api/pre-op-624  — submit (SUPERVISOR + ADMIN)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    date: string;
    conductedBy: string;
    rows: RowSnapshot[];
    taskInstanceId?: string;
  };

  if (!body.date)         return NextResponse.json({ error: "date required" }, { status: 400 });
  if (!body.conductedBy)  return NextResponse.json({ error: "conductedBy required" }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length === 0)
    return NextResponse.json({ error: "rows required" }, { status: 400 });

  // Snapshot the limits in force at submission time
  const rows: RowSnapshot[] = body.rows.map((r) => ({
    ...r,
    tempLimit: r.tempLimit ?? (r.key.includes("fridge") ? FRIDGE_MAX_F : r.key.includes("freezer") ? FREEZER_MAX_F : null),
    atpLimit:  r.atpLimit ?? (r.key.includes("atp") ? ATP_MAX_RLU : null),
  }));

  const hasNotOk = rows.some((r) => r.condition === "NOT_OK");
  const overallOk = !hasNotOk || rows.filter((r) => r.condition === "NOT_OK").every((r) => r.reInspected);

  const inspection = await prisma.preOp624Inspection.create({
    data: {
      date:             new Date(body.date),
      conductedBy:      body.conductedBy.toUpperCase(),
      rows:             rows as never,
      hasNotOk,
      overallOk,
      submittedById:    session.user.id,
      linkedInstanceId: body.taskInstanceId ?? null,
    },
  });

  // Complete linked task instance (facility "624")
  try {
    await completeRuleInstanceForSubmission({
      formKey:        "preop_624",
      submissionDate: body.date,
      submissionId:   inspection.id,
      userId:         session.user.id,
      facilityName:   "624",
      taskId:         body.taskInstanceId ?? null,
      prismaClient:   prisma as never,
    });
  } catch (err) {
    // Task completion failure must not fail the submission
    console.error("[pre-op-624 POST] task completion error:", err);
  }

  return NextResponse.json({ id: inspection.id });
}
