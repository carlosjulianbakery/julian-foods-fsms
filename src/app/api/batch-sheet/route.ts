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
      productId, recipeSnapshot,
      expirationDateAuto, shelfLifeMonthsUsed, packagingSnapshot,
      baseUnitName, baseUnitIsFinished,
    } = body;

    if (!templateId || !templateName || !productionDate || !shift || !supervisorName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Merge shelf-life / auto-expiration metadata into section1 JSONB
    const enrichedSection1 = section1
      ? {
          ...section1,
          ...(expirationDateAuto !== undefined && { expiration_date_auto: expirationDateAuto }),
          ...(shelfLifeMonthsUsed != null && { shelf_life_months_used: shelfLifeMonthsUsed }),
        }
      : null;

    const data = {
      templateId,
      templateName,
      productionDate:    new Date(productionDate),
      productionLot:     productionLot || null,
      expirationDate:    expirationDate ? new Date(expirationDate) : null,
      shift,
      supervisorName,
      numEmployees:      numEmployees ? parseInt(numEmployees) : null,
      section1:          enrichedSection1 ?? null,
      section2_allergen: section2_allergen ?? null,
      section3:          section3 ? { ...section3, packaging_snapshot: packagingSnapshot ?? null } : null,
      section4:          section4 ?? null,
      section5:          section5 ?? null,
      section6:          section6 ?? null,
      notes:             notes || null,
      status:            status ?? "COMPLETE",
      lastSavedAt:       new Date(),
      productId:         productId ?? null,
      recipeSnapshot:    recipeSnapshot ?? null,
      baseUnitName:           baseUnitName || "Bowl",
      baseUnitIsFinished:     baseUnitIsFinished ?? false,
    };

    let submission;
    if (id) {
      // Promote existing draft → completed
      const existing = await prisma.batchSheetSubmission.findFirst({
        where: { id, submittedById: user.id, status: "DRAFT" },
        select: { id: true, recipeSnapshot: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      // Immutability: once a recipeSnapshot is locked in, it cannot be overwritten
      if (existing.recipeSnapshot !== null && recipeSnapshot !== undefined && recipeSnapshot !== null) {
        const sameRef = JSON.stringify(existing.recipeSnapshot) === JSON.stringify(recipeSnapshot);
        if (!sameRef) {
          return NextResponse.json(
            { error: "recipeSnapshot is immutable once set on a submission" },
            { status: 400 }
          );
        }
      }
      // If already set on the draft, preserve the original snapshot
      const finalData = existing.recipeSnapshot !== null
        ? { ...data, recipeSnapshot: existing.recipeSnapshot, submittedAt: new Date() }
        : { ...data, submittedAt: new Date() };
      submission = await prisma.batchSheetSubmission.update({
        where: { id },
        data: finalData,
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
