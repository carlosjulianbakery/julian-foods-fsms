import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/supplier-management/suppliers/[id]/products
// Returns the products that use any material linked to this supplier (ingredient or packaging).
// Queries live through SupplierMaterial → product recipe/presentations JSON, so it always
// reflects current supplier-material assignments without waiting for a product save.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supplierId = params.id;

    // Live query — materials currently linked to this supplier
    const supplierMaterialLinks = await prisma.supplierMaterial.findMany({
      where: { supplierId },
      include: {
        material: { select: { id: true, name: true } },
        supplier: { select: { status: true } },
      },
    });

    if (supplierMaterialLinks.length === 0) {
      return NextResponse.json([]);
    }

    const materialIds = supplierMaterialLinks.map((sm) => sm.materialId);
    const supplierStatus = supplierMaterialLinks[0].supplier.status;
    const matNameById = new Map(supplierMaterialLinks.map((sm) => [sm.materialId, sm.material.name]));
    const materialIdsJson = JSON.stringify(materialIds);

    type RawRow = {
      id: string;
      name: string;
      material_id: string;
      material_type: string;
      presentation_name: string | null;
    };

    // Products using these materials as recipe ingredients
    const ingredientRows = await prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT p.id, p.name,
              elem->>'materialId' AS material_id,
              'ingredient' AS material_type,
              NULL::text AS presentation_name
       FROM products p,
            jsonb_array_elements(p.recipe) AS elem
       WHERE p."isActive" = true
         AND elem->>'materialId' = ANY(ARRAY(SELECT jsonb_array_elements_text($1::jsonb)))`,
      materialIdsJson,
    );

    // Products using these materials as packaging in presentations
    const packagingRows = await prisma.$queryRawUnsafe<RawRow[]>(
      `SELECT p.id, p.name,
              pkg->>'material_id' AS material_id,
              'packaging' AS material_type,
              pres->>'name' AS presentation_name
       FROM products p,
            jsonb_array_elements(p.presentations) AS pres,
            jsonb_array_elements(pres->'packaging_materials') AS pkg
       WHERE p."isActive" = true
         AND pkg->>'material_id' = ANY(ARRAY(SELECT jsonb_array_elements_text($1::jsonb)))`,
      materialIdsJson,
    );

    // Merge, deduplicate, sort
    const seen = new Set<string>();
    const combined: RawRow[] = [];
    for (const row of [...ingredientRows, ...packagingRows]) {
      const key = `${row.id}|${row.material_id}|${row.material_type}|${row.presentation_name ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(row);
      }
    }
    combined.sort((a, b) => a.name.localeCompare(b.name));

    const out = combined.map((r) => ({
      id: r.id,
      name: r.name,
      materialName: matNameById.get(r.material_id) ?? r.material_id,
      supplierStatus,
      materialType: r.material_type,
      presentationName: r.presentation_name,
    }));

    return NextResponse.json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/supplier-management/suppliers/${params.id}/products]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
