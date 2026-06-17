import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; brandId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { brandName, description, isActive } = await req.json();

  const brand = await prisma.supplierBrand.findFirst({
    where: { id: params.brandId, supplierId: params.id },
  });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const updated = await prisma.supplierBrand.update({
    where: { id: params.brandId },
    data: {
      ...(brandName !== undefined && { brandName: brandName.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; brandId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const brand = await prisma.supplierBrand.findFirst({
    where: { id: params.brandId, supplierId: params.id },
  });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  await prisma.supplierBrand.delete({ where: { id: params.brandId } });

  return NextResponse.json({ success: true });
}
