import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user as { role: string };
    if (role !== "SUPERVISOR" && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const inspections = await prisma.preOpInspection.findMany({
      orderBy: { submittedAt: "desc" },
      include: { submittedBy: { select: { name: true } } },
    });

    return NextResponse.json(inspections);
  } catch (err) {
    console.error("[GET /api/pre-op]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
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
    const { date, shift, sections, correctiveAction, supervisorSignature } = body;

    if (!date || !shift || !sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hasFail = sections.some((s: { result: string }) => s.result === "FAIL");
    if (hasFail && !correctiveAction?.trim()) {
      return NextResponse.json(
        { error: "Corrective action required when any item fails" },
        { status: 400 }
      );
    }

    let status: "PASS" | "FAIL" | "PASS_WITH_ISSUES" = "PASS";
    if (hasFail) {
      status = "FAIL";
    } else if (sections.some((s: { result: string }) => s.result === "NA")) {
      status = "PASS_WITH_ISSUES";
    }

    const inspection = await prisma.preOpInspection.create({
      data: {
        date: new Date(date),
        shift,
        status,
        sections,
        correctiveAction: correctiveAction?.trim() || null,
        supervisorSignature: supervisorSignature?.trim() || null,
        submittedById: user.id,
      },
    });

    return NextResponse.json(inspection, { status: 201 });
  } catch (err) {
    console.error("[POST /api/pre-op]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
