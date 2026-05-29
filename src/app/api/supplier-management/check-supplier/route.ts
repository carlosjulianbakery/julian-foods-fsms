import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSupplierStatus } from "@/lib/supplier-status";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "";

  if (!name) return NextResponse.json({ found: false, status: null });

  const supplier = await prisma.supplier.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, isActive: true },
    include: {
      documents: {
        include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  if (!supplier) return NextResponse.json({ found: false, status: null, name });

  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const computedStatus = computeSupplierStatus(supplier.documents, requirements);

  return NextResponse.json({
    found: true,
    supplierId: supplier.id,
    name: supplier.name,
    status: computedStatus,
  });
}
