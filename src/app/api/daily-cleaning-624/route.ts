import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { completeRuleInstanceForSubmission } from "@/lib/task-completion";
import type { CleaningRowSnapshot } from "@/components/forms624/types";

export const dynamic = "force-dynamic";

// GET  /api/daily-cleaning-624  — list records (SUPERVISOR + ADMIN)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date       = searchParams.get("date");
  const from       = searchParams.get("from");
  const to         = searchParams.get("to");
  const hasNotDone = searchParams.get("hasNotDone");

  try {
    const records = await prisma.dailyClean624Record.findMany({
      where: {
        ...(date  ? { date: { gte: new Date(date), lte: new Date(date + "T23:59:59Z") } } : {}),
        ...(from  ? { date: { gte: new Date(from) } } : {}),
        ...(to    ? { date: { lte: new Date(to + "T23:59:59Z") } } : {}),
        ...(hasNotDone === "true" ? { notDoneCount: { gt: 0 } } : {}),
      },
      orderBy: { date: "desc" },
      take: 200,
      select: {
        id: true,
        date: true,
        time: true,
        conductedBy: true,
        rows: true,
        doneCount: true,
        naCount: true,
        notDoneCount: true,
        allergenChange: true,
        notes: true,
        instructionsVer: true,
        submittedAt: true,
        linkedInstanceId: true,
        submittedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(
      records.map((r) => ({
        ...r,
        date: r.date.toISOString().slice(0, 10),
      }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || (err as { code?: string }).code === "P2021") {
      return NextResponse.json(
        { error: "db_setup_error", detail: "Run the daily-cleaning-624 migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
}

// POST /api/daily-cleaning-624  — submit (SUPERVISOR + ADMIN)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as {
    date: string;
    time: string;
    conductedBy: string;
    rows: CleaningRowSnapshot[];
    allergenChange: boolean;
    notes: string | null;
    instructionsVer: string;
    taskId?: string;
  };

  if (!body.date)        return NextResponse.json({ error: "date required" }, { status: 400 });
  if (!body.time)        return NextResponse.json({ error: "time required" }, { status: 400 });
  if (!body.conductedBy) return NextResponse.json({ error: "conductedBy required" }, { status: 400 });
  if (!Array.isArray(body.rows) || body.rows.length !== 19)
    return NextResponse.json({ error: "rows must be 19 items" }, { status: 400 });

  const untouched = body.rows.filter((r) => !(["DONE","NA","NOT_DONE"] as string[]).includes(r.state));
  if (untouched.length > 0)
    return NextResponse.json({ error: "All rows must have a state (DONE|NA|NOT_DONE)" }, { status: 400 });

  const missingReason = body.rows.filter((r) => r.state === "NOT_DONE" && !r.reason?.trim());
  if (missingReason.length > 0)
    return NextResponse.json({ error: `${missingReason.length} NOT_DONE row(s) missing reason` }, { status: 400 });

  const doneCount    = body.rows.filter((r) => r.state === "DONE").length;
  const naCount      = body.rows.filter((r) => r.state === "NA").length;
  const notDoneCount = body.rows.filter((r) => r.state === "NOT_DONE").length;

  let record;
  try {
    record = await prisma.dailyClean624Record.create({
      data: {
        date:            new Date(body.date),
        time:            body.time,
        conductedBy:     body.conductedBy.toUpperCase(),
        rows:            body.rows as never,
        doneCount,
        naCount,
        notDoneCount,
        allergenChange:  body.allergenChange ?? false,
        notes:           body.notes ?? null,
        instructionsVer: body.instructionsVer ?? "v1.0",
        submittedById:   session.user.id,
        linkedInstanceId: body.taskId ?? null,
      },
    });
  } catch (err) {
    console.error("[daily-cleaning-624 POST] create failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || (err as { code?: string }).code === "P2021") {
      return NextResponse.json(
        { error: "db_setup_error", detail: "Run the daily-cleaning-624 migration first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  try {
    await completeRuleInstanceForSubmission({
      formKey:        "daily_cleaning_624",
      submissionDate: body.date,
      submissionId:   record.id,
      userId:         session.user.id,
      facilityName:   "624",
      taskId:         body.taskId ?? null,
      prismaClient:   prisma as never,
    });
  } catch (err) {
    console.error("[daily-cleaning-624 POST] task completion error:", err);
  }

  return NextResponse.json({ id: record.id }, { status: 201 });
}
