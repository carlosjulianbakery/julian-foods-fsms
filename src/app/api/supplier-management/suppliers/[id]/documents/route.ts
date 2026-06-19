import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { computeSupplierStatus } from "@/lib/supplier-status";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documents = await prisma.supplierDocument.findMany({
    where: { supplierId: params.id },
    include: { requirement: true },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json(documents);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const requirementId = formData.get("requirementId") as string | null;
  const expiresAt = formData.get("expiresAt") as string | null;
  const notes = formData.get("notes") as string | null;
  const obligationId = formData.get("obligationId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!requirementId && !obligationId) {
    return NextResponse.json({ error: "requirementId or obligationId is required" }, { status: 400 });
  }

  // If fulfilling an obligation, fetch its receivingRecordId and lotNumber
  let obligationReceivingRecordId: string | null = null;
  let obligationLotNumber: string | null = null;
  let resolvedRequirementId = requirementId;

  if (obligationId) {
    const obl = await prisma.perDeliveryObligation.findUnique({
      where: { id: obligationId },
      select: { receivingRecordId: true, lotNumber: true, requirementId: true },
    });
    if (obl) {
      obligationReceivingRecordId = obl.receivingRecordId;
      obligationLotNumber = obl.lotNumber;
      resolvedRequirementId = resolvedRequirementId ?? obl.requirementId;
    }
  }

  // Upload to private Vercel Blob store
  const blobPathname = `supplier-docs/${params.id}/${resolvedRequirementId ?? "misc"}/${Date.now()}-${file.name}`;
  const blob = await put(blobPathname, file, { access: "private" });

  const doc = await prisma.supplierDocument.create({
    data: {
      supplierId: params.id,
      requirementId: resolvedRequirementId ?? null,
      fileName: file.name,
      fileUrl: blob.url,
      fileSize: file.size,
      mimeType: file.type,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes ?? null,
      receivingRecordId: obligationReceivingRecordId,
      lotNumber: obligationLotNumber,
    },
    include: { requirement: true },
  });

  // If obligation provided, mark it fulfilled
  if (obligationId) {
    await prisma.perDeliveryObligation.update({
      where: { id: obligationId },
      data: {
        status: "fulfilled",
        documentId: doc.id,
        fulfilledAt: new Date(),
      },
    });
  }

  // Recompute status
  const allDocs = await prisma.supplierDocument.findMany({
    where: { supplierId: params.id },
    include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
  });
  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const pendingCount = await prisma.perDeliveryObligation.count({ where: { supplierId: params.id, status: "pending" } });
  const computedStatus = computeSupplierStatus(allDocs, requirements, pendingCount);
  await prisma.supplier.update({ where: { id: params.id }, data: { status: computedStatus } });

  return NextResponse.json(doc, { status: 201 });
}
