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
        releaseChecklistItems: true,
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
      ingredients, packaging, ovensAvailable,
      calibrationWeights, ccpSettings, releaseChecklistItems,
    } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!Array.isArray(ingredients)) return NextResponse.json({ error: "Ingredients must be an array" }, { status: 400 });

    const template = await prisma.batchSheetTemplate.create({
      data: {
        name:                  name.trim(),
        description:           description?.trim() || null,
        isActive:              isActive ?? true,
        ingredients:           ingredients ?? [],
        packaging:             packaging ?? [],
        ovensAvailable:        ovensAvailable ?? [],
        calibrationWeights:    calibrationWeights ?? [],
        ccpSettings:           ccpSettings ?? { min_temp_f: 190, min_weight_oz: 3.5, max_weight_oz: 4.2 },
        releaseChecklistItems: releaseChecklistItems ?? [],
        createdById:           session.user.id,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/batch-sheet-templates]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
