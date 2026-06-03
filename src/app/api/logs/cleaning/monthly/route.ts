import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CleaningStatus, Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const MONTHLY_GROUPS = [
  { id: "storage_infra",     label: "Storage & Infrastructure" },
  { id: "deep_clean",        label: "Deep Clean — Equipment" },
  { id: "facility_surfaces", label: "Facility Surfaces" },
  { id: "monthly_checks",    label: "Monthly Checks" },
] as const;

interface ChecklistItem {
  id: string;
  label: string;
  group: string;
  checked: boolean;
  notes?: string;
}

function computeGroupSummaries(items: ChecklistItem[]) {
  return MONTHLY_GROUPS.map((g) => {
    const groupItems = items.filter((it) => it.group === g.id);
    const checkedCount = groupItems.filter((it) => it.checked).length;
    return {
      groupId:      g.id,
      label:        g.label,
      checkedCount,
      totalCount:   groupItems.length,
    };
  });
}

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
    const statusParam = searchParams.get("status")     ?? "";
    const checkedBy   = searchParams.get("checked_by") ?? "";

    const where: Prisma.MonthlyCleaningChecklistWhereInput = {
      ...(dateFrom    && { date:      { gte: new Date(dateFrom) } }),
      ...(dateTo      && { date:      { lte: new Date(dateTo + "T23:59:59") } }),
      ...(statusParam && { status:    statusParam as CleaningStatus }),
      ...(checkedBy   && { checkedBy: { contains: checkedBy, mode: "insensitive" as const } }),
    };

    const records = await prisma.monthlyCleaningChecklist.findMany({
      where,
      orderBy: { date: "desc" },
      include: { submittedBy: { select: { name: true, email: true } } },
    });

    const rows = records.map((r) => {
      const items = r.items as unknown as ChecklistItem[];
      return {
        id:             r.id,
        date:           r.date.toISOString().split("T")[0],
        checkedBy:      r.checkedBy,
        notes:          r.notes ?? null,
        status:         r.status,
        submittedAt:    r.submittedAt.toISOString(),
        submittedBy:    r.submittedBy.name ?? r.submittedBy.email,
        groupSummaries: computeGroupSummaries(items),
        items,
      };
    });

    return NextResponse.json({ rows, total_count: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/cleaning/monthly]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
