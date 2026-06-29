import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/admin/inventory-audit/exclude
// Body: { submission_id, material_id, reason }
// Creates an exclusion so the NFC gap is not flagged in future audit runs.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { role, id: adminId } = session.user as { role: string; id: string };
    if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const submissionId: string | undefined = body.submission_id;
    const materialId: string | undefined = body.material_id;
    const reason: string = body.reason ?? "";

    if (!submissionId || !materialId) {
      return NextResponse.json(
        { error: "submission_id and material_id are required" },
        { status: 400 }
      );
    }

    // Verify the submission exists
    const submission = await prisma.batchSheetSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, productionLot: true, templateName: true },
    });
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Verify the material exists
    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, name: true },
    });
    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }

    const exclusion = await prisma.inventoryAuditExclusion.upsert({
      where: { submissionId_materialId: { submissionId, materialId } },
      create: { submissionId, materialId, exclusionReason: reason, excludedById: adminId },
      update: { exclusionReason: reason, excludedById: adminId, excludedAt: new Date() },
      include: { excludedBy: { select: { name: true } } },
    });

    return NextResponse.json({
      message: `NFC gap for submission ${submissionId} + material "${material.name}" marked as manually resolved.`,
      exclusion: {
        id: exclusion.id,
        submissionId: exclusion.submissionId,
        productionLot: submission.productionLot,
        templateName: submission.templateName,
        materialId: exclusion.materialId,
        materialName: material.name,
        exclusionReason: exclusion.exclusionReason,
        excludedBy: exclusion.excludedBy?.name ?? null,
        excludedAt: exclusion.excludedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/inventory-audit/exclude]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
