import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get("materialId");
  const rdIngredientId = searchParams.get("rdIngredientId");

  if (!materialId && !rdIngredientId) {
    return NextResponse.json({ error: "materialId or rdIngredientId required" }, { status: 400 });
  }

  const where = materialId ? { materialId } : { rdIngredientId: rdIngredientId! };

  const profile = await prisma.rdNutritionProfile.findUnique({ where });
  return NextResponse.json(profile ?? null);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role, id: userId } = session.user as { role: string; id: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const {
      materialId,
      rdIngredientId,
      ingredientName,
      caloriesPer100g,
      fatPer100g,
      saturatedFatPer100g,
      transFatPer100g,
      cholesterolPer100g,
      sodiumPer100g,
      carbsPer100g,
      fiberPer100g,
      sugarsPer100g,
      proteinPer100g,
      usdaFdcId,
      usdaFoodDescription,
      dataSource,
      containsAddedSugars,
    } = body;

    if (!materialId && !rdIngredientId) {
      return NextResponse.json({ error: "materialId or rdIngredientId required" }, { status: 400 });
    }
    if (!ingredientName?.trim()) {
      return NextResponse.json({ error: "ingredientName required" }, { status: 400 });
    }

    const num = (v: unknown) => (v != null && v !== "" ? Number(v) : null);

    const data = {
      ingredientName: ingredientName.trim(),
      caloriesPer100g: num(caloriesPer100g),
      fatPer100g: num(fatPer100g),
      saturatedFatPer100g: num(saturatedFatPer100g),
      transFatPer100g: num(transFatPer100g),
      cholesterolPer100g: num(cholesterolPer100g),
      sodiumPer100g: num(sodiumPer100g),
      carbsPer100g: num(carbsPer100g),
      fiberPer100g: num(fiberPer100g),
      sugarsPer100g: num(sugarsPer100g),
      proteinPer100g: num(proteinPer100g),
      usdaFdcId: usdaFdcId ?? null,
      usdaFoodDescription: usdaFoodDescription ?? null,
      dataSource: dataSource ?? "manual",
      containsAddedSugars: containsAddedSugars ?? false,
      createdById: userId,
    };

    const where = materialId ? { materialId } : { rdIngredientId: rdIngredientId! };
    const createExtra = materialId ? { materialId } : { rdIngredientId };

    const profile = await prisma.rdNutritionProfile.upsert({
      where,
      create: { ...data, ...createExtra },
      update: { ...data, updatedAt: new Date() },
    });

    return NextResponse.json(profile, { status: 200 });
  } catch (err) {
    console.error("[rd/nutrition/profile POST]", err);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
