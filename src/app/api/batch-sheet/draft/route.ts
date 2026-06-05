import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

export const dynamic = "force-dynamic";

// GET /api/batch-sheet/draft?template_id=xxx
// Returns the most recent DRAFT for the authenticated supervisor + template, or null.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };
    if (user.role !== "SUPERVISOR" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templateId = req.nextUrl.searchParams.get("template_id");

    // No template_id → return ALL drafts for this user (for records page)
    if (!templateId) {
      const where =
        user.role === "ADMIN"
          ? { status: "DRAFT" as const }
          : { status: "DRAFT" as const, submittedById: user.id };
      const drafts = await prisma.batchSheetSubmission.findMany({
        where,
        orderBy: { lastSavedAt: "desc" },
        select: {
          id: true,
          templateName: true,
          productionDate: true,
          supervisorName: true,
          shift: true,
          lastSavedAt: true,
          lastActiveSection: true,
          submittedById: true,
        },
      });
      return NextResponse.json(drafts);
    }

    const draft = await prisma.batchSheetSubmission.findFirst({
      where: { templateId, submittedById: user.id, status: "DRAFT" },
      orderBy: { lastSavedAt: "desc" },
    });

    return NextResponse.json(draft ?? null);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet/draft]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST /api/batch-sheet/draft
// Body: { id?: string, templateId, templateName, productionDate, shift, supervisorName, ...sections, lastActiveSection }
// If id provided → update. Otherwise → create.
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
      id,
      templateId, templateName,
      productionDate, productionLot, expirationDate, shift,
      supervisorName, numEmployees,
      section1, section2_allergen, section3, section4, section5, section6,
      notes, lastActiveSection,
      expirationDateAuto, shelfLifeMonthsUsed, packagingSnapshot,
    } = body as {
      id?: string;
      templateId: string; templateName: string;
      productionDate?: string; productionLot?: string; expirationDate?: string;
      shift?: string; supervisorName?: string; numEmployees?: string | null;
      section1?: unknown; section2_allergen?: unknown; section3?: unknown;
      section4?: unknown; section5?: unknown; section6?: unknown;
      notes?: string | null; lastActiveSection?: number;
      expirationDateAuto?: boolean;
      shelfLifeMonthsUsed?: number | null;
      packagingSnapshot?: unknown;
    };

    if (!templateId || !templateName) {
      return NextResponse.json({ error: "templateId and templateName are required" }, { status: 400 });
    }

    // Merge shelf-life / auto-expiration metadata into section1 JSONB
    const enrichedSection1 = section1
      ? {
          ...(section1 as Record<string, unknown>),
          ...(expirationDateAuto !== undefined && { expiration_date_auto: expirationDateAuto }),
          ...(shelfLifeMonthsUsed != null && { shelf_life_months_used: shelfLifeMonthsUsed }),
        }
      : section1;

    const enrichedSection3 = section3
      ? { ...(section3 as Record<string, unknown>), packaging_snapshot: packagingSnapshot ?? null }
      : section3;

    const data = {
      templateId,
      templateName,
      productionDate:    productionDate ? new Date(productionDate) : new Date(),
      productionLot:     productionLot || null,
      expirationDate:    expirationDate ? new Date(expirationDate) : null,
      shift:             (shift ?? "AM") as "AM" | "PM",
      supervisorName:    supervisorName ?? "",
      numEmployees:      numEmployees ? parseInt(String(numEmployees)) : null,
      section1:          enrichedSection1 !== undefined ? (enrichedSection1 as Prisma.InputJsonValue) : Prisma.JsonNull,
      section2_allergen: section2_allergen !== undefined ? (section2_allergen as Prisma.InputJsonValue) : Prisma.JsonNull,
      section3:          enrichedSection3 !== undefined ? (enrichedSection3 as Prisma.InputJsonValue) : Prisma.JsonNull,
      section4:          section4 !== undefined ? (section4 as Prisma.InputJsonValue) : Prisma.JsonNull,
      section5:          section5 !== undefined ? (section5 as Prisma.InputJsonValue) : Prisma.JsonNull,
      section6:          section6 !== undefined ? (section6 as Prisma.InputJsonValue) : Prisma.JsonNull,
      notes:             notes || null,
      status:            "DRAFT" as const,
      lastSavedAt:       new Date(),
      lastActiveSection: lastActiveSection ?? null,
      submittedById:     user.id,
    };

    let draft;
    if (id) {
      // Verify this draft belongs to the current user and is still a DRAFT
      const existing = await prisma.batchSheetSubmission.findFirst({
        where: { id, submittedById: user.id, status: "DRAFT" },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }
      draft = await prisma.batchSheetSubmission.update({
        where: { id },
        data,
      });
    } else {
      draft = await prisma.batchSheetSubmission.create({ data });
    }

    return NextResponse.json(draft, { status: id ? 200 : 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet/draft]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
