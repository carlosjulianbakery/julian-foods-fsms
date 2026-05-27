import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SectionItem {
  section: string;
  item: string;
  result: "PASS" | "FAIL" | "NA";
  notes?: string;
}

export interface AtpAttempt {
  attempt_number: number;
  area_swabbed: string;
  rlu_result: number;
  result: "pass" | "warning" | "fail";
  initials: string;
  time_recorded: string;
}

export interface AtpSwab {
  attempts: AtpAttempt[];
  final_result: "pass" | "warning" | "fail" | null;
}

// DB sections column stores either:
//   new format: { items: SectionItem[], atp_swab: AtpSwab }
//   legacy format: SectionItem[]   (records before ATP swab was added)
function parseSectionsDb(raw: unknown): { items: SectionItem[]; atpSwab: AtpSwab | null } {
  if (Array.isArray(raw)) return { items: raw as SectionItem[], atpSwab: null };
  const obj = raw as { items?: SectionItem[]; atp_swab?: AtpSwab };
  return { items: obj.items ?? [], atpSwab: obj.atp_swab ?? null };
}

interface InspectionRow {
  id: string;
  date: Date;
  shift: string;
  status: string;
  sections: unknown;
  correctiveAction: string | null;
  supervisorSignature: string | null;
  submittedAt: Date;
  submittedById: string;
  submittedByName: string;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rows = await prisma.$queryRaw<InspectionRow[]>`
      SELECT
        p.id,
        p.date,
        p.shift,
        p.status,
        p.sections,
        p."correctiveAction",
        p."supervisorSignature",
        p."submittedAt",
        p."submittedById",
        u.name AS "submittedByName"
      FROM pre_op_inspections p
      JOIN users u ON u.id = p."submittedById"
      ORDER BY p."submittedAt" DESC
    `;

    const inspections = rows.map(({ submittedByName, sections: rawSections, ...rest }) => {
      const { items, atpSwab } = parseSectionsDb(rawSections);
      return { ...rest, sections: items, atpSwab, submittedBy: { name: submittedByName } };
    });

    return NextResponse.json(inspections);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/pre-op]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { date, shift, sections, atpSwab, correctiveAction, supervisorSignature } = body as {
      date?: string;
      shift?: string;
      sections?: SectionItem[];
      atpSwab?: AtpSwab;
      correctiveAction?: string;
      supervisorSignature?: string;
    };

    if (!date || !shift || !sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hasFail = sections.some((s) => s.result === "FAIL");
    if (hasFail && !correctiveAction?.trim()) {
      return NextResponse.json(
        { error: "Corrective action required when any item fails" },
        { status: 400 }
      );
    }

    if (!atpSwab?.final_result || atpSwab.final_result === "fail") {
      return NextResponse.json(
        { error: "ATP Swab test must pass or reach warning level before submitting" },
        { status: 400 }
      );
    }

    let status = "PASS";
    if (hasFail) status = "FAIL";
    else if (sections.some((s) => s.result === "NA") || atpSwab.final_result === "warning") {
      status = "PASS_WITH_ISSUES";
    }

    // Store items + atp_swab together in the sections column
    const sectionsJson = JSON.stringify({ items: sections, atp_swab: atpSwab });
    const correctiveVal = correctiveAction?.trim() || null;
    const sigVal        = supervisorSignature?.trim() || null;
    const dateVal       = new Date(date);

    const [row] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO pre_op_inspections
        (date, shift, status, sections, "correctiveAction", "supervisorSignature",
         "submittedById", "submittedAt")
      VALUES
        (${dateVal}, ${shift}::"PreOpShift", ${status}::"PreOpStatus",
         ${sectionsJson}::jsonb, ${correctiveVal}, ${sigVal}, ${user.id}, NOW())
      RETURNING id
    `;

    return NextResponse.json({ id: row.id, status }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/pre-op]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
