import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeProductFields, type RecipeItem } from "@/lib/product-compute";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: {
        templates: { select: { id: true, name: true } },
        submissions: {
          select: {
            id: true,
            productionDate: true,
            productionLot: true,
            supervisorName: true,
            status: true,
            templateName: true,
          },
          orderBy: { submittedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/products/${params.id}]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { role: string };
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const existing = await prisma.product.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const { name, category, productCode, description, recipe, isActive } = body as {
      name?: string;
      category?: string | null;
      productCode?: string | null;
      description?: string | null;
      recipe?: RecipeItem[];
      isActive?: boolean;
    };

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }

    const cleanRecipe: RecipeItem[] = Array.isArray(recipe) ? recipe : [];
    const computed = await computeProductFields(cleanRecipe);

    const data: Record<string, unknown> = {
      ...(name !== undefined && { name: name.trim() }),
      ...(category !== undefined && { category: category?.trim() || null }),
      ...(productCode !== undefined && {
        productCode: productCode ? String(productCode).toUpperCase().trim() : null,
      }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(isActive !== undefined && { isActive }),
      ...(recipe !== undefined && {
        recipe: cleanRecipe,
        allergenProfile: computed.allergenProfile,
        isOrganic: computed.isOrganic,
        isGlutenFree: computed.isGlutenFree,
        supplierExposure: computed.supplierExposure,
      }),
    };

    const product = await prisma.product.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(product);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[PUT /api/products/${params.id}]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as { role: string };
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });

    const product = await prisma.product.findUnique({
      where: { id: params.id },
      include: { templates: { select: { id: true } } },
    });
    if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (product.templates.length > 0) {
      return NextResponse.json(
        { error: "Cannot deactivate — this product is linked to one or more batch sheet templates." },
        { status: 400 }
      );
    }

    await prisma.product.update({ where: { id: params.id }, data: { isActive: false } });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DELETE /api/products/${params.id}]`, msg);
    return NextResponse.json({ error: "Internal server error", detail: msg }, { status: 500 });
  }
}
