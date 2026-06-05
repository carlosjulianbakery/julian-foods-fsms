import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProductFields, type RecipeItem } from "@/lib/product-compute";

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
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          name: string;
          category: string | null;
          productCode: string | null;
          isActive: boolean;
        }>
      >(
        `SELECT id, name, category, "productCode", "isActive"
         FROM products
         WHERE "isActive" = true
           AND recipe @> $1::jsonb
         ORDER BY name ASC`,
        JSON.stringify([{ materialId }])
      );
      return NextResponse.json(rows);
    }

    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: { templates: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(products);
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
    const { name, category, productCode, description, recipe, isActive } = body as {
      name?: string;
      category?: string | null;
      productCode?: string | null;
      description?: string | null;
      recipe?: RecipeItem[];
      isActive?: boolean;
    };

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const cleanRecipe: RecipeItem[] = Array.isArray(recipe) ? recipe : [];

    const computed = await computeProductFields(cleanRecipe);

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
