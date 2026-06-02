import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CleaningArea, CleaningStatus, Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom    = searchParams.get("date_from")  ?? "";
    const dateTo      = searchParams.get("date_to")    ?? "";
    const areaParam   = searchParams.get("area")       ?? "";
    const statusParam = searchParams.get("status")     ?? "";
    const checkedBy   = searchParams.get("checked_by") ?? "";

    const where: Prisma.DailyCleaningChecklistWhereInput = {
      ...(dateFrom    && { date:      { gte: new Date(dateFrom) } }),
      ...(dateTo      && { date:      { lte: new Date(dateTo + "T23:59:59") } }),
      ...(areaParam   && { area:      areaParam   as CleaningArea }),
      ...(statusParam && { status:    statusParam as CleaningStatus }),
      ...(checkedBy   && { checkedBy: { contains: checkedBy, mode: "insensitive" as const } }),
    };

    const records = await prisma.dailyCleaningChecklist.findMany({
      where,
      orderBy: { date: "desc" },
      include: { submittedBy: { select: { name: true, email: true } } },
    });

    const rows = records.map((r) => ({
      id:                  r.id,
      date:                r.date.toISOString().split("T")[0],
      area:                r.area,
      allMachinesCleaned:  r.allMachinesCleaned,
      prepToolsCleaned:    r.prepToolsCleaned,
      floorsMoppedSwept:   r.floorsMoppedSwept,
      bakingTraysCleaned:  r.bakingTraysCleaned,
      foodSurfacesCleaned: r.foodSurfacesCleaned,
      trashEmptied:        r.trashEmptied,
      checkedBy:           r.checkedBy,
      notes:               r.notes ?? null,
      status:              r.status,
      submittedAt:         r.submittedAt.toISOString(),
      submittedBy:         r.submittedBy.name ?? r.submittedBy.email,
    }));

    return NextResponse.json({ rows, total_count: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/cleaning]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
