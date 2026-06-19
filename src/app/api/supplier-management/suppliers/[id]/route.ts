import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSupplierStatus } from "@/lib/supplier-status";
import { filterApplicableRequirements, type MaterialAttrs } from "@/lib/document-trigger";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      materials: {
        include: {
          material: {
            select: { id: true, name: true, category: true, materialType: true, isOrganic: true, isAllergen: true, isGlutenFree: true, hasSpecialRisk: true, specialRiskTypes: true, coaRequired: true },
          },
        },
      },
      documents: {
        include: { requirement: true },
        orderBy: { uploadedAt: "desc" },
      },
      statusLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      perDeliveryObligations: {
        include: {
          material: { select: { id: true, name: true } },
          receivingRecord: { select: { id: true, recordNumber: true, date: true } },
          requirement: { select: { id: true, name: true } },
          document: { select: { id: true, fileName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allRequirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const matAttrs = supplier.materials.map((link) => link.material as MaterialAttrs);
  const applicable = filterApplicableRequirements(allRequirements, matAttrs);
  const pendingCount = await prisma.perDeliveryObligation.count({ where: { supplierId: params.id, status: "pending" } });
  const computedStatus = computeSupplierStatus(supplier.documents, applicable, pendingCount);
  if (computedStatus !== supplier.status) {
    await prisma.supplier.update({ where: { id: supplier.id }, data: { status: computedStatus } });
  }

  return NextResponse.json({ ...supplier, status: computedStatus });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check if system-locked
  const existing = await prisma.supplier.findUnique({ where: { id: params.id }, select: { isSystemLocked: true } });
  if (existing?.isSystemLocked) {
    return NextResponse.json({ error: "This supplier record is system-locked and cannot be modified" }, { status: 403 });
  }

  const body = await req.json();
  const { name, contactName, email, phone, address, notes, isActive, materialIds } = body;

  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(contactName !== undefined ? { contactName } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(materialIds !== undefined
        ? {
            materials: {
              deleteMany: {},
              create: (materialIds as string[]).map((mid) => ({ materialId: mid })),
            },
          }
        : {}),
    },
    include: {
      materials: {
        include: {
          material: {
            select: { id: true, name: true, category: true, materialType: true, isOrganic: true, isAllergen: true, isGlutenFree: true, hasSpecialRisk: true, specialRiskTypes: true, coaRequired: true },
          },
        },
      },
      documents: { include: { requirement: true }, orderBy: { uploadedAt: "desc" } },
    },
  });

  const allRequirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const matAttrs = supplier.materials.map((link) => link.material as MaterialAttrs);
  const applicable = filterApplicableRequirements(allRequirements, matAttrs);
  const pendingCount = await prisma.perDeliveryObligation.count({ where: { supplierId: params.id, status: "pending" } });
  const computedStatus = computeSupplierStatus(supplier.documents, applicable, pendingCount);
  if (computedStatus !== supplier.status) {
    await prisma.supplier.update({ where: { id: supplier.id }, data: { status: computedStatus } });
  }

  return NextResponse.json({ ...supplier, status: computedStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Block deletion of system-locked suppliers
  const target = await prisma.supplier.findUnique({ where: { id: params.id }, select: { isSystemLocked: true } });
  if (target?.isSystemLocked) {
    return NextResponse.json({ error: "This supplier record is system-locked and cannot be deleted" }, { status: 403 });
  }

  // Soft-delete: set isActive = false
  await prisma.supplier.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
