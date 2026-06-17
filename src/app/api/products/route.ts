import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProductFields, type RecipeItem, type PresentationItem } from "@/lib/product-compute";

export const dynamic = "force-dynamic";

// GET /api/products
// Optional filters: ?materialId=xxx (products containing this material)
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const materialId = searchParams.get("materialId");

    if (materialId) {
      // Recipe ingredient matches
      const recipeRows = await prisma.$queryRawUnsafe<
        Array<{ id: string; name: string; category: string | null }>
      >(
        `SELECT id, name, category
         FROM products
         WHERE "isActive" = true
           AND recipe @> $1::jsonb
         ORDER BY name ASC`,
        JSON.stringify([{ materialId }])
      );

      // Presentation packaging matches (search within nested packaging_materials arrays)
      const pkgRows = await prisma.$queryRawUnsafe<
        Array<{ id: string; name: string; category: string | null; presentationName: string | null }>
      >(
        `SELECT DISTINCT p.id, p.name, p.category, (presentation->>'name') AS "presentationName"
         FROM products p,
           jsonb_array_elements(COALESCE(p.presentations, '[]'::jsonb)) AS presentation,
           jsonb_array_elements(COALESCE(presentation->'packaging_materials', '[]'::jsonb)) AS pkg_mat
         WHERE p."isActive" = true
           AND pkg_mat->>'material_id' = $1
         ORDER BY p.name ASC`,
        materialId
      );

      const out: Array<{
        id: string; name: string; category: string | null;
        role: "ingredient" | "packaging"; presentationName: string | null;
      }> = [];
      for (const r of recipeRows) {
        out.push({ id: r.id, name: r.name, category: r.category, role: "ingredient", presentationName: null });
      }
      for (const r of pkgRows) {
        out.push({ id: r.id, name: r.name, category: r.category, role: "packaging", presentationName: r.presentationName ?? null });
      }
      out.sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
      return NextResponse.json(out);
    }

    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { templates: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    // Enrich recipe items with per-material attribute flags
    const allMaterialIds = Array.from(new Set(
      products.flatMap((p) =>
        (p.recipe as Array<{ materialId?: string }>).map((r) => r.materialId).filter((id): id is string => !!id)
      )
    ));
    const matAttrs = allMaterialIds.length > 0
      ? await prisma.material.findMany({
          where: { id: { in: allMaterialIds } },
          select: { id: true, isAllergen: true, isOrganic: true, isGlutenFree: true, materialType: true, sourceProductId: true },
        })
      : [];
    const matMap = new Map(matAttrs.map((m) => [m.id, m]));

    const enriched = products.map((p) => ({
      ...p,
      recipe: (p.recipe as Array<{ materialId?: string } & Record<string, unknown>>).map((r) => ({
        ...r,
        isAllergen: matMap.get(r.materialId ?? "")?.isAllergen ?? false,
        isOrganic:  matMap.get(r.materialId ?? "")?.isOrganic  ?? false,
        isGlutenFree: matMap.get(r.materialId ?? "")?.isGlutenFree ?? false,
        materialType: matMap.get(r.materialId ?? "")?.materialType ?? "raw",
        sourceProductId: matMap.get(r.materialId ?? "")?.sourceProductId ?? null,
      })),
    }));

    return NextResponse.json(enriched);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/products]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

// POST /api/products
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { id: string; role: string };
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json();
    const { name, category, productCode, description, recipe, isActive, shelfLifeMonths, presentations, isWipMaterial } = body as {
      name?: string;
      category?: string | null;
      productCode?: string | null;
      description?: string | null;
      recipe?: RecipeItem[];
      isActive?: boolean;
      shelfLifeMonths?: number | null;
      presentations?: unknown[];
      isWipMaterial?: boolean;
    };

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const cleanRecipe: RecipeItem[] = Array.isArray(recipe) ? recipe : [];

    const computed = await computeProductFields(
      cleanRecipe,
      Array.isArray(presentations) ? (presentations as PresentationItem[]) : [],
    );

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        category: category?.trim() || null,
        productCode: productCode ? String(productCode).toUpperCase().trim() : null,
        description: description?.trim() || null,
        isActive: isActive ?? true,
        recipe: cleanRecipe,
        allergenProfile: computed.allergenProfile,
        isOrganic: computed.isOrganic,
        isGlutenFree: computed.isGlutenFree,
        supplierExposure: computed.supplierExposure,
        shelfLifeMonths: shelfLifeMonths != null ? Math.floor(shelfLifeMonths) : null,
        presentations: (Array.isArray(presentations) ? presentations : []) as Parameters<typeof prisma.product.create>[0]["data"]["presentations"],
        isWipMaterial: isWipMaterial ?? false,
        createdById: user.id,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/products]", msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
