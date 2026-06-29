import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/supplier-management/suppliers/[id]/materials
// Returns all materials linked to this supplier, sorted A→Z by name.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const links = await prisma.supplierMaterial.findMany({
    where: { supplierId: params.id },
    include: {
      material: {
        select: {
          id: true, name: true, unit: true, category: true,
          coaRequired: true, isTemperatureSensitive: true, hasSpecialRisk: true,
          isOrganic: true, isAllergen: true, allergens: true,
        },
      },
    },
    orderBy: { material: { name: "asc" } },
  });

  return NextResponse.json(links.map((l) => l.material));
}
