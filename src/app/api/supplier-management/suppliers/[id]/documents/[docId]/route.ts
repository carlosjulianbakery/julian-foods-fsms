import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { del } from "@vercel/blob";
import { computeSupplierStatus } from "@/lib/supplier-status";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const doc = await prisma.supplierDocument.findUnique({ where: { id: params.docId } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete from Blob storage (best-effort)
  try { await del(doc.fileUrl); } catch { /* ignore if already gone */ }

  await prisma.supplierDocument.delete({ where: { id: params.docId } });

  // Recompute status
  const allDocs = await prisma.supplierDocument.findMany({
    where: { supplierId: params.id },
    include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
  });
  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const computedStatus = computeSupplierStatus(allDocs, requirements);
  await prisma.supplier.update({ where: { id: params.id }, data: { status: computedStatus } });

  return NextResponse.json({ success: true });
}
