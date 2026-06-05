import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSupplierStatus } from "@/lib/supplier-status";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const q = searchParams.get("q") ?? "";

  const suppliers = await prisma.supplier.findMany({
    where: {
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      materials: {
        include: { material: { select: { id: true, name: true, category: true } } },
      },
      documents: {
        include: { requirement: { select: { id: true, name: true, requirementType: true, isRequired: true } } },
        orderBy: { uploadedAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  // Recompute status dynamically
  const withStatus = await Promise.all(
    suppliers.map(async (s) => {
      const requirements = await prisma.documentRequirement.findMany({ where: { isActive: true } });
      const computedStatus = computeSupplierStatus(s.documents, requirements);
      if (computedStatus !== s.status) {
        await prisma.supplier.update({ where: { id: s.id }, data: { status: computedStatus } });
      }
      return { ...s, status: computedStatus };
    })
  );

  const filtered = status ? withStatus.filter((s) => s.status === status) : withStatus;
  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { name, manufacturerName, contactName, email, phone, address, notes, materialIds } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const supplier = await prisma.supplier.create({
    data: {
      name,
      manufacturerName: manufacturerName ?? null,
      contactName: contactName ?? null,
      email: email ?? null,
      phone: phone ?? null,
      address: address ?? null,
      notes: notes ?? null,
      status: "PENDING",
      materials: materialIds?.length
        ? { create: (materialIds as string[]).map((mid) => ({ materialId: mid })) }
        : undefined,
    },
    include: {
      materials: { include: { material: true } },
    },
  });

  return NextResponse.json(supplier, { status: 201 });
}
