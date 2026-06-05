import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSupplierStatus } from "@/lib/supplier-status";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      materials: { include: { material: true } },
      documents: {
        include: { requirement: true },
        orderBy: { uploadedAt: "desc" },
      },
      statusLogs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const computedStatus = computeSupplierStatus(supplier.documents, requirements);
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

  const body = await req.json();
  const { name, manufacturerName, contactName, email, phone, address, notes, isActive, materialIds } = body;

  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(manufacturerName !== undefined ? { manufacturerName } : {}),
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
      materials: { include: { material: true } },
      documents: { include: { requirement: true }, orderBy: { uploadedAt: "desc" } },
    },
  });

  const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
  const computedStatus = computeSupplierStatus(supplier.documents, requirements);
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

  // Soft-delete: set isActive = false
  await prisma.supplier.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
