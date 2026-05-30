import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const templates = await prisma.batchSheetTemplate.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        ingredients: true,
        packaging: true,
        ovensAvailable: true,
        calibrationWeights: true,
        ccpSettings: true,
        ccpNumSessions: true,
        ccpRequireTimestamp: true,
        endOfProductionFields:   true,
        primaryUnitName:         true,
        hasInternalUnits:        true,
        internalUnitName:        true,
        internalUnitsPerPrimary: true,
        releaseChecklistItems:   true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(templates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/batch-sheet-templates]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      name, description, isActive,
      ingredients, presentations, ccpChecks, ccpNumSessions, ccpRequireTimestamp, endOfProductionFields,
      ovensAvailable, calibrationWeights, releaseChecklistItems,
      primaryUnitName, hasInternalUnits, internalUnitName, internalUnitsPerPrimary,
      // Legacy field names
      packaging, ccpSettings,
    } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!Array.isArray(ingredients)) return NextResponse.json({ error: "Ingredients must be an array" }, { status: 400 });

    const template = await prisma.batchSheetTemplate.create({
      data: {
        name:                  name.trim(),
        description:           description?.trim() || null,
        isActive:              isActive ?? true,
        ingredients:           ingredients ?? [],
        // presentations (frontend) → packaging (DB); fallback to raw packaging
        packaging:             presentations ?? packaging ?? [],
        ovensAvailable:        ovensAvailable ?? [],
        calibrationWeights:    calibrationWeights ?? [],
        // ccpChecks (frontend) → ccpSettings (DB); fallback to raw ccpSettings
        ccpSettings:           ccpChecks ?? ccpSettings ?? [],
        ccpNumSessions:        ccpNumSessions ?? 3,
        ccpRequireTimestamp:   ccpRequireTimestamp ?? false,
        endOfProductionFields:   endOfProductionFields ?? [],
        primaryUnitName:         primaryUnitName ?? null,
        hasInternalUnits:        hasInternalUnits ?? false,
        internalUnitName:        internalUnitName ?? null,
        internalUnitsPerPrimary: internalUnitsPerPrimary ?? null,
        releaseChecklistItems:   releaseChecklistItems ?? [],
        createdById:             session.user.id,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet-templates]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
