import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET — all submissions excluding drafts (for records pages)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const submissions = await prisma.batchSheetSubmission.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { submittedAt: "desc" },
      include: {
        submittedBy: { select: { name: true, email: true } },
        template:    { select: { name: true, hasExpirationDate: true } },
      },
    });

    return NextResponse.json(submissions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST — create a new complete submission, or promote an existing draft to complete.
// If body contains `id`, the draft with that id is updated (must belong to the caller and be DRAFT status).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };

    const body = await req.json();
    const {
      id,
      templateId, templateName,
      productionDate, productionLot, expirationDate, shift,
      supervisorName, numEmployees,
      section1, section2_allergen, section3, section4, section5, section6,
      notes, status,
    } = body;

    if (!templateId || !templateName || !productionDate || !shift || !supervisorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const data = {
      templateId,
      templateName,
      productionDate:    new Date(productionDate),
      productionLot:     productionLot || null,
      expirationDate:    expirationDate ? new Date(expirationDate) : null,
      shift,
      supervisorName,
      numEmployees:      numEmployees ? parseInt(numEmployees) : null,
      section1:          section1 ?? null,
      section2_allergen: section2_allergen ?? null,
      section3:          section3 ?? null,
      section4:          section4 ?? null,
      section5:          section5 ?? null,
      section6:          section6 ?? null,
      notes:             notes || null,
      status:            status ?? "COMPLETE",
      lastSavedAt:       new Date(),
    };

    let submission;
    if (id) {
      // Promote existing draft → completed
      const existing = await prisma.batchSheetSubmission.findFirst({
        where: { id, submittedById: user.id, status: "DRAFT" },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      submission = await prisma.batchSheetSubmission.update({
        where: { id },
        data: { ...data, submittedAt: new Date() },
      });
    } else {
      submission = await prisma.batchSheetSubmission.create({
        data: { ...data, submittedById: user.id },
      });
    }

    return NextResponse.json(submission, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
