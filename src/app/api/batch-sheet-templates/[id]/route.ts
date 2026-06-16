import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
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
      name, description, productCode, isActive,
      ingredients, presentations, ccpChecks, ccpNumSessions, ccpRequireTimestamp, endOfProductionFields,
      ovensAvailable, calibrationWeights, releaseChecklistItems,
      primaryUnitName, hasInternalUnits, internalUnitName, internalUnitsPerPrimary,
      declaredAllergens, hasExpirationDate,
      // Legacy fields — kept for backward compat
      packaging, ccpSettings,
      productId,
    } = body;

    // Build the update data object
    const data: Record<string, unknown> = {
      ...(name !== undefined         && { name: (name as string).trim() }),
      ...(description !== undefined  && { description: description ? (description as string).trim() || null : null }),
      ...(productCode !== undefined  && { productCode: productCode ? String(productCode).toUpperCase().slice(0, 10) : null }),
      ...(isActive !== undefined     && { isActive }),
      ...(ingredients !== undefined  && { ingredients }),
      // presentations (frontend name) → packaging (DB column)
      ...(presentations !== undefined  && { packaging: presentations }),
      // also accept raw packaging key for backward compat
      ...(presentations === undefined && packaging !== undefined && { packaging }),
      // ccpChecks (frontend name) → ccpSettings (DB column)
      ...(ccpChecks !== undefined    && { ccpSettings: ccpChecks }),
      // also accept raw ccpSettings key for backward compat
      ...(ccpChecks === undefined && ccpSettings !== undefined && { ccpSettings }),
      ...(ccpNumSessions !== undefined         && { ccpNumSessions }),
      ...(ccpRequireTimestamp !== undefined     && { ccpRequireTimestamp }),
      ...(endOfProductionFields !== undefined   && { endOfProductionFields }),
      ...(ovensAvailable !== undefined          && { ovensAvailable }),
      ...(calibrationWeights !== undefined      && { calibrationWeights }),
      ...(releaseChecklistItems !== undefined   && { releaseChecklistItems }),
      ...(primaryUnitName !== undefined         && { primaryUnitName: primaryUnitName || null }),
      ...(hasInternalUnits !== undefined        && { hasInternalUnits }),
      ...(internalUnitName !== undefined        && { internalUnitName: internalUnitName || null }),
      ...(internalUnitsPerPrimary !== undefined && { internalUnitsPerPrimary: internalUnitsPerPrimary ?? null }),
      ...(declaredAllergens !== undefined       && { declaredAllergens }),
      ...(hasExpirationDate !== undefined       && { hasExpirationDate }),
      ...(productId !== undefined               && { productId: productId || null }),
    };

    // Guard: if nothing was sent, return early rather than making a no-op update
    if (Object.keys(data).length === 0) {
      console.warn(`[PATCH /api/batch-sheet-templates/${params.id}] No fields to update — returning current record`);
      const current = await prisma.batchSheetTemplate.findUnique({ where: { id: params.id } });
      if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(current);
    }

    console.log(`[PATCH /api/batch-sheet-templates/${params.id}] Updating fields:`, Object.keys(data));

    const template = await prisma.batchSheetTemplate.update({
      where: { id: params.id },
      data,
    });

    console.log(`[PATCH /api/batch-sheet-templates/${params.id}] Saved OK — updatedAt=${template.updatedAt.toISOString()}`);

    // Bust any Next.js full-route cache so supervisors and admins see the updated template immediately
    revalidatePath("/dashboard/supervisor/batch-sheet");
    revalidatePath("/dashboard/admin/batch-sheet-templates");
    revalidatePath(`/dashboard/admin/batch-sheet-templates/${params.id}/edit`);

    return NextResponse.json(template);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PATCH /api/batch-sheet-templates/${params.id}] Error:`, msg);
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
