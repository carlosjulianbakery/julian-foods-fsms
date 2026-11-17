import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificMonthKey } from "@/lib/pacific-time";
import { MONTHLY_ACTIVITIES, MONTHLY_CHEMICAL_MAP, INSTRUCTIONS_VER_MONTHLY } from "@/app/(dashboard)/dashboard/supervisor/monthly-cleaning-624/config";
import type { MonthlyClean624LineSnapshot } from "@/components/forms624/types";

export const dynamic = "force-dynamic";

function buildInitialLines(): MonthlyClean624LineSnapshot[] {
  return MONTHLY_ACTIVITIES.map((a) => ({
    key: a.key,
    labelEn: a.en,
    labelEs: a.es,
    chemical: MONTHLY_CHEMICAL_MAP[a.key] ?? null,
    state: "NOT_DONE" as const,  // placeholder; actual state is tracked via UNTOUCHED sentinel
    reason: null,
    lineDate: null,
    lineInitials: null,
    doneByUserId: null,
    updatedAt: new Date().toISOString(),
    autoFilled: false,
    // We use a custom UNTOUCHED sentinel by not storing it in DB;
    // the initial DB record stores state as "UNTOUCHED" string
  })).map((l) => ({ ...l, state: "UNTOUCHED" as unknown as "DONE" }));
}

/** Build the 19 initial lines for a new record (all UNTOUCHED). */
function buildUntouchedLines() {
  return MONTHLY_ACTIVITIES.map((a) => ({
    key: a.key,
    labelEn: a.en,
    labelEs: a.es,
    chemical: MONTHLY_CHEMICAL_MAP[a.key] ?? null,
    state: "UNTOUCHED",
    reason: null,
    lineDate: null,
    lineInitials: null,
    doneByUserId: null,
    updatedAt: new Date().toISOString(),
    autoFilled: false,
  }));
}

// GET /api/monthly-cleaning-624  — list records (SUPERVISOR + ADMIN)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const year   = searchParams.get("year");

  try {
    const records = await prisma.monthlyClean624Record.findMany({
      where: {
        facility: "624",
        ...(status ? { status } : {}),
        ...(year ? { month: { startsWith: year + "-" } } : {}),
      },
      orderBy: { month: "desc" },
      take: 60,
      select: {
        id: true,
        facility: true,
        month: true,
        status: true,
        conductedBy: true,
        initials: true,
        doneCount: true,
        naCount: true,
        notDoneCount: true,
        autoSubmitted: true,
        lastEditedBy: true,
        lastEditedAt: true,
        submittedAt: true,
        submittedBy: { select: { name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(records);
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
    console.error(`[monthly-cleaning-624 GET] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}

// POST /api/monthly-cleaning-624  — create-or-get current month's draft
// Body: { month?: "YYYY-MM" }  (defaults to current Pacific month)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["SUPERVISOR", "ADMIN"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let month: string;
  try {
    const body = await req.json().catch(() => ({})) as { month?: string };
    month = body.month ?? getPacificMonthKey();
  } catch {
    month = getPacificMonthKey();
  }

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "Invalid month format" }, { status: 400 });

  const userId = session.user.id;

  try {
    // Try to find existing record first (avoid unnecessary insert)
    let record = await prisma.monthlyClean624Record.findUnique({
      where: { facility_month: { facility: "624", month } },
      include: { submittedBy: { select: { name: true } } },
    });

    if (!record) {
      try {
        record = await prisma.monthlyClean624Record.create({
          data: {
            facility: "624",
            month,
            status: "draft",
            lines: buildUntouchedLines() as never,
            instructionsVer: INSTRUCTIONS_VER_MONTHLY,
            createdById: userId,
          },
          include: { submittedBy: { select: { name: true } } },
        });
      } catch (createErr) {
        // P2002 = unique constraint violation: another request beat us to it
        if ((createErr as { code?: string }).code === "P2002") {
          record = await prisma.monthlyClean624Record.findUnique({
            where: { facility_month: { facility: "624", month } },
            include: { submittedBy: { select: { name: true } } },
          });
        } else {
          throw createErr;
        }
      }
    }

    if (!record) {
      return NextResponse.json({ error: "Failed to get or create record" }, { status: 500 });
    }

    return NextResponse.json(record, { status: 200 });
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
    console.error(`[monthly-cleaning-624 POST create-or-get] ref=${refId} msg=${msg}`);
    return NextResponse.json({ error: "save_failed", refId }, { status: 500 });
  }
}

void buildInitialLines; // unused export kept for future reference
