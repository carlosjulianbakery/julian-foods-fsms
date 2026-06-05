import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/supplier-management/suppliers/[id]/products
// Returns the products whose supplierExposure contains the given supplierId.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supplierId = params.id;

    // JSONB containment query — finds products whose supplierExposure has an entry with this supplierId
    const rows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        supplierExposure: Array<{ supplierId: string; supplierName: string; materialName: string; supplierStatus: string }>;
      }>
    >(
      `SELECT id, name, "supplierExposure"
       FROM products
       WHERE "isActive" = true
         AND "supplierExposure" @> $1::jsonb
       ORDER BY name ASC`,
      JSON.stringify([{ supplierId }])
    );

    // Flatten — one row per product+material affected by this supplier
    const out: Array<{ id: string; name: string; materialName: string; supplierStatus: string }> = [];
    for (const p of rows) {
      const exposures = Array.isArray(p.supplierExposure) ? p.supplierExposure : [];
      for (const e of exposures) {
        if (e.supplierId === supplierId) {
          out.push({
            id: p.id,
            name: p.name,
            materialName: e.materialName,
            supplierStatus: e.supplierStatus,
          });
        }
      }
    }

    return NextResponse.json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/supplier-management/suppliers/${params.id}/products]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
