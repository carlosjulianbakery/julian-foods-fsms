import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const EXPIRING_SOON_DAYS = 30;

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const soonThreshold = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);

  // Expired documents (from active suppliers)
  const expired = await prisma.supplierDocument.findMany({
    where: {
      expiresAt: { lt: now },
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      requirement: { select: { id: true, name: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  // Expiring-soon documents
  const expiringSoon = await prisma.supplierDocument.findMany({
    where: {
      expiresAt: { gte: now, lte: soonThreshold },
      supplier: { isActive: true },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      requirement: { select: { id: true, name: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  // Suppliers missing required documents
  const activeSuppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: {
      documents: { select: { requirementId: true } },
    },
  });
  const requiredReqs = await prisma.documentRequirement.findMany({
    where: { isActive: true, isRequired: true },
  });

  const missingDocs: { supplier: { id: string; name: string }; requirement: { id: string; name: string } }[] = [];
  for (const sup of activeSuppliers) {
    const uploadedReqIds = new Set(sup.documents.map((d) => d.requirementId));
    for (const req of requiredReqs) {
      if (!uploadedReqIds.has(req.id)) {
        missingDocs.push({
          supplier: { id: sup.id, name: sup.name },
          requirement: { id: req.id, name: req.name },
        });
      }
    }
  }

  return NextResponse.json({ expired, expiringSoon, missingDocs });
}
