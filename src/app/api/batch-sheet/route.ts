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

    const submissions = await prisma.batchSheetSubmission.findMany({
      orderBy: { submittedAt: "desc" },
      include: {
        submittedBy: { select: { name: true } },
        template: { select: { name: true } },
      },
    });

    return NextResponse.json(submissions);
  } catch (err) {
    console.error("[GET /api/batch-sheet]", err);
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
    const {
      templateId,
      date,
      shift,
      productName,
      numberOfBowls,
      ingredients,
      notes,
      supervisorSignature,
    } = body;

    if (!templateId || !date || !shift || !productName || !numberOfBowls || !ingredients) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hasMissingLot = (ingredients as { lot_number?: string }[]).some(
      (ing) => !ing.lot_number?.trim()
    );
    const status: "PASS" | "FAIL" | "PASS_WITH_ISSUES" = hasMissingLot
      ? "PASS_WITH_ISSUES"
      : "PASS";

    const submission = await prisma.batchSheetSubmission.create({
      data: {
        templateId,
        date: new Date(date),
        shift,
        productName,
        numberOfBowls: Number(numberOfBowls),
        status,
        ingredients,
        notes: notes?.trim() || null,
        supervisorSignature: supervisorSignature?.trim() || null,
        submittedById: user.id,
      },
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (err) {
    console.error("[POST /api/batch-sheet]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
