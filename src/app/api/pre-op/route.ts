import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// All columns are camelCase (Prisma db push without @map field annotations).
// Using $queryRaw to bypass the model layer.

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

    const inspections = rows.map(({ submittedByName, ...rest }) => ({
      ...rest,
      submittedBy: { name: submittedByName },
    }));

    return NextResponse.json(inspections);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/pre-op]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { date, shift, sections, correctiveAction, supervisorSignature } = body as {
      date?: string;
      shift?: string;
      sections?: { result: string }[];
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

    let status = "PASS";
    if (hasFail) status = "FAIL";
    else if (sections.some((s) => s.result === "NA")) status = "PASS_WITH_ISSUES";

    const sectionsJson = JSON.stringify(sections);
    const correctiveVal = correctiveAction?.trim() || null;
    const sigVal = supervisorSignature?.trim() || null;
    const dateVal = new Date(date);

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
