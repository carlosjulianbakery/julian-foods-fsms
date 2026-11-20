import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPacificToday } from "@/lib/pacific-time";
import { VERIFICATION_FACILITY, parsePeriod, periodForDate } from "@/lib/verification-624";
import { canUseVerification, loadLiveEquipment, loadListVersion } from "@/lib/verification-624-server";

export const dynamic = "force-dynamic";

// GET /api/verification-624 — the record list (this is the log)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const records = await prisma.verification624Record.findMany({
    where: { facility: VERIFICATION_FACILITY },
    orderBy: { periodStart: "desc" },
    take: 60,
    select: {
      id: true, period: true, periodStart: true, periodEnd: true, status: true, conductedBy: true, initials: true,
      okCount: true, failCount: true, notInUseCount: true, submittedAt: true, updatedAt: true,
      submittedBy: { select: { name: true } },
    },
  });
  return NextResponse.json(records);
}

// POST /api/verification-624 — get or create the draft for a period (defaults to the current Pacific half-month)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseVerification(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { period?: string; taskId?: string | null };
  const period = body.period ? parsePeriod(body.period) : periodForDate(getPacificToday());
  if (!period) return NextResponse.json({ error: "Invalid period" }, { status: 400 });

  const where = { facility_period: { facility: VERIFICATION_FACILITY, period: period.key } };
  let record = await prisma.verification624Record.findUnique({ where });
  if (!record) {
    try {
      record = await prisma.verification624Record.create({
        data: {
          facility: VERIFICATION_FACILITY,
          period: period.key,
          periodStart: new Date(`${period.start}T00:00:00Z`),
          periodEnd: new Date(`${period.end}T00:00:00Z`),
          status: "draft",
          items: [],
          listVersion: await loadListVersion(prisma),
          createdById: session.user.id,
          linkedInstanceId: body.taskId ?? null,
        },
      });
    } catch (e) {
      // Another request created it first
      if ((e as { code?: string }).code !== "P2002") throw e;
      record = await prisma.verification624Record.findUnique({ where });
    }
  }
  if (!record) return NextResponse.json({ error: "Could not open the form" }, { status: 500 });

  return NextResponse.json({
    record,
    equipment: record.status === "draft" ? await loadLiveEquipment(prisma) : [],
    listVersion: await loadListVersion(prisma),
  });
}
