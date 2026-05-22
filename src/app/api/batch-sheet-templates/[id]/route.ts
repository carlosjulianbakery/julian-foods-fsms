import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const template = await prisma.batchSheetTemplate.findUnique({ where: { id: params.id } });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const {
      name, description, isActive,
      ingredients, presentations, ccpChecks, ccpNumSessions, endOfProductionFields,
      ovensAvailable, calibrationWeights, releaseChecklistItems,
      // Legacy fields — kept for backward compat
      packaging, ccpSettings,
    } = body;

    const template = await prisma.batchSheetTemplate.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined         && { name: name.trim() }),
        ...(description !== undefined  && { description: description?.trim() || null }),
        ...(isActive !== undefined     && { isActive }),
        ...(ingredients !== undefined  && { ingredients }),
        // presentations (frontend name) → packaging (DB column)
        ...(presentations !== undefined  && { packaging: presentations }),
        // also accept raw packaging key for backward compat (e.g. duplicate route)
        ...(presentations === undefined && packaging !== undefined && { packaging }),
        // ccpChecks (frontend name) → ccpSettings (DB column)
        ...(ccpChecks !== undefined    && { ccpSettings: ccpChecks }),
        // also accept raw ccpSettings key for backward compat
        ...(ccpChecks === undefined && ccpSettings !== undefined && { ccpSettings }),
        ...(ccpNumSessions !== undefined      && { ccpNumSessions }),
        ...(endOfProductionFields !== undefined && { endOfProductionFields }),
        ...(ovensAvailable !== undefined     && { ovensAvailable }),
        ...(calibrationWeights !== undefined && { calibrationWeights }),
        ...(releaseChecklistItems !== undefined && { releaseChecklistItems }),
      },
    });

    return NextResponse.json(template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.batchSheetTemplate.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
