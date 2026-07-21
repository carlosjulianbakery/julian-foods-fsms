import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { convertToBase } from "@/lib/unitConversion";

export const dynamic = "force-dynamic";

interface RecipeRow {
  ingredientType: string;
  name: string;
  quantity: number | null;
  unit: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { role } = session.user as { role: string };
  if (role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { iterationId, servingSize, servingSizeLabel, servingsPerContainer, addedSugarsPerServing } = body as {
      iterationId: string;
      servingSize: number;
      servingSizeLabel: string;
      servingsPerContainer: number;
      addedSugarsPerServing: number;
    };

    if (!iterationId || !servingSize || servingSize <= 0) {
      return NextResponse.json({ error: "iterationId and positive servingSize required" }, { status: 400 });
    }

    const iter = await prisma.rdIteration.findUnique({
      where: { id: iterationId },
      select: { recipe: true },
    });
    if (!iter) return NextResponse.json({ error: "Iteration not found" }, { status: 404 });

    const recipe = (iter.recipe as unknown as RecipeRow[]) ?? [];

    // Resolve ingredient names to IDs
    const materialNames = recipe
      .filter((i) => i.ingredientType === "material")
      .map((i) => i.name);
    const rdNames = recipe
      .filter((i) => i.ingredientType === "rd_ingredient")
      .map((i) => i.name);

    const [materials, rdIngredients] = await Promise.all([
      materialNames.length > 0
        ? prisma.material.findMany({ where: { name: { in: materialNames } }, select: { id: true, name: true } })
        : [],
      rdNames.length > 0
        ? prisma.rdIngredient.findMany({ where: { name: { in: rdNames } }, select: { id: true, name: true } })
        : [],
    ]);

    const matIdByName = new Map(materials.map((m) => [m.name, m.id]));
    const rdIdByName = new Map(rdIngredients.map((i) => [i.name, i.id]));

    // Gather unique IDs for profile lookup
    const materialIds: string[] = [];
    const rdIngredientIds: string[] = [];
    for (const ing of recipe) {
      if (ing.ingredientType === "material") {
        const id = matIdByName.get(ing.name);
        if (id && !materialIds.includes(id)) materialIds.push(id);
      } else if (ing.ingredientType === "rd_ingredient") {
        const id = rdIdByName.get(ing.name);
        if (id && !rdIngredientIds.includes(id)) rdIngredientIds.push(id);
      }
    }

    const [materialProfiles, rdProfiles] = await Promise.all([
      materialIds.length > 0
        ? prisma.rdNutritionProfile.findMany({ where: { materialId: { in: materialIds } } })
        : [],
      rdIngredientIds.length > 0
        ? prisma.rdNutritionProfile.findMany({ where: { rdIngredientId: { in: rdIngredientIds } } })
        : [],
    ]);

    const profileByMaterialId = new Map(materialProfiles.map((p) => [p.materialId!, p]));
    const profileByRdIngredientId = new Map(rdProfiles.map((p) => [p.rdIngredientId!, p]));

    // Calculate totals
    const totals = {
      calories: 0, fat: 0, saturatedFat: 0, transFat: 0,
      cholesterol: 0, sodium: 0, carbs: 0, fiber: 0, sugars: 0, protein: 0,
    };
    let totalRecipeWeightG = 0;
    const breakdown: Array<{
      ingredientName: string;
      quantityG: number;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }> = [];
    const missingProfiles: Array<{ ingredientName: string; ingredientType: string; id: string }> = [];
    const warnings: string[] = [];
    const WEIGHT_UNITS = new Set(["g", "kg", "lb", "lbs", "oz"]);

    for (const ing of recipe) {
      if (ing.quantity == null || !ing.unit) continue;
      const qG = convertToBase(ing.quantity, ing.unit);
      if (qG <= 0) continue;

      if (WEIGHT_UNITS.has(ing.unit.trim().toLowerCase())) {
        totalRecipeWeightG += qG;
      }

      let profile = null;
      const matId = ing.ingredientType === "material" ? matIdByName.get(ing.name) : null;
      const rdId = ing.ingredientType === "rd_ingredient" ? rdIdByName.get(ing.name) : null;

      if (matId) profile = profileByMaterialId.get(matId) ?? null;
      else if (rdId) profile = profileByRdIngredientId.get(rdId) ?? null;

      if (!profile) {
        missingProfiles.push({
          ingredientName: ing.name,
          ingredientType: ing.ingredientType,
          id: matId ?? rdId ?? ing.name,
        });
        continue;
      }

      const scale = qG / 100;
      const cal = Number(profile.caloriesPer100g ?? 0) * scale;
      const fat = Number(profile.fatPer100g ?? 0) * scale;
      const satFat = Number(profile.saturatedFatPer100g ?? 0) * scale;
      const transFat = Number(profile.transFatPer100g ?? 0) * scale;
      const chol = Number(profile.cholesterolPer100g ?? 0) * scale;
      const sodium = Number(profile.sodiumPer100g ?? 0) * scale;
      const carbs = Number(profile.carbsPer100g ?? 0) * scale;
      const fiber = Number(profile.fiberPer100g ?? 0) * scale;
      const sugars = Number(profile.sugarsPer100g ?? 0) * scale;
      const protein = Number(profile.proteinPer100g ?? 0) * scale;

      totals.calories += cal;
      totals.fat += fat;
      totals.saturatedFat += satFat;
      totals.transFat += transFat;
      totals.cholesterol += chol;
      totals.sodium += sodium;
      totals.carbs += carbs;
      totals.fiber += fiber;
      totals.sugars += sugars;
      totals.protein += protein;

      breakdown.push({
        ingredientName: ing.name,
        quantityG: Math.round(qG * 10) / 10,
        calories: Math.round(cal * 10) / 10,
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
      });
    }

    if (totalRecipeWeightG <= 0) {
      return NextResponse.json({ error: "Recipe has no weight-based ingredients" }, { status: 400 });
    }

    if (missingProfiles.length > 0) {
      warnings.push(
        `Calculation excludes ${missingProfiles.length} ingredient(s) with no nutritional profile.`
      );
    }

    const ratio = servingSize / totalRecipeWeightG;
    const rnd = (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

    const perServing = {
      calories: rnd(totals.calories * ratio, 0),
      fat: rnd(totals.fat * ratio, 1),
      saturatedFat: rnd(totals.saturatedFat * ratio, 1),
      transFat: rnd(totals.transFat * ratio, 1),
      cholesterol: rnd(totals.cholesterol * ratio, 0),
      sodium: rnd(totals.sodium * ratio, 0),
      carbs: rnd(totals.carbs * ratio, 1),
      fiber: rnd(totals.fiber * ratio, 1),
      sugars: rnd(totals.sugars * ratio, 1),
      addedSugars: rnd(addedSugarsPerServing ?? 0, 1),
      protein: rnd(totals.protein * ratio, 1),
    };

    return NextResponse.json({
      perServing,
      breakdown,
      totalRecipeWeightG: rnd(totalRecipeWeightG, 1),
      servingSize,
      servingSizeLabel,
      servingsPerContainer,
      missingProfiles,
      warnings,
    });
  } catch (err) {
    console.error("[rd/nutrition/calculate]", err);
    return NextResponse.json({ error: "Calculation failed" }, { status: 500 });
  }
}
