import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/supplier-management/materials/[id]/suppliers
 *
 * Returns all active suppliers linked to a specific material,
 * with their stored approval status. Used by the batch-sheet
 * supplier dropdown to pre-filter options to approved vendors.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.supplierMaterial.findMany({
    where: { materialId: params.id },
    include: {
      supplier: {
        select: {
          id: true, name: true, status: true, isActive: true,
          brands: {
            where: { isActive: true },
            select: { id: true, brandName: true },
            orderBy: { brandName: "asc" },
          },
        },
      },
    },
  });

  const suppliers = links
    .filter((l) => l.supplier.isActive)
    .map((l) => ({
      id:     l.supplier.id,
      name:   l.supplier.name,
      status: l.supplier.status as string,
      brands: l.supplier.brands,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json(suppliers);
}
