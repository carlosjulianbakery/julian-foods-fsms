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
  const requirementId = formData.get("requirementId") as string;
  const expiresAt = formData.get("expiresAt") as string | null;
  const notes = formData.get("notes") as string | null;

  if (!file || !requirementId) {
    return NextResponse.json({ error: "file and requirementId are required" }, { status: 400 });
  }

  // Upload to private Vercel Blob store
  const blobPathname = `supplier-docs/${params.id}/${requirementId}/${Date.now()}-${file.name}`;
  const blob = await put(blobPathname, file, { access: "private" });

  const doc = await prisma.supplierDocument.create({
    data: {
      supplierId: params.id,
      requirementId,
      fileName: file.name,
      fileUrl: blob.url,
      fileSize: file.size,
      mimeType: file.type,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes ?? null,
    },
    include: { requirement: true },
  });

  // Recompute status
  const allDocs = await prisma.supplierDocument.findMany({
    where: { supplierId: params.id },
    include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
  });
  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const computedStatus = computeSupplierStatus(allDocs, requirements);
  await prisma.supplier.update({ where: { id: params.id }, data: { status: computedStatus } });

  return NextResponse.json(doc, { status: 201 });
}
