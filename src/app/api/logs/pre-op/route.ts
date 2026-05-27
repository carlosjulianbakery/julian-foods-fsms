import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionItem {
  section: string;
  result: "PASS" | "FAIL" | "NA";
}

interface AtpAttempt {
  attempt_number: number;
  area_swabbed: string;
  rlu_result: number;
  result: "pass" | "warning" | "fail";
  initials: string;
  time_recorded: string;
}

interface AtpSwab {
  attempts: AtpAttempt[];
  final_result: "pass" | "warning" | "fail" | null;
}

const SECTION_NAMES = [
  "Personnel & Hygiene",
  "Facility & Grounds",
  "Equipment & Utensils",
  "Sanitation Supplies",
  "Temperature & Storage",
] as const;

type SectionName = (typeof SECTION_NAMES)[number];

function parseSectionsDb(raw: unknown): { items: SectionItem[]; atpSwab: AtpSwab | null } {
  if (Array.isArray(raw)) return { items: raw as SectionItem[], atpSwab: null };
  const obj = raw as { items?: SectionItem[]; atp_swab?: AtpSwab };
  return { items: obj.items ?? [], atpSwab: obj.atp_swab ?? null };
}

function computeSectionStatus(items: SectionItem[], name: SectionName): "PASS" | "FAIL" | "PASS_WITH_ISSUES" {
  const sectionItems = items.filter((i) => i.section === name);
  if (sectionItems.length === 0) return "PASS";
  if (sectionItems.some((i) => i.result === "FAIL")) return "FAIL";
  if (sectionItems.some((i) => i.result === "NA")) return "PASS_WITH_ISSUES";
  return "PASS";
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dateFrom         = searchParams.get("date_from")  ?? "";
    const dateTo           = searchParams.get("date_to")    ?? "";
    const supervisorFilter = searchParams.get("supervisor") ?? "";
    const statusFilter     = searchParams.get("status")     ?? "";
    const atpFilter        = searchParams.get("atp_result") ?? "";

    interface InspectionRow {
      id: string;
      date: Date;
      shift: string;
      status: string;
      sections: unknown;
      submittedAt: Date;
      submittedByName: string;
    }

    const rows = await prisma.$queryRaw<InspectionRow[]>`
      SELECT
        p.id,
        p.date,
        p.shift,
        p.status,
        p.sections,
        p."submittedAt",
        u.name AS "submittedByName"
      FROM pre_op_inspections p
      JOIN users u ON u.id = p."submittedById"
      ORDER BY p.date DESC, p."submittedAt" DESC
    `;

    // JS-side filtering
    let filtered = rows;
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((r) => new Date(r.date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59");
      filtered = filtered.filter((r) => new Date(r.date) <= to);
    }
    if (supervisorFilter) {
      filtered = filtered.filter((r) => r.submittedByName === supervisorFilter);
    }
    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    const logRows = filtered.flatMap((row) => {
      const { items, atpSwab } = parseSectionsDb(row.sections);

      // Per-section status badges
      const section_statuses: Record<string, "PASS" | "FAIL" | "PASS_WITH_ISSUES"> = {};
      for (const name of SECTION_NAMES) {
        section_statuses[name] = computeSectionStatus(items, name);
      }

      // ATP data from final passing/warning attempt
      const passingAtt = atpSwab?.attempts.find((a) => a.result === "pass" || a.result === "warning");
      const atp_area   = passingAtt?.area_swabbed ?? null;
      const atp_rlu    = passingAtt != null ? passingAtt.rlu_result : null;
      const atp_result = atpSwab?.final_result ?? null;

      // ATP result filter (after computing it)
      if (atpFilter && atpFilter !== "all" && atp_result !== atpFilter) return [];

      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split("T")[0]
        : String(row.date).split("T")[0];

      return [{
        id:               row.id,
        date:             dateStr,
        supervisor_name:  row.submittedByName,
        overall_status:   row.status as "PASS" | "FAIL" | "PASS_WITH_ISSUES",
        shift:            row.shift as "AM" | "PM",
        section_statuses,
        atp_area,
        atp_rlu,
        atp_result,
        atp_attempts:    atpSwab?.attempts ?? [],
        submitted_at:    row.submittedAt,
      }];
    });

    // Unique supervisor names for dropdown
    const allSupervisors = await prisma.$queryRaw<{ name: string }[]>`
      SELECT DISTINCT u.name
      FROM pre_op_inspections p
      JOIN users u ON u.id = p."submittedById"
      ORDER BY u.name ASC
    `;

    return NextResponse.json({
      rows:            logRows,
      total_count:     logRows.length,
      supervisor_list: allSupervisors.map((s) => s.name),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/logs/pre-op]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
