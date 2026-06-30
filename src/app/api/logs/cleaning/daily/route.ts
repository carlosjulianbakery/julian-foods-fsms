import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CleaningStatus, Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

// ─── Area definitions (new format, post-rebuild) ───────────────────────────────

const NEW_AREA_GROUPS = [
  { id: "granola_production",  label: "Granola" },
  { id: "progranola_packing",  label: "ProGranola" },
  { id: "manual_packaging",    label: "Manual Pkg" },
  { id: "bar_production",      label: "Bar" },
  { id: "crackers_production", label: "Crackers" },
] as const;

const NEW_AREA_IDS: Set<string> = new Set(NEW_AREA_GROUPS.map((g) => g.id));

// ─── Old group definitions (flat format, pre-rebuild) ─────────────────────────

const OLD_DAILY_GROUPS = [
  { id: "floors_drains",   label: "Floors & Drains" },
  { id: "equip_main",      label: "Equipment — Main" },
  { id: "equip_bar",       label: "Equipment — Bar" },
  { id: "shared_equip",    label: "Shared Equipment" },
  { id: "granola_machine", label: "Granola Machine" },
  { id: "general",         label: "General" },
] as const;

interface ChecklistItem {
  id: string;
  label: string;
  group: string;
  checked: boolean;
  notes?: string;
}

function isNewAreaFormat(items: ChecklistItem[]): boolean {
  return items.length > 0 && NEW_AREA_IDS.has(items[0].group);
}

function computeGroupSummaries(items: ChecklistItem[]) {
  if (isNewAreaFormat(items)) {
    return NEW_AREA_GROUPS.map((g) => {
      const gItems = items.filter((it) => it.group === g.id);
      return {
        groupId:      g.id,
        label:        g.label,
        checkedCount: gItems.filter((it) => it.checked).length,
        totalCount:   gItems.length,
      };
    });
  }
  // Old flat format — compute against old group IDs
  return OLD_DAILY_GROUPS.map((g) => {
    const gItems = items.filter((it) => it.group === g.id);
    return {
      groupId:      g.id,
      label:        g.label,
      checkedCount: gItems.filter((it) => it.checked).length,
      totalCount:   gItems.length,
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

    const where: Prisma.DailyCleaningChecklistWhereInput = {
      ...(dateFrom    && { date:      { gte: new Date(dateFrom) } }),
      ...(dateTo      && { date:      { lte: new Date(dateTo + "T23:59:59") } }),
      ...(statusParam && { status:    statusParam as CleaningStatus }),
      ...(checkedBy   && { checkedBy: { contains: checkedBy, mode: "insensitive" as const } }),
    };

    const records = await prisma.dailyCleaningChecklist.findMany({
      where,
      orderBy: { date: "desc" },
      include: { submittedBy: { select: { name: true, email: true } } },
    });

    const rows = records.map((r) => {
      // Null items = oldest boolean-column format
      if (!r.items) {
        return {
          id:             r.id,
          date:           r.date.toISOString().split("T")[0],
          checkedBy:      r.checkedBy,
          notes:          r.notes ?? null,
          status:         r.status,
          submittedAt:    r.submittedAt.toISOString(),
          submittedBy:    r.submittedBy.name ?? r.submittedBy.email,
          isLegacy:       true,
          formatVersion:  "legacy_null" as const,
          legacyItems: [
            { label: "All Machines Cleaned",              checked: r.allMachinesCleaned },
            { label: "Prep Tools Cleaned",                checked: r.prepToolsCleaned },
            { label: "Floors Mopped and Swept",           checked: r.floorsMoppedSwept },
            { label: "Baking Trays / Pans Cleaned",       checked: r.bakingTraysCleaned },
            { label: "All Food Contact Surfaces Cleaned", checked: r.foodSurfacesCleaned },
            { label: "Trash Emptied",                     checked: r.trashEmptied },
          ],
          groupSummaries: null,
          items:          null,
        };
      }

      const items = r.items as unknown as ChecklistItem[];
      const newFmt = isNewAreaFormat(items);

      return {
        id:             r.id,
        date:           r.date.toISOString().split("T")[0],
        checkedBy:      r.checkedBy,
        notes:          r.notes ?? null,
        status:         r.status,
        submittedAt:    r.submittedAt.toISOString(),
        submittedBy:    r.submittedBy.name ?? r.submittedBy.email,
        isLegacy:       !newFmt,  // old flat format treated as legacy in summary table
        formatVersion:  newFmt ? "new_area" as const : "old_flat" as const,
        legacyItems:    null,
        groupSummaries: computeGroupSummaries(items),
        items,
      };
    });

    return NextResponse.json({ rows, total_count: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/cleaning/daily]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
