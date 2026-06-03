import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CleaningArea, CleaningStatus } from "@/generated/prisma";
import { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

// GET — all submitted daily cleaning checklists (for records page)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom  = searchParams.get("date_from") ?? "";
    const dateTo    = searchParams.get("date_to")   ?? "";

    const where: Prisma.DailyCleaningChecklistWhereInput = {
      ...(dateFrom && { date: { gte: new Date(dateFrom) } }),
      ...(dateTo   && { date: { lte: new Date(dateTo + "T23:59:59") } }),
    };

    const records = await prisma.dailyCleaningChecklist.findMany({
      where,
      orderBy: { date: "desc" },
      include: { submittedBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json(records);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/cleaning/daily]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST — create a new daily cleaning checklist submission
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { date, checkedBy, notes, items } = body;

    if (!date || !checkedBy) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // New format: items is a JSON array of { id, label, group, checked, notes }
    if (Array.isArray(items)) {
      const allChecked = items.length > 0 && items.every((it: { checked?: boolean }) => it.checked === true);
      const status = allChecked ? CleaningStatus.COMPLETE : CleaningStatus.INCOMPLETE;

      const record = await prisma.dailyCleaningChecklist.create({
        data: {
          // area is legacy-only; default MAIN for new-format records
          area:         CleaningArea.MAIN,
          date:         new Date(date),
          items:        items as Prisma.InputJsonValue,
          checkedBy:    checkedBy.trim(),
          notes:        notes?.trim() || null,
          status,
          submittedById: user.id,
        },
      });

      return NextResponse.json(record, { status: 201 });
    }

    // Legacy format (backward compat): old boolean fields
    const {
      area = "MAIN",
      allMachinesCleaned, prepToolsCleaned, floorsMoppedSwept,
      bakingTraysCleaned, foodSurfacesCleaned, trashEmptied,
    } = body;

    if (area !== "MAIN" && area !== "BARS") {
      return NextResponse.json({ error: "Invalid area value" }, { status: 400 });
    }

    const allChecked =
      !!allMachinesCleaned && !!prepToolsCleaned && !!floorsMoppedSwept &&
      !!bakingTraysCleaned && !!foodSurfacesCleaned && !!trashEmptied;

    const record = await prisma.dailyCleaningChecklist.create({
      data: {
        area:                area as CleaningArea,
        date:                new Date(date),
        allMachinesCleaned:  !!allMachinesCleaned,
        prepToolsCleaned:    !!prepToolsCleaned,
        floorsMoppedSwept:   !!floorsMoppedSwept,
        bakingTraysCleaned:  !!bakingTraysCleaned,
        foodSurfacesCleaned: !!foodSurfacesCleaned,
        trashEmptied:        !!trashEmptied,
        checkedBy:           checkedBy.trim(),
        notes:               notes?.trim() || null,
        status:              allChecked ? CleaningStatus.COMPLETE : CleaningStatus.INCOMPLETE,
        submittedById:       user.id,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/cleaning/daily]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
