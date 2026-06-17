import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brands = await prisma.supplierBrand.findMany({
    where: { supplierId: params.id },
    orderBy: { brandName: "asc" },
  });

  return NextResponse.json(brands);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { brandName, description } = await req.json();
  if (!brandName?.trim()) return NextResponse.json({ error: "brandName is required" }, { status: 400 });

  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const brand = await prisma.supplierBrand.create({
    data: {
      supplierId: params.id,
      brandName: brandName.trim(),
      description: description?.trim() || null,
    },
  });

  return NextResponse.json(brand, { status: 201 });
}
