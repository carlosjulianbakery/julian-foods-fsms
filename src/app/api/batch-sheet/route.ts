import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const submissions = await prisma.batchSheetSubmission.findMany({
      orderBy: { submittedAt: "desc" },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true } },
      },
    });

    return NextResponse.json(submissions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      templateId, templateName,
      productionDate, productionLot, expirationDate, shift,
      supervisorName, numEmployees,
      section1, section2, section3, section4, section5,
      notes, status,
    } = body;

    if (!templateId || !templateName || !productionDate || !shift || !supervisorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const submission = await prisma.batchSheetSubmission.create({
      data: {
        templateId,
        templateName,
        productionDate: new Date(productionDate),
        productionLot:  productionLot || null,
        expirationDate: expirationDate ? new Date(expirationDate) : null,
        shift,
        supervisorName,
        numEmployees:   numEmployees ? parseInt(numEmployees) : null,
        section1:       section1 ?? null,
        section2:       section2 ?? null,
        section3:       section3 ?? null,
        section4:       section4 ?? null,
        section5:       section5 ?? null,
        notes:          notes || null,
        status:         status ?? "COMPLETE",
        submittedById:  session.user.id,
      },
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
